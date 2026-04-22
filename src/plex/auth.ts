import { randomUUID } from 'node:crypto';

import type { Database } from 'bun:sqlite';

export type PlexAuthState =
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'reconnect_required';

export type PlexAuthSessionStatus =
  | 'pending'
  | 'completed'
  | 'expired'
  | 'cancelled';

export type PlexAuthIdentity = {
  clientIdentifier: string;
  clientName: string;
  platformName: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  lastAuthenticatedAt: string | null;
  lastError: string | null;
  reconnectRequiredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlexAuthSession = {
  id: string;
  oauthState: string;
  codeVerifier: string;
  redirectUri: string;
  returnTo: string | null;
  openedAt: string;
  expiresAt: string;
  status: PlexAuthSessionStatus;
  completedAt: string | null;
  cancelledAt: string | null;
};

export type PlexAuthSnapshot = {
  state: PlexAuthState;
  identity: PlexAuthIdentity | null;
  pendingSession: PlexAuthSession | null;
};

export type CreatePlexAuthSessionInput = {
  oauthState: string;
  codeVerifier: string;
  redirectUri: string;
  returnTo?: string;
  expiresAt: string;
  openedAt?: string;
};

export type FinalizePlexAuthSessionInput = {
  refreshToken: string;
  tokenExpiresAt?: string;
  authenticatedAt?: string;
};

const PLEX_CLIENT_NAME = 'Pirate Claw';
const PLEX_PLATFORM_NAME = 'Pirate Claw Server';

export class PlexAuthStore {
  constructor(private readonly database: Database) {}

  ensureIdentity(now = new Date().toISOString()): PlexAuthIdentity {
    const existing = this.getIdentity();
    if (existing) {
      return existing;
    }

    const created: PlexAuthIdentity = {
      clientIdentifier: buildClientIdentifier(),
      clientName: PLEX_CLIENT_NAME,
      platformName: PLEX_PLATFORM_NAME,
      refreshToken: null,
      tokenExpiresAt: null,
      lastAuthenticatedAt: null,
      lastError: null,
      reconnectRequiredAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.database
      .query(
        `INSERT INTO plex_auth_identity (
          singleton,
          client_identifier,
          client_name,
          platform_name,
          refresh_token,
          token_expires_at,
          last_authenticated_at,
          last_error,
          reconnect_required_at,
          created_at,
          updated_at
        ) VALUES (1, ?1, ?2, ?3, NULL, NULL, NULL, NULL, NULL, ?4, ?4)`,
      )
      .run(
        created.clientIdentifier,
        created.clientName,
        created.platformName,
        now,
      );

    return created;
  }

  getIdentity(): PlexAuthIdentity | null {
    const row = this.database
      .query(
        `SELECT
          client_identifier AS clientIdentifier,
          client_name AS clientName,
          platform_name AS platformName,
          refresh_token AS refreshToken,
          token_expires_at AS tokenExpiresAt,
          last_authenticated_at AS lastAuthenticatedAt,
          last_error AS lastError,
          reconnect_required_at AS reconnectRequiredAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM plex_auth_identity
        WHERE singleton = 1`,
      )
      .get() as PlexAuthIdentity | null;

    return row ?? null;
  }

  createSession(input: CreatePlexAuthSessionInput): {
    identity: PlexAuthIdentity;
    session: PlexAuthSession;
  } {
    const openedAt = input.openedAt ?? new Date().toISOString();
    this.expirePendingSessions(openedAt);

    const identity = this.ensureIdentity(openedAt);
    const id = randomUUID();

    this.database
      .query(
        `INSERT INTO plex_auth_sessions (
          id,
          oauth_state,
          code_verifier,
          redirect_uri,
          return_to,
          opened_at,
          expires_at,
          status,
          completed_at,
          cancelled_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', NULL, NULL)`,
      )
      .run(
        id,
        input.oauthState,
        input.codeVerifier,
        input.redirectUri,
        input.returnTo ?? null,
        openedAt,
        input.expiresAt,
      );

    return {
      identity,
      session: this.getSessionOrThrow(id),
    };
  }

  expirePendingSessions(now = new Date().toISOString()): number {
    const result = this.database
      .query(
        `UPDATE plex_auth_sessions
        SET status = 'expired'
        WHERE status = 'pending' AND expires_at <= ?1`,
      )
      .run(now);

    return Number(result.changes ?? 0);
  }

  finalizeSession(
    sessionId: string,
    input: FinalizePlexAuthSessionInput,
  ): {
    identity: PlexAuthIdentity;
    session: PlexAuthSession;
  } {
    const authenticatedAt = input.authenticatedAt ?? new Date().toISOString();
    this.expirePendingSessions(authenticatedAt);

    const session = this.getSessionOrThrow(sessionId);
    if (session.status !== 'pending') {
      throw new Error(
        `Plex auth session "${sessionId}" is ${session.status} and cannot be finalized.`,
      );
    }

    const identity = this.ensureIdentity(authenticatedAt);

    this.database
      .query(
        `UPDATE plex_auth_identity
        SET refresh_token = ?1,
            token_expires_at = ?2,
            last_authenticated_at = ?3,
            last_error = NULL,
            reconnect_required_at = NULL,
            updated_at = ?3
        WHERE singleton = 1`,
      )
      .run(input.refreshToken, input.tokenExpiresAt ?? null, authenticatedAt);

    this.database
      .query(
        `UPDATE plex_auth_sessions
        SET status = 'completed',
            completed_at = ?2
        WHERE id = ?1`,
      )
      .run(sessionId, authenticatedAt);

    return {
      identity: {
        ...identity,
        refreshToken: input.refreshToken,
        tokenExpiresAt: input.tokenExpiresAt ?? null,
        lastAuthenticatedAt: authenticatedAt,
        lastError: null,
        reconnectRequiredAt: null,
        updatedAt: authenticatedAt,
      },
      session: this.getSessionOrThrow(sessionId),
    };
  }

  getSnapshot(now = new Date().toISOString()): PlexAuthSnapshot {
    this.expirePendingSessions(now);

    const identity = this.getIdentity();
    const pendingSession = this.getPendingSession(now);

    return {
      state: resolveAuthState(identity, pendingSession),
      identity,
      pendingSession,
    };
  }

  private getPendingSession(now: string): PlexAuthSession | null {
    const row = this.database
      .query(
        `SELECT
          id,
          oauth_state AS oauthState,
          code_verifier AS codeVerifier,
          redirect_uri AS redirectUri,
          return_to AS returnTo,
          opened_at AS openedAt,
          expires_at AS expiresAt,
          status,
          completed_at AS completedAt,
          cancelled_at AS cancelledAt
        FROM plex_auth_sessions
        WHERE status = 'pending' AND expires_at > ?1
        ORDER BY opened_at DESC
        LIMIT 1`,
      )
      .get(now) as PlexAuthSession | null;

    return row ?? null;
  }

  private getSessionOrThrow(sessionId: string): PlexAuthSession {
    const row = this.database
      .query(
        `SELECT
          id,
          oauth_state AS oauthState,
          code_verifier AS codeVerifier,
          redirect_uri AS redirectUri,
          return_to AS returnTo,
          opened_at AS openedAt,
          expires_at AS expiresAt,
          status,
          completed_at AS completedAt,
          cancelled_at AS cancelledAt
        FROM plex_auth_sessions
        WHERE id = ?1`,
      )
      .get(sessionId) as PlexAuthSession | null;

    if (!row) {
      throw new Error(`Plex auth session "${sessionId}" was not found.`);
    }

    return row;
  }
}

function resolveAuthState(
  identity: PlexAuthIdentity | null,
  pendingSession: PlexAuthSession | null,
): PlexAuthState {
  if (pendingSession) {
    return 'connecting';
  }

  if (identity?.reconnectRequiredAt) {
    return 'reconnect_required';
  }

  if (identity?.refreshToken) {
    return 'connected';
  }

  return 'not_connected';
}

function buildClientIdentifier(): string {
  return `pirate-claw-${randomUUID()}`;
}
