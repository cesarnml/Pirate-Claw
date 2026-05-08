import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  acknowledgeNetworkPosture,
  ensureSessionSecret,
  readAuthState,
  sessionSecretPath,
  setupOwner,
  trustOrigin,
  verifyLogin,
} from '../src/auth-state';
import { createApiFetch, createHealthState } from '../src/api';
import type { AppConfig } from '../src/config';
import type { Repository } from '../src/repository';

// --- Helpers ---

let configDir: string | undefined;

afterEach(async () => {
  if (configDir) {
    await rm(configDir, { recursive: true, force: true });
    configDir = undefined;
  }
});

async function makeTmpConfigDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'pirate-claw-auth-'));
  configDir = dir;
  return dir;
}

// --- auth-state module tests ---

describe('ensureSessionSecret', () => {
  it('creates session-secret on first call', async () => {
    const dir = await makeTmpConfigDir();
    const result = await ensureSessionSecret(dir);

    expect(result.created).toBe(true);
    expect(result.path).toBe(sessionSecretPath(dir));

    const content = (await Bun.file(result.path).text()).trim();
    expect(content).toHaveLength(64); // 32 bytes as hex
    expect(content).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not overwrite existing session-secret on second call', async () => {
    const dir = await makeTmpConfigDir();
    const first = await ensureSessionSecret(dir);
    const firstContent = await Bun.file(first.path).text();

    const second = await ensureSessionSecret(dir);
    const secondContent = await Bun.file(second.path).text();

    expect(second.created).toBe(false);
    expect(secondContent).toBe(firstContent);
  });
});

describe('readAuthState', () => {
  it('returns default state before any setup', async () => {
    const dir = await makeTmpConfigDir();
    const state = await readAuthState(dir);

    expect(state.owner_exists).toBe(false);
    expect(state.setup_complete).toBe(false);
    expect(state.trusted_origins).toEqual([]);
    expect(state.network_posture).toBe('unacknowledged');
  });

  it('reflects owner existence after setupOwner', async () => {
    const dir = await makeTmpConfigDir();
    await setupOwner(dir, 'admin', 'secret123', null);

    const state = await readAuthState(dir);
    expect(state.owner_exists).toBe(true);
    expect(state.setup_complete).toBe(true);
  });
});

describe('setupOwner', () => {
  it('creates owner.json with bcrypt hash and persists origin to trusted-origins.json', async () => {
    const dir = await makeTmpConfigDir();
    const result = await setupOwner(
      dir,
      'admin',
      'correcthorsebatterystaple',
      'http://192.168.1.100:3000',
    );

    expect(result.ok).toBe(true);

    const ownerFile = (await Bun.file(
      join(dir, 'auth', 'owner.json'),
    ).json()) as { username: string; password_hash: string };
    expect(ownerFile.username).toBe('admin');
    expect(ownerFile.password_hash).toMatch(/^\$2b\$/);

    const origins = await Bun.file(
      join(dir, 'web', 'trusted-origins.json'),
    ).json();
    expect(origins).toEqual(['http://192.168.1.100:3000']);
  });

  it('creates owner.json without trusted-origins.json when origin is null', async () => {
    const dir = await makeTmpConfigDir();
    await setupOwner(dir, 'admin', 'secret', null);

    const originsFile = Bun.file(join(dir, 'web', 'trusted-origins.json'));
    expect(await originsFile.exists()).toBe(false);
  });

  it('returns already_exists on duplicate call', async () => {
    const dir = await makeTmpConfigDir();
    await setupOwner(dir, 'admin', 'secret', null);
    const second = await setupOwner(dir, 'admin', 'other', null);

    expect(second.ok).toBe(false);
    expect((second as { ok: false; error: string }).error).toBe(
      'already_exists',
    );
  });
});

describe('verifyLogin', () => {
  it('returns ok: true for correct credentials', async () => {
    const dir = await makeTmpConfigDir();
    await setupOwner(dir, 'admin', 'correct-password', null);

    const result = await verifyLogin(dir, 'admin', 'correct-password');
    expect(result.ok).toBe(true);
  });

  it('returns ok: false for wrong password', async () => {
    const dir = await makeTmpConfigDir();
    await setupOwner(dir, 'admin', 'correct-password', null);

    const result = await verifyLogin(dir, 'admin', 'wrong-password');
    expect(result.ok).toBe(false);
  });

  it('returns ok: false for wrong username', async () => {
    const dir = await makeTmpConfigDir();
    await setupOwner(dir, 'admin', 'correct-password', null);

    const result = await verifyLogin(dir, 'notadmin', 'correct-password');
    expect(result.ok).toBe(false);
  });

  it('returns ok: false when no owner exists', async () => {
    const dir = await makeTmpConfigDir();

    const result = await verifyLogin(dir, 'admin', 'password');
    expect(result.ok).toBe(false);
  });
});

describe('trustOrigin', () => {
  it('appends a new origin', async () => {
    const dir = await makeTmpConfigDir();
    await trustOrigin(dir, 'http://localhost:3000');

    const origins = await Bun.file(
      join(dir, 'web', 'trusted-origins.json'),
    ).json();
    expect(origins).toEqual(['http://localhost:3000']);
  });

  it('is idempotent for an already-trusted origin', async () => {
    const dir = await makeTmpConfigDir();
    await trustOrigin(dir, 'http://localhost:3000');
    await trustOrigin(dir, 'http://localhost:3000');

    const origins = await Bun.file(
      join(dir, 'web', 'trusted-origins.json'),
    ).json();
    expect(origins).toEqual(['http://localhost:3000']);
  });

  it('appends without duplicating when different origins added', async () => {
    const dir = await makeTmpConfigDir();
    await trustOrigin(dir, 'http://192.168.1.100:3000');
    await trustOrigin(dir, 'http://100.64.0.1:3000');

    const origins = await Bun.file(
      join(dir, 'web', 'trusted-origins.json'),
    ).json();
    expect(origins).toEqual([
      'http://192.168.1.100:3000',
      'http://100.64.0.1:3000',
    ]);
  });
});

describe('acknowledgeNetworkPosture', () => {
  it('persists direct_acknowledged', async () => {
    const dir = await makeTmpConfigDir();
    await acknowledgeNetworkPosture(dir, 'direct_acknowledged');

    const raw = (await Bun.file(
      join(dir, 'web', 'network-posture.json'),
    ).json()) as { state: string };
    expect(raw.state).toBe('direct_acknowledged');
  });

  it('persists already_secured_externally', async () => {
    const dir = await makeTmpConfigDir();
    await acknowledgeNetworkPosture(dir, 'already_secured_externally');

    const raw = (await Bun.file(
      join(dir, 'web', 'network-posture.json'),
    ).json()) as { state: string };
    expect(raw.state).toBe('already_secured_externally');
  });

  it('persists vpn_bridge_pending', async () => {
    const dir = await makeTmpConfigDir();
    await acknowledgeNetworkPosture(dir, 'vpn_bridge_pending');

    const raw = (await Bun.file(
      join(dir, 'web', 'network-posture.json'),
    ).json()) as { state: string };
    expect(raw.state).toBe('vpn_bridge_pending');
  });
});

// --- HTTP API tests via createApiFetch ---

function stubRepository(): Repository {
  return {
    recordRun: () => ({ id: 1, startedAt: '', status: 'running' }),
    startRun: () => ({ id: 1, startedAt: '', status: 'running' }),
    getRun: () => undefined,
    completeRun: () => {},
    failRun: () => ({}) as never,
    recordFeedItem: () => 1,
    recordFeedItemOutcome: () => {},
    recordCandidateOutcome: () => ({}) as never,
    recordCandidateReconciliation: () => ({}) as never,
    getCandidateState: () => undefined,
    getCandidateStateByTransmissionHash: () => undefined,
    isCandidateQueued: () => false,
    updateCandidateReconciliation: () => ({}) as never,
    retryCandidate: () => ({}) as never,
    listFeedItemOutcomes: () => [],
    listRecentRunSummaries: () => [],
    listCandidateStates: () => [],
    listReconcilableCandidates: () => [],
    listRetryableCandidates: () => [],
    listRecentFeedItemOutcomesForReview: () => [],
    listDistinctUnmatchedAndFailedOutcomes: () => [],
    setPirateClawDisposition: () => {},
    trySetPirateClawDispositionIfUnset: () => true,
    requeueCandidate: () => {},
  } as unknown as Repository;
}

function stubConfig(): AppConfig {
  return {
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
      artifactDir: '/tmp',
      artifactRetentionDays: 7,
      apiWriteToken: 'test-write-token',
    },
  } as AppConfig;
}

const WRITE_TOKEN = 'test-write-token';
const AUTH_HEADER = { authorization: `Bearer ${WRITE_TOKEN}` };

describe('GET /api/auth/state', () => {
  it('returns default state shape before any setup', async () => {
    const dir = await makeTmpConfigDir();
    const configPath = join(dir, 'pirate-claw.config.json');
    const handler = createApiFetch({
      repository: stubRepository(),
      health: createHealthState(),
      config: stubConfig(),
      configPath,
      pollStatePath: '/tmp/poll-state.json',
      loadPollState: () => ({ feeds: {} }),
    });

    const res = await handler(
      new Request('http://localhost/api/auth/state', { headers: AUTH_HEADER }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.owner_exists).toBe(false);
    expect(body.setup_complete).toBe(false);
    expect(body.trusted_origins).toEqual([]);
    expect(body.network_posture).toBe('unacknowledged');
  });

  it('reflects owner_exists after setup-owner', async () => {
    const dir = await makeTmpConfigDir();
    const configPath = join(dir, 'pirate-claw.config.json');
    const handler = createApiFetch({
      repository: stubRepository(),
      health: createHealthState(),
      config: stubConfig(),
      configPath,
      pollStatePath: '/tmp/poll-state.json',
      loadPollState: () => ({ feeds: {} }),
    });

    await handler(
      new Request('http://localhost/api/auth/setup-owner', {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'secret' }),
      }),
    );

    const res = await handler(
      new Request('http://localhost/api/auth/state', { headers: AUTH_HEADER }),
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.owner_exists).toBe(true);
    expect(body.setup_complete).toBe(true);
  });

  it('requires write token', async () => {
    const dir = await makeTmpConfigDir();
    const configPath = join(dir, 'pirate-claw.config.json');
    const handler = createApiFetch({
      repository: stubRepository(),
      health: createHealthState(),
      config: stubConfig(),
      configPath,
      pollStatePath: '/tmp/poll-state.json',
      loadPollState: () => ({ feeds: {} }),
    });

    const res = await handler(new Request('http://localhost/api/auth/state'));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/setup-owner', () => {
  it('creates owner and persists origin from Origin header', async () => {
    const dir = await makeTmpConfigDir();
    const configPath = join(dir, 'pirate-claw.config.json');
    const handler = createApiFetch({
      repository: stubRepository(),
      health: createHealthState(),
      config: stubConfig(),
      configPath,
      pollStatePath: '/tmp/poll-state.json',
      loadPollState: () => ({ feeds: {} }),
    });

    const res = await handler(
      new Request('http://localhost/api/auth/setup-owner', {
        method: 'POST',
        headers: {
          ...AUTH_HEADER,
          'content-type': 'application/json',
          origin: 'http://192.168.1.100:3000',
        },
        body: JSON.stringify({ username: 'admin', password: 'password123' }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    const origins = await Bun.file(
      join(dir, 'web', 'trusted-origins.json'),
    ).json();
    expect(origins).toEqual(['http://192.168.1.100:3000']);
  });

  it('returns 409 on duplicate call', async () => {
    const dir = await makeTmpConfigDir();
    const configPath = join(dir, 'pirate-claw.config.json');
    const handler = createApiFetch({
      repository: stubRepository(),
      health: createHealthState(),
      config: stubConfig(),
      configPath,
      pollStatePath: '/tmp/poll-state.json',
      loadPollState: () => ({ feeds: {} }),
    });

    const reqBody = JSON.stringify({ username: 'admin', password: 'secret' });
    await handler(
      new Request('http://localhost/api/auth/setup-owner', {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'content-type': 'application/json' },
        body: reqBody,
      }),
    );

    const res = await handler(
      new Request('http://localhost/api/auth/setup-owner', {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'content-type': 'application/json' },
        body: reqBody,
      }),
    );
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/verify-login', () => {
  it('returns ok: true for correct credentials', async () => {
    const dir = await makeTmpConfigDir();
    const configPath = join(dir, 'pirate-claw.config.json');
    const handler = createApiFetch({
      repository: stubRepository(),
      health: createHealthState(),
      config: stubConfig(),
      configPath,
      pollStatePath: '/tmp/poll-state.json',
      loadPollState: () => ({ feeds: {} }),
    });

    await setupOwner(dir, 'admin', 'mypassword', null);

    const res = await handler(
      new Request('http://localhost/api/auth/verify-login', {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'mypassword' }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('returns ok: false for wrong password', async () => {
    const dir = await makeTmpConfigDir();
    const configPath = join(dir, 'pirate-claw.config.json');
    const handler = createApiFetch({
      repository: stubRepository(),
      health: createHealthState(),
      config: stubConfig(),
      configPath,
      pollStatePath: '/tmp/poll-state.json',
      loadPollState: () => ({ feeds: {} }),
    });

    await setupOwner(dir, 'admin', 'mypassword', null);

    const res = await handler(
      new Request('http://localhost/api/auth/verify-login', {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrongpassword' }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });
});

describe('POST /api/auth/trust-origin', () => {
  it('appends origin and is idempotent', async () => {
    const dir = await makeTmpConfigDir();
    const configPath = join(dir, 'pirate-claw.config.json');
    const handler = createApiFetch({
      repository: stubRepository(),
      health: createHealthState(),
      config: stubConfig(),
      configPath,
      pollStatePath: '/tmp/poll-state.json',
      loadPollState: () => ({ feeds: {} }),
    });

    await handler(
      new Request('http://localhost/api/auth/trust-origin', {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'content-type': 'application/json' },
        body: JSON.stringify({ origin: 'http://100.64.0.1:3000' }),
      }),
    );
    const res = await handler(
      new Request('http://localhost/api/auth/trust-origin', {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'content-type': 'application/json' },
        body: JSON.stringify({ origin: 'http://100.64.0.1:3000' }),
      }),
    );

    expect(res.status).toBe(200);
    const origins = await Bun.file(
      join(dir, 'web', 'trusted-origins.json'),
    ).json();
    expect(origins).toEqual(['http://100.64.0.1:3000']);
  });
});

describe('POST /api/auth/acknowledge-network-posture', () => {
  it('persists all three valid states', async () => {
    const dir = await makeTmpConfigDir();
    const configPath = join(dir, 'pirate-claw.config.json');
    const handler = createApiFetch({
      repository: stubRepository(),
      health: createHealthState(),
      config: stubConfig(),
      configPath,
      pollStatePath: '/tmp/poll-state.json',
      loadPollState: () => ({ feeds: {} }),
    });

    for (const state of [
      'direct_acknowledged',
      'already_secured_externally',
      'vpn_bridge_pending',
    ] as const) {
      const res = await handler(
        new Request('http://localhost/api/auth/acknowledge-network-posture', {
          method: 'POST',
          headers: { ...AUTH_HEADER, 'content-type': 'application/json' },
          body: JSON.stringify({ state }),
        }),
      );
      expect(res.status).toBe(200);

      const raw = (await Bun.file(
        join(dir, 'web', 'network-posture.json'),
      ).json()) as { state: string };
      expect(raw.state).toBe(state);
    }
  });

  it('returns 400 for invalid state', async () => {
    const dir = await makeTmpConfigDir();
    const configPath = join(dir, 'pirate-claw.config.json');
    const handler = createApiFetch({
      repository: stubRepository(),
      health: createHealthState(),
      config: stubConfig(),
      configPath,
      pollStatePath: '/tmp/poll-state.json',
      loadPollState: () => ({ feeds: {} }),
    });

    const res = await handler(
      new Request('http://localhost/api/auth/acknowledge-network-posture', {
        method: 'POST',
        headers: { ...AUTH_HEADER, 'content-type': 'application/json' },
        body: JSON.stringify({ state: 'unacknowledged' }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
