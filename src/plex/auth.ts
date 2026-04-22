import { generateKeyPairSync, randomUUID } from 'node:crypto';

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
  keyId: string;
  keyAlgorithm: 'EdDSA';
  publicJwk: {
    kty: 'OKP';
    crv: 'Ed25519';
    x: string;
    kid: string;
    alg: 'EdDSA';
    use: 'sig';
  };
  privateKeyPem: string;
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
  pinId: number | null;
  pinCode: string | null;
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
  pinId?: number;
  pinCode?: string;
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
      if (
        existing.keyId &&
        existing.privateKeyPem &&
        existing.publicJwk.x.length > 0
      ) {
        return existing;
      }

      return this.repairIdentity(existing, now);
    }

    const created: PlexAuthIdentity = {
      clientIdentifier: buildClientIdentifier(),
      clientName: PLEX_CLIENT_NAME,
      platformName: PLEX_PLATFORM_NAME,
      ...createDeviceKeyMaterial(),
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
          key_id,
          key_algorithm,
          public_jwk_json,
          private_key_pem,
          refresh_token,
          token_expires_at,
          last_authenticated_at,
          last_error,
          reconnect_required_at,
          created_at,
          updated_at
        ) VALUES (
          1, ?1, ?2, ?3, ?4, ?5, ?6, ?7,
          NULL, NULL, NULL, NULL, NULL, ?8, ?8
        )`,
      )
      .run(
        created.clientIdentifier,
        created.clientName,
        created.platformName,
        created.keyId,
        created.keyAlgorithm,
        JSON.stringify(created.publicJwk),
        created.privateKeyPem,
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
          key_id AS keyId,
          key_algorithm AS keyAlgorithm,
          public_jwk_json AS publicJwkJson,
          private_key_pem AS privateKeyPem,
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
      .get() as
      | (Omit<PlexAuthIdentity, 'publicJwk'> & {
          publicJwkJson: string | null;
        })
      | null;

    if (!row) {
      return null;
    }

    return {
      ...row,
      publicJwk: row.publicJwkJson
        ? (JSON.parse(row.publicJwkJson) as PlexAuthIdentity['publicJwk'])
        : {
            kty: 'OKP',
            crv: 'Ed25519',
            x: '',
            kid: row.keyId,
            alg: 'EdDSA',
            use: 'sig',
          },
    };
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
          pin_id,
          pin_code,
          redirect_uri,
          return_to,
          opened_at,
          expires_at,
          status,
          completed_at,
          cancelled_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', NULL, NULL)`,
      )
      .run(
        id,
        input.oauthState,
        input.codeVerifier,
        input.pinId ?? null,
        input.pinCode ?? null,
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

  disconnect(now = new Date().toISOString()): PlexAuthIdentity | null {
    const identity = this.getIdentity();
    if (!identity) {
      return null;
    }

    this.database
      .query(
        `UPDATE plex_auth_identity
        SET refresh_token = NULL,
            token_expires_at = NULL,
            last_error = NULL,
            reconnect_required_at = NULL,
            updated_at = ?1
        WHERE singleton = 1`,
      )
      .run(now);

    this.database
      .query(
        `UPDATE plex_auth_sessions
        SET status = 'cancelled',
            cancelled_at = ?1
        WHERE status = 'pending'`,
      )
      .run(now);

    return {
      ...identity,
      refreshToken: null,
      tokenExpiresAt: null,
      lastError: null,
      reconnectRequiredAt: null,
      updatedAt: now,
    };
  }

  private getPendingSession(now: string): PlexAuthSession | null {
    const row = this.database
      .query(
        `SELECT
          id,
          oauth_state AS oauthState,
          code_verifier AS codeVerifier,
          pin_id AS pinId,
          pin_code AS pinCode,
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
          pin_id AS pinId,
          pin_code AS pinCode,
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

  private repairIdentity(
    existing: PlexAuthIdentity,
    now: string,
  ): PlexAuthIdentity {
    const material = createDeviceKeyMaterial();
    this.database
      .query(
        `UPDATE plex_auth_identity
        SET key_id = ?1,
            key_algorithm = ?2,
            public_jwk_json = ?3,
            private_key_pem = ?4,
            updated_at = ?5
        WHERE singleton = 1`,
      )
      .run(
        material.keyId,
        material.keyAlgorithm,
        JSON.stringify(material.publicJwk),
        material.privateKeyPem,
        now,
      );

    return {
      ...existing,
      ...material,
      updatedAt: now,
    };
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

function createDeviceKeyMaterial(): Pick<
  PlexAuthIdentity,
  'keyId' | 'keyAlgorithm' | 'publicJwk' | 'privateKeyPem'
> {
  const keyId = randomUUID();
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicJwk = publicKey.export({
    format: 'jwk',
  }) as {
    kty: 'OKP';
    crv: 'Ed25519';
    x: string;
  };

  return {
    keyId,
    keyAlgorithm: 'EdDSA',
    publicJwk: {
      ...publicJwk,
      kid: keyId,
      alg: 'EdDSA',
      use: 'sig',
    },
    privateKeyPem: privateKey.export({
      format: 'pem',
      type: 'pkcs8',
    }) as string,
  };
}
