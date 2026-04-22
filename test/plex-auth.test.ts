import type { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp as createTempDir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PlexAuthStore } from '../src/plex/auth';
import { ensureSchema, openDatabase } from '../src/repository';

const tempDirs: string[] = [];
const openDatabases: Database[] = [];

describe('PlexAuthStore', () => {
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

  it('persists a stable client identifier across store reloads', async () => {
    const path = await createDatabasePath();
    const database = createDatabase(path);
    const store = new PlexAuthStore(database);

    const first = store.ensureIdentity('2026-04-22T08:00:00.000Z');
    expect(first.clientIdentifier).toStartWith('pirate-claw-');
    expect(first.keyId).toBeTruthy();
    expect(first.keyAlgorithm).toBe('EdDSA');
    expect(first.publicJwk).toMatchObject({
      kty: 'OKP',
      crv: 'Ed25519',
      kid: first.keyId,
      alg: 'EdDSA',
      use: 'sig',
    });
    expect(first.privateKeyPem).toContain('BEGIN PRIVATE KEY');

    database.close();
    openDatabases.pop();

    const reopened = createDatabase(path);
    const reloaded = new PlexAuthStore(reopened).ensureIdentity(
      '2026-04-22T08:05:00.000Z',
    );

    expect(reloaded.clientIdentifier).toBe(first.clientIdentifier);
    expect(reloaded.createdAt).toBe('2026-04-22T08:00:00.000Z');
    expect(reloaded.keyId).toBe(first.keyId);
    expect(reloaded.publicJwk).toEqual(first.publicJwk);
    expect(reloaded.privateKeyPem).toBe(first.privateKeyPem);
  });

  it('creates pending sessions and expires them once the window closes', async () => {
    const store = new PlexAuthStore(createDatabase(await createDatabasePath()));

    const created = store.createSession({
      oauthState: 'oauth-state-1',
      codeVerifier: 'code-verifier-1',
      redirectUri: 'http://localhost:5173/api/plex/auth/callback',
      returnTo: '/config',
      openedAt: '2026-04-22T08:00:00.000Z',
      expiresAt: '2026-04-22T08:10:00.000Z',
    });

    expect(created.session.status).toBe('pending');
    expect(store.getSnapshot('2026-04-22T08:05:00.000Z')).toMatchObject({
      state: 'connecting',
      pendingSession: {
        id: created.session.id,
        status: 'pending',
      },
    });

    expect(store.expirePendingSessions('2026-04-22T08:10:00.000Z')).toBe(1);
    expect(store.getSnapshot('2026-04-22T08:10:00.000Z')).toMatchObject({
      state: 'not_connected',
      pendingSession: null,
    });
  });

  it('finalizes a session into durable refresh-token identity state', async () => {
    const path = await createDatabasePath();
    const database = createDatabase(path);
    const store = new PlexAuthStore(database);
    const created = store.createSession({
      oauthState: 'oauth-state-2',
      codeVerifier: 'code-verifier-2',
      redirectUri: 'http://localhost:5173/api/plex/auth/callback',
      openedAt: '2026-04-22T09:00:00.000Z',
      expiresAt: '2026-04-22T09:10:00.000Z',
    });

    const finalized = store.finalizeSession(created.session.id, {
      refreshToken: 'refresh-token-123',
      tokenExpiresAt: '2026-04-22T10:00:00.000Z',
      authenticatedAt: '2026-04-22T09:03:00.000Z',
    });

    expect(finalized.identity).toMatchObject({
      clientIdentifier: created.identity.clientIdentifier,
      refreshToken: 'refresh-token-123',
      tokenExpiresAt: '2026-04-22T10:00:00.000Z',
      lastAuthenticatedAt: '2026-04-22T09:03:00.000Z',
    });
    expect(finalized.session.status).toBe('completed');
    expect(store.getSnapshot('2026-04-22T09:04:00.000Z').state).toBe(
      'connected',
    );

    database.close();
    openDatabases.pop();

    const reloaded = new PlexAuthStore(createDatabase(path));
    expect(reloaded.getSnapshot('2026-04-22T09:05:00.000Z')).toMatchObject({
      state: 'connected',
      identity: {
        clientIdentifier: created.identity.clientIdentifier,
        refreshToken: 'refresh-token-123',
      },
    });
  });

  it('cancels other pending sessions after a successful finalization', async () => {
    const path = await createDatabasePath();
    const database = createDatabase(path);
    const store = new PlexAuthStore(database);
    const first = store.createSession({
      oauthState: 'oauth-state-first',
      codeVerifier: 'code-verifier-first',
      redirectUri: 'http://localhost:5173/api/plex/auth/callback',
      openedAt: '2026-04-22T09:00:00.000Z',
      expiresAt: '2026-04-22T09:10:00.000Z',
    });
    const second = store.createSession({
      oauthState: 'oauth-state-second',
      codeVerifier: 'code-verifier-second',
      redirectUri: 'http://localhost:5173/api/plex/auth/callback',
      openedAt: '2026-04-22T09:01:00.000Z',
      expiresAt: '2026-04-22T09:11:00.000Z',
    });

    const finalized = store.finalizeSession(first.session.id, {
      refreshToken: 'refresh-token-123',
      authenticatedAt: '2026-04-22T09:03:00.000Z',
    });

    expect(finalized.session.status).toBe('completed');
    expect(store.getSnapshot('2026-04-22T09:04:00.000Z')).toMatchObject({
      state: 'connected',
      pendingSession: null,
    });

    const rows = database
      .query(`SELECT id, status FROM plex_auth_sessions ORDER BY opened_at ASC`)
      .all() as Array<{ id: string; status: string }>;
    expect(rows).toEqual([
      { id: first.session.id, status: 'completed' },
      { id: second.session.id, status: 'cancelled' },
    ]);

    database.close();
    openDatabases.pop();

    const reloaded = new PlexAuthStore(createDatabase(path));
    expect(reloaded.getSnapshot('2026-04-22T09:05:00.000Z')).toMatchObject({
      state: 'connected',
      identity: {
        clientIdentifier: first.identity.clientIdentifier,
        refreshToken: 'refresh-token-123',
      },
      pendingSession: null,
    });
  });
});

function createDatabase(path: string): Database {
  const database = openDatabase(path);
  openDatabases.push(database);
  ensureSchema(database);
  return database;
}

async function createDatabasePath(): Promise<string> {
  const directory = await createTempDir(join(tmpdir(), 'pirate-claw-db-test-'));

  tempDirs.push(directory);
  return join(directory, 'pirate-claw.db');
}
