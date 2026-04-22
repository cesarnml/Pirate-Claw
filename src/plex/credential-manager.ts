import type { Database } from 'bun:sqlite';
import { randomUUID } from 'node:crypto';
import { renameSync, writeFileSync } from 'node:fs';

import type { AppConfig } from '../config';
import { loadConfigEnv, validateConfig } from '../config';
import { PlexAuthStore } from './auth';
import { refreshPlexAuthToken } from './auth-client';
import type { PlexLibrarySection, PlexSearchResult } from './client';
import { PlexHttpClient } from './client';

const PLEX_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export type PlexRenewReason = 'startup' | 'first_touch' | 'auth_failure';

export class PlexCredentialManager {
  private renewalInFlight: Promise<string | null> | null = null;
  private firstTouchAttempted = false;

  constructor(
    private readonly input: {
      database: Database;
      configPath: string;
      configHolder: { current: AppConfig };
      log: (message: string) => void;
    },
  ) {}

  async startupRenew(): Promise<void> {
    await this.bestEffortRenew('startup');
  }

  async ensureTokenForRequest(): Promise<string | null> {
    if (!this.firstTouchAttempted) {
      this.firstTouchAttempted = true;
      await this.bestEffortRenew('first_touch');
    }

    return this.input.configHolder.current.plex?.token ?? null;
  }

  async refreshAfterAuthFailure(): Promise<string | null> {
    return this.runRenewal('auth_failure');
  }

  private async bestEffortRenew(
    reason: Exclude<PlexRenewReason, 'auth_failure'>,
  ): Promise<void> {
    await this.runRenewal(reason);
  }

  private async runRenewal(reason: PlexRenewReason): Promise<string | null> {
    if (this.renewalInFlight) {
      return this.renewalInFlight;
    }

    const renewal = this.performRenewal(reason).finally(() => {
      this.renewalInFlight = null;
    });
    this.renewalInFlight = renewal;
    return renewal;
  }

  private async performRenewal(
    reason: PlexRenewReason,
  ): Promise<string | null> {
    const currentConfig = this.input.configHolder.current;
    if (!currentConfig.plex) {
      return null;
    }

    const store = new PlexAuthStore(this.input.database);
    const identity = store.getIdentity();
    if (!identity?.privateKeyPem || !identity.keyId) {
      if (reason === 'auth_failure') {
        store.markReconnectRequired(
          'expired',
          'Plex token expired and no renewable device identity is stored.',
        );
        await this.persistCurrentToken('');
        return null;
      }
      return currentConfig.plex.token || null;
    }

    store.beginRenewal();

    try {
      const now = new Date();
      const authToken = await refreshPlexAuthToken({
        clientIdentifier: identity.clientIdentifier,
        identity,
        now,
      });
      store.completeRenewal(authToken, {
        tokenExpiresAt: new Date(
          now.getTime() + PLEX_TOKEN_LIFETIME_MS,
        ).toISOString(),
        authenticatedAt: now.toISOString(),
      });
      await this.persistCurrentToken(authToken);
      return authToken;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const reconnectReason = reason === 'auth_failure' ? 'expired' : 'error';
      store.markReconnectRequired(reconnectReason, message);
      this.input.log(`[plex-auth] ${reason} renewal failed: ${message}`);

      if (reason === 'auth_failure') {
        await this.persistCurrentToken('');
        return null;
      }

      return this.input.configHolder.current.plex?.token ?? null;
    }
  }

  private async persistCurrentToken(token: string): Promise<void> {
    const baseOnDisk = await readConfigFileRecord(this.input.configPath);
    const diskPlex =
      typeof baseOnDisk.plex === 'object' &&
      baseOnDisk.plex !== null &&
      !Array.isArray(baseOnDisk.plex)
        ? (baseOnDisk.plex as Record<string, unknown>)
        : {};
    const currentConfig = this.input.configHolder.current;
    const merged = {
      ...baseOnDisk,
      plex: {
        ...diskPlex,
        url:
          optionalStringValue(diskPlex.url) ??
          currentConfig.plex?.url ??
          'http://localhost:32400',
        token,
        refreshIntervalMinutes:
          optionalNonNegativeNumber(diskPlex.refreshIntervalMinutes) ??
          currentConfig.plex?.refreshIntervalMinutes ??
          30,
      },
    };

    const validated = validateConfig(
      merged,
      'config',
      await loadConfigEnv(this.input.configPath),
    );
    writeConfigAtomically(this.input.configPath, merged);
    this.input.configHolder.current = validated;
  }
}

export class RenewingPlexHttpClient extends PlexHttpClient {
  constructor(
    private readonly input: {
      baseUrl: string;
      manager: PlexCredentialManager;
      log: (message: string) => void;
      timeoutMs?: number;
    },
  ) {
    super(input.baseUrl, '', input.log, input.timeoutMs);
  }

  override async listLibrarySections(): Promise<PlexLibrarySection[]> {
    return this.runWithRenewal((client) => client.listLibrarySections(), []);
  }

  override async searchMovies(
    title: string,
  ): Promise<PlexSearchResult[] | null> {
    return this.runWithRenewal((client) => client.searchMovies(title), null);
  }

  override async searchShows(
    title: string,
  ): Promise<PlexSearchResult[] | null> {
    return this.runWithRenewal((client) => client.searchShows(title), null);
  }

  override async searchLibrary(
    sectionKey: string,
    title: string,
  ): Promise<PlexSearchResult[]> {
    return this.runWithRenewal(
      (client) => client.searchLibrary(sectionKey, title),
      [],
    );
  }

  override async listAllTvShowsForMatching(): Promise<PlexSearchResult[]> {
    return this.runWithRenewal(
      (client) => client.listAllTvShowsForMatching(),
      [],
    );
  }

  override async listAllMoviesForMatching(): Promise<PlexSearchResult[]> {
    return this.runWithRenewal(
      (client) => client.listAllMoviesForMatching(),
      [],
    );
  }

  private async runWithRenewal<T>(
    operation: (client: PlexHttpClient) => Promise<T>,
    fallback: T,
  ): Promise<T> {
    const token = await this.input.manager.ensureTokenForRequest();
    if (!token) {
      return fallback;
    }

    let result = await this.runWithToken(token, operation);
    if (result.failureKind === 'auth') {
      const renewedToken = await this.input.manager.refreshAfterAuthFailure();
      if (!renewedToken) {
        return fallback;
      }

      result = await this.runWithToken(renewedToken, operation);
    }

    return result.value;
  }

  private async runWithToken<T>(
    token: string,
    operation: (client: PlexHttpClient) => Promise<T>,
  ): Promise<{
    value: T;
    failureKind: ReturnType<PlexHttpClient['getLastFailureKind']>;
  }> {
    const client = new PlexHttpClient(
      this.input.baseUrl,
      token,
      this.input.log,
      this.input.timeoutMs,
    );
    const value = await operation(client);
    return { value, failureKind: client.getLastFailureKind() };
  }
}

async function readConfigFileRecord(
  path: string,
): Promise<Record<string, unknown>> {
  const parsed = await Bun.file(path).json();
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Config file must contain a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function writeConfigAtomically(
  path: string,
  config: Record<string, unknown>,
): void {
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  renameSync(tempPath, path);
}

function optionalStringValue(input: unknown): string | null {
  return typeof input === 'string' ? input : null;
}

function optionalNonNegativeNumber(input: unknown): number | null {
  if (typeof input !== 'number' || Number.isNaN(input) || input < 0) {
    return null;
  }
  return input;
}
