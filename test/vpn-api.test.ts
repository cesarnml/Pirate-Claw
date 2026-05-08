import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import {
  type ApiFetchDeps,
  createApiFetch,
  createHealthState,
} from '../src/api';
import type { AppConfig } from '../src/config';
import {
  activeProfilePath,
  credentialsPath,
  vpnDir,
  vpnManifestPath,
} from '../src/vpn-state';
import type { PollState } from '../src/poll-state';
import type { Repository } from '../src/repository';

const WRITE_TOKEN = 'test-write-token';
const VALID_OVPN = 'client\ndev tun\nproto udp\nremote vpn.example.com 1194\n';

function stubRepository(overrides: Partial<Repository> = {}): Repository {
  return {
    recordRun: () => ({ id: 1, startedAt: '', status: 'running' }),
    completeRun: () => {},
    recordFeedItem: () => 1,
    recordFeedItemOutcome: () => {},
    recordCandidateOutcome: () => ({}) as never,
    getCandidateState: () => undefined,
    getCandidateStateByTransmissionHash: () => undefined,
    updateCandidateReconciliation: () => ({}) as never,
    retryCandidate: () => ({}) as never,
    requeueCandidate: () => {},
    listFeedItemOutcomes: () => [],
    listRecentRunSummaries: () => [],
    listCandidateStates: () => [],
    listReconcilableCandidates: () => [],
    listRetryableCandidates: () => [],
    listRecentFeedItemOutcomesForReview: () => [],
    listDistinctUnmatchedAndFailedOutcomes: () => [],
    setPirateClawDisposition: () => {},
    trySetPirateClawDispositionIfUnset: () => true,
    ...overrides,
  } as Repository;
}

const emptyPollState: PollState = { feeds: {} };

let tempDir: string;
let configPath: string;
let apiFetch: (req: Request) => Promise<Response> | Response;

const baseConfig: AppConfig = {
  feeds: [],
  tv: [],
  movies: {
    years: [2024],
    resolutions: ['1080p'],
    codecs: ['x265'],
    codecPolicy: 'prefer',
  },
  transmission: {
    url: 'http://transmission:9091/transmission/rpc',
    username: 'user',
    password: 'pass',
  },
  runtime: {
    runIntervalMinutes: 15,
    reconcileIntervalSeconds: 30,
    artifactDir: '.pirate-claw/runtime',
    artifactRetentionDays: 7,
    apiWriteToken: WRITE_TOKEN,
  },
};

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'pirate-claw-vpn-api-test-'));
  configPath = join(tempDir, 'pirate-claw.config.json');
  await writeFile(configPath, JSON.stringify(baseConfig, null, 2) + '\n');
  await mkdir(join(tempDir, 'web'), { recursive: true });
  await writeFile(
    join(tempDir, 'web', 'trusted-origins.json'),
    JSON.stringify(['http://192.168.1.100:8888', 'http://100.64.0.1:8888']) +
      '\n',
  );

  const config: AppConfig = { ...baseConfig };
  const configHolder = { current: config };
  const deps: ApiFetchDeps = {
    repository: stubRepository(),
    health: createHealthState(),
    config,
    configHolder,
    configPath,
    pollStatePath: join(tempDir, 'poll-state.json'),
    loadPollState: () => emptyPollState,
  };
  apiFetch = createApiFetch(deps);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${WRITE_TOKEN}` };
}

// ---------------------------------------------------------------------------
// POST /api/vpn/profile
// ---------------------------------------------------------------------------

describe('POST /api/vpn/profile', () => {
  it('returns 401 without write auth', async () => {
    const res = await apiFetch(
      new Request('http://localhost/api/vpn/profile', {
        method: 'POST',
        body: VALID_OVPN,
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid .ovpn body (empty)', async () => {
    const res = await apiFetch(
      new Request('http://localhost/api/vpn/profile', {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/octet-stream',
        },
        body: '',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a body that is not a valid .ovpn (JSON)', async () => {
    const res = await apiFetch(
      new Request('http://localhost/api/vpn/profile', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ notAnOvpn: true }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 200, writes active-profile.ovpn, manifest, and compose artifact', async () => {
    const res = await apiFetch(
      new Request('http://localhost/api/vpn/profile', {
        method: 'POST',
        headers: authHeaders(),
        body: VALID_OVPN,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; manifest: unknown };
    expect(body.ok).toBe(true);
    expect(body.manifest).toBeTruthy();

    // active-profile.ovpn was written
    const profileFile = Bun.file(activeProfilePath(tempDir));
    expect(await profileFile.exists()).toBe(true);
    expect(await profileFile.text()).toBe(VALID_OVPN);

    // manifest was written
    const manifestFile = Bun.file(vpnManifestPath(tempDir));
    expect(await manifestFile.exists()).toBe(true);
    const manifest = (await manifestFile.json()) as {
      uploadedAt: string;
      provider: string;
      hasCredentials: boolean;
    };
    expect(manifest.hasCredentials).toBe(false);

    // compose artifact was generated
    const composePath = join(vpnDir(tempDir), 'compose.synology.yml');
    const composeFile = Bun.file(composePath);
    expect(await composeFile.exists()).toBe(true);
    const composeText = await composeFile.text();
    expect(composeText).toContain('gluetun');
    expect(composeText).toContain('ALLOWED_ORIGINS');
  });
});

// ---------------------------------------------------------------------------
// POST /api/vpn/credentials
// ---------------------------------------------------------------------------

describe('POST /api/vpn/credentials', () => {
  it('returns 401 without write auth', async () => {
    const res = await apiFetch(
      new Request('http://localhost/api/vpn/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'user', password: 'pass' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 200, writes credentials file in gluetun format', async () => {
    // first save a profile so the manifest dir exists
    await apiFetch(
      new Request('http://localhost/api/vpn/profile', {
        method: 'POST',
        headers: authHeaders(),
        body: VALID_OVPN,
      }),
    );

    const res = await apiFetch(
      new Request('http://localhost/api/vpn/credentials', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'myuser', password: 'mypass' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    // credentials file contains username\npassword\n
    const credsFile = Bun.file(credentialsPath(tempDir));
    expect(await credsFile.exists()).toBe(true);
    expect(await credsFile.text()).toBe('myuser\nmypass\n');

    // manifest updated hasCredentials = true
    const manifest = (await Bun.file(vpnManifestPath(tempDir)).json()) as {
      hasCredentials: boolean;
    };
    expect(manifest.hasCredentials).toBe(true);
  });

  it('credentials must NOT appear in compose YAML', async () => {
    await apiFetch(
      new Request('http://localhost/api/vpn/profile', {
        method: 'POST',
        headers: authHeaders(),
        body: VALID_OVPN,
      }),
    );
    await apiFetch(
      new Request('http://localhost/api/vpn/credentials', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'myuser', password: 'secretpass' }),
      }),
    );

    const composePath = join(vpnDir(tempDir), 'compose.synology.yml');
    const composeText = await Bun.file(composePath).text();
    expect(composeText).not.toContain('secretpass');
    expect(composeText).not.toContain('myuser');
  });
});

// ---------------------------------------------------------------------------
// GET /api/vpn/compose
// ---------------------------------------------------------------------------

describe('GET /api/vpn/compose', () => {
  it('returns 404 with JSON error when no profile saved', async () => {
    const res = await apiFetch(
      new Request('http://localhost/api/vpn/compose', { method: 'GET' }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('returns 200 with YAML content-type when profile saved', async () => {
    await apiFetch(
      new Request('http://localhost/api/vpn/profile', {
        method: 'POST',
        headers: authHeaders(),
        body: VALID_OVPN,
      }),
    );

    const res = await apiFetch(
      new Request('http://localhost/api/vpn/compose', { method: 'GET' }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/yaml');
    const text = await res.text();
    expect(text).toContain('gluetun');
  });
});

// ---------------------------------------------------------------------------
// POST /api/vpn/verify
// ---------------------------------------------------------------------------

describe('POST /api/vpn/verify', () => {
  it('returns passthrough immediately when no credentials saved', async () => {
    const res = await apiFetch(
      new Request('http://localhost/api/vpn/verify', {
        method: 'POST',
        headers: authHeaders(),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('passthrough');
  });

  it('returns vpn_bridge_unreachable when gluetun is unreachable', async () => {
    // save profile + credentials first
    await apiFetch(
      new Request('http://localhost/api/vpn/profile', {
        method: 'POST',
        headers: authHeaders(),
        body: VALID_OVPN,
      }),
    );
    await apiFetch(
      new Request('http://localhost/api/vpn/credentials', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'u', password: 'p' }),
      }),
    );

    const fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('Connection refused'),
    );

    const res = await apiFetch(
      new Request('http://localhost/api/vpn/verify', {
        method: 'POST',
        headers: authHeaders(),
      }),
    );
    fetchSpy.mockRestore();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('vpn_bridge_unreachable');
  });

  it('returns vpn_bridge_active when gluetun + transmission both reachable', async () => {
    await apiFetch(
      new Request('http://localhost/api/vpn/profile', {
        method: 'POST',
        headers: authHeaders(),
        body: VALID_OVPN,
      }),
    );
    await apiFetch(
      new Request('http://localhost/api/vpn/credentials', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'u', password: 'p' }),
      }),
    );

    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('gluetun') || url.includes('8000')) {
        return Response.json({ status: 'running' });
      }
      // transmission RPC
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        method?: string;
        arguments?: { path?: string };
      };
      if (body.method === 'session-get') {
        return Response.json({
          result: 'success',
          arguments: { version: '4.0.0' },
        });
      }
      if (body.method === 'session-stats') {
        return Response.json({
          result: 'success',
          arguments: {
            'download-speed': 0,
            'upload-speed': 0,
            'active-torrent-count': 0,
            'cumulative-stats': { downloadedBytes: 0, uploadedBytes: 0 },
            'current-stats': { downloadedBytes: 0, uploadedBytes: 0 },
          },
        });
      }
      return Response.json(
        { result: 'unknown', arguments: {} },
        { status: 500 },
      );
    }) as typeof fetch);

    const res = await apiFetch(
      new Request('http://localhost/api/vpn/verify', {
        method: 'POST',
        headers: authHeaders(),
      }),
    );
    fetchSpy.mockRestore();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('vpn_bridge_active');
  });

  it('returns vpn_bridge_unreachable when transmission is unreachable', async () => {
    await apiFetch(
      new Request('http://localhost/api/vpn/profile', {
        method: 'POST',
        headers: authHeaders(),
        body: VALID_OVPN,
      }),
    );
    await apiFetch(
      new Request('http://localhost/api/vpn/credentials', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'u', password: 'p' }),
      }),
    );

    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (
      input: RequestInfo | URL,
    ) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('gluetun') || url.includes('8000')) {
        return Response.json({ status: 'running' });
      }
      throw new Error('transmission unreachable');
    }) as typeof fetch);

    const res = await apiFetch(
      new Request('http://localhost/api/vpn/verify', {
        method: 'POST',
        headers: authHeaders(),
      }),
    );
    fetchSpy.mockRestore();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('vpn_bridge_unreachable');
  });
});

// ---------------------------------------------------------------------------
// ALLOWED_ORIGINS in compose artifact
// ---------------------------------------------------------------------------

describe('compose artifact ALLOWED_ORIGINS wiring', () => {
  it('includes ALLOWED_ORIGINS from trusted-origins.json in the generated compose', async () => {
    await apiFetch(
      new Request('http://localhost/api/vpn/profile', {
        method: 'POST',
        headers: authHeaders(),
        body: VALID_OVPN,
      }),
    );

    const composePath = join(vpnDir(tempDir), 'compose.synology.yml');
    const composeText = await Bun.file(composePath).text();
    expect(composeText).toContain('ALLOWED_ORIGINS');
    expect(composeText).toContain('http://192.168.1.100:8888');
  });
});
