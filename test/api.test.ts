import { describe, expect, it } from 'bun:test';

import {
  type ApiFetchDeps,
  createApiFetch,
  createHealthState,
  recordCycleInHealth,
} from '../src/api';
import type { Repository } from '../src/repository';
import type { CycleResult } from '../src/runtime-artifacts';

function stubRepository(overrides: Partial<Repository> = {}): Repository {
  return {
    recordRun: () => ({ id: 1, startedAt: '', status: 'running' }),
    completeRun: () => {},
    recordFeedItem: () => 1,
    recordFeedItemOutcome: () => {},
    recordCandidateOutcome: () => ({}) as never,
    getCandidateState: () => undefined,
    updateCandidateReconciliation: () => ({}) as never,
    retryCandidate: () => ({}) as never,
    listFeedItemOutcomes: () => [],
    listRecentRunSummaries: () => [],
    listCandidateStates: () => [],
    listReconcilableCandidates: () => [],
    listRetryableCandidates: () => [],
    ...overrides,
  } as Repository;
}

function createDeps(overrides: Partial<Repository> = {}): ApiFetchDeps {
  return {
    repository: stubRepository(overrides),
    health: createHealthState(),
  };
}

describe('createApiFetch', () => {
  it('returns 404 for any request when no deps provided', () => {
    const handler = createApiFetch();
    const response = handler(new Request('http://localhost/anything'));

    expect(response.status).toBe(404);
  });

  it('returns JSON error body when no deps provided', async () => {
    const handler = createApiFetch();
    const response = handler(new Request('http://localhost/anything'));
    const body = await response.json();

    expect(body).toEqual({ error: 'not found' });
  });

  it('returns 404 for unknown routes', async () => {
    const deps = createDeps();
    const handler = createApiFetch(deps);
    const response = handler(new Request('http://localhost/unknown'));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not found' });
  });
});

describe('GET /api/health', () => {
  it('returns uptime and startedAt', async () => {
    const deps = createDeps();
    const handler = createApiFetch(deps);
    const response = handler(new Request('http://localhost/api/health'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.startedAt).toBe(deps.health.startedAt);
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.lastRunCycle).toBeNull();
    expect(body.lastReconcileCycle).toBeNull();
  });

  it('includes cycle snapshots after cycles run', async () => {
    const deps = createDeps();
    const handler = createApiFetch(deps);

    const runResult: CycleResult = {
      type: 'run',
      status: 'completed',
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:00:05Z',
      durationMs: 5000,
    };
    recordCycleInHealth(deps.health, runResult);

    const response = handler(new Request('http://localhost/api/health'));
    const body = await response.json();

    expect(body.lastRunCycle).toEqual({
      status: 'completed',
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:00:05Z',
      durationMs: 5000,
    });
    expect(body.lastReconcileCycle).toBeNull();
  });
});

describe('GET /api/status', () => {
  it('returns recent run summaries', async () => {
    const runs = [
      {
        id: 1,
        startedAt: '2026-01-01T00:00:00Z',
        status: 'completed' as const,
        completedAt: '2026-01-01T00:00:05Z',
        counts: {
          queued: 2,
          skipped_duplicate: 1,
          skipped_no_match: 0,
          failed: 0,
        },
      },
    ];
    const deps = createDeps({ listRecentRunSummaries: () => runs });
    const handler = createApiFetch(deps);
    const response = handler(new Request('http://localhost/api/status'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.runs).toEqual(runs);
  });
});

describe('GET /api/candidates', () => {
  it('returns candidate state records', async () => {
    const candidates = [
      {
        identityKey: 'test-key',
        mediaType: 'tv' as const,
        status: 'queued' as const,
        ruleName: 'Test Show',
        score: 100,
        reasons: ['reason1'],
        rawTitle: 'Test.Show.S01E01',
        normalizedTitle: 'test show',
        season: 1,
        episode: 1,
        feedName: 'test-feed',
        guidOrLink: 'http://example.test/1',
        publishedAt: '2026-01-01T00:00:00Z',
        downloadUrl: 'http://example.test/dl/1',
        firstSeenRunId: 1,
        lastSeenRunId: 1,
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    const deps = createDeps({ listCandidateStates: () => candidates as never });
    const handler = createApiFetch(deps);
    const response = handler(new Request('http://localhost/api/candidates'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.candidates).toEqual(candidates);
  });
});

describe('recordCycleInHealth', () => {
  it('records run cycle snapshot', () => {
    const health = createHealthState();
    const result: CycleResult = {
      type: 'run',
      status: 'completed',
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:00:05Z',
      durationMs: 5000,
    };

    recordCycleInHealth(health, result);

    expect(health.lastRunCycle).toEqual({
      status: 'completed',
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:00:05Z',
      durationMs: 5000,
    });
    expect(health.lastReconcileCycle).toBeNull();
  });

  it('records reconcile cycle snapshot', () => {
    const health = createHealthState();
    const result: CycleResult = {
      type: 'reconcile',
      status: 'failed',
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:00:02Z',
      durationMs: 2000,
      error: 'boom',
    };

    recordCycleInHealth(health, result);

    expect(health.lastRunCycle).toBeNull();
    expect(health.lastReconcileCycle).toEqual({
      status: 'failed',
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:00:02Z',
      durationMs: 2000,
    });
  });

  it('overwrites previous snapshot with latest', () => {
    const health = createHealthState();
    recordCycleInHealth(health, {
      type: 'run',
      status: 'completed',
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:00:05Z',
      durationMs: 5000,
    });
    recordCycleInHealth(health, {
      type: 'run',
      status: 'failed',
      startedAt: '2026-01-01T00:01:00Z',
      completedAt: '2026-01-01T00:01:02Z',
      durationMs: 2000,
      error: 'oops',
    });

    expect(health.lastRunCycle!.status).toBe('failed');
    expect(health.lastRunCycle!.startedAt).toBe('2026-01-01T00:01:00Z');
  });
});
