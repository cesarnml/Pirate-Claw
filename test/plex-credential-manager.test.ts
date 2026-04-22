import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { MovieBreakdown } from '../src/movie-api-types';
import { loadConfig } from '../src/config';
import { PlexAuthStore } from '../src/plex/auth';
import {
  PlexCredentialManager,
  RenewingPlexHttpClient,
} from '../src/plex/credential-manager';
import { refreshMovieLibraryCache } from '../src/plex/movies';
import { ensureSchema, openDatabase } from '../src/repository';

const tempDirs: string[] = [];
const openDatabases: Database[] = [];

describe('Plex credential renewal', () => {
  afterEach(async () => {
    while (openDatabases.length > 0) {
      openDatabases.pop()?.close();
    }

    while (tempDirs.length > 0) {
      const directory = tempDirs.pop();
      if (directory) {
        await Bun.$`rm -rf ${directory}`;
      }
    }
  });

  it('rotates the stored Plex credential on successful silent renewal', async () => {
    const { configPath, database, configHolder } = await createRenewalHarness();
    const store = new PlexAuthStore(database);
    const identity = store.ensureIdentity('2026-04-22T09:00:00.000Z');
    store.completeRenewal('old-plex-token', {
      authenticatedAt: '2026-04-22T09:00:00.000Z',
    });

    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation((async (
      input: RequestInfo | URL,
    ) => {
      const url = String(input);
      if (url.endsWith('/api/v2/auth/nonce')) {
        return new Response(JSON.stringify({ nonce: 'renewal-nonce' }), {
          status: 200,
        });
      }
      if (url.endsWith('/api/v2/auth/token')) {
        return new Response(JSON.stringify({ auth_token: 'new-plex-token' }), {
          status: 200,
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch);

    const manager = new PlexCredentialManager({
      database,
      configPath,
      configHolder,
      log: () => {},
    });

    await manager.startupRenew();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(configHolder.current.plex?.token).toBe('new-plex-token');
    expect(store.getSnapshot('2026-04-22T09:05:00.000Z')).toMatchObject({
      state: 'connected',
      identity: {
        clientIdentifier: identity.clientIdentifier,
        refreshToken: 'new-plex-token',
      },
    });

    const disk = (await Bun.file(configPath).json()) as {
      plex?: { token?: string };
    };
    expect(disk.plex?.token).toBe('new-plex-token');
    fetchMock.mockRestore();
  });

  it('moves renewal failures into reconnect-required state without throwing', async () => {
    const { configPath, database, configHolder } = await createRenewalHarness();
    const store = new PlexAuthStore(database);
    store.ensureIdentity('2026-04-22T09:00:00.000Z');
    store.completeRenewal('old-plex-token', {
      authenticatedAt: '2026-04-22T09:00:00.000Z',
    });

    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
      (async () =>
        new Response(JSON.stringify({ error: 'unavailable' }), {
          status: 503,
        })) as unknown as typeof fetch,
    );

    const manager = new PlexCredentialManager({
      database,
      configPath,
      configHolder,
      log: () => {},
    });

    await manager.startupRenew();

    fetchMock.mockRestore();
    expect(store.getSnapshot('2026-04-22T09:05:00.000Z')).toMatchObject({
      state: 'error_reconnect_required',
      identity: {
        reconnectRequiredReason: 'error',
      },
    });
    expect(configHolder.current.plex?.token).toBe('old-plex-token');
  });

  it('lets Plex enrichment fail closed when renewal cannot recover auth', async () => {
    const { configPath, database, configHolder } = await createRenewalHarness();
    const store = new PlexAuthStore(database);
    store.ensureIdentity('2026-04-22T09:00:00.000Z');
    store.completeRenewal('old-plex-token', {
      authenticatedAt: '2026-04-22T09:00:00.000Z',
    });

    let callCount = 0;
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation((async (
      input: RequestInfo | URL,
    ) => {
      callCount += 1;
      const url = String(input);
      if (url.endsWith('/api/v2/auth/nonce')) {
        return new Response(JSON.stringify({ error: 'unavailable' }), {
          status: 503,
        });
      }
      return new Response('unauthorized', { status: 401 });
    }) as unknown as typeof fetch);

    const logMessages: string[] = [];
    const manager = new PlexCredentialManager({
      database,
      configPath,
      configHolder,
      log: (message) => logMessages.push(message),
    });
    const client = new RenewingPlexHttpClient({
      baseUrl: configHolder.current.plex!.url,
      manager,
      log: (message) => logMessages.push(message),
    });

    const cache = {
      rows: [] as Array<{ title: string; inLibrary: boolean }>,
      upsertMovie(row: { title: string; inLibrary: boolean }) {
        this.rows.push(row);
      },
    };
    const movie: MovieBreakdown = {
      normalizedTitle: 'Severance',
      year: 2022,
      identityKey: 'movie-1',
      status: 'queued',
      plexStatus: 'unknown',
      watchCount: null,
      lastWatchedAt: null,
    };

    await refreshMovieLibraryCache([movie], {
      cache: cache as never,
      client,
      refreshIntervalMinutes: 30,
      log: (message) => logMessages.push(message),
    });

    expect(callCount).toBeGreaterThanOrEqual(5);
    expect(cache.rows).toEqual([
      expect.objectContaining({ title: 'Severance', inLibrary: false }),
    ]);
    expect(store.getSnapshot('2026-04-22T09:05:00.000Z').state).toBe(
      'expired_reconnect_required',
    );
    fetchMock.mockRestore();
  });
});

async function createRenewalHarness(): Promise<{
  configPath: string;
  database: Database;
  configHolder: { current: Awaited<ReturnType<typeof loadConfig>> };
}> {
  const directory = await mkdtemp(join(tmpdir(), 'pirate-claw-plex-renew-'));
  tempDirs.push(directory);
  const configPath = join(directory, 'pirate-claw.config.json');
  await Bun.write(
    configPath,
    `${JSON.stringify(
      {
        feeds: [],
        tv: [],
        transmission: {
          url: 'http://localhost:9091/transmission/rpc',
          username: 'user',
          password: 'pass',
        },
        runtime: {
          runIntervalMinutes: 15,
          reconcileIntervalSeconds: 30,
          artifactDir: '.pirate-claw/runtime',
          artifactRetentionDays: 7,
          apiWriteToken: 'write-token',
        },
        plex: {
          url: 'http://localhost:32400',
          token: 'old-plex-token',
          refreshIntervalMinutes: 30,
        },
      },
      null,
      2,
    )}\n`,
  );

  const config = await loadConfig(configPath);
  const configHolder = { current: config };
  const database = openDatabase(join(dirname(configPath), 'pirate-claw.db'));
  openDatabases.push(database);
  ensureSchema(database);

  return { configPath, database, configHolder };
}
