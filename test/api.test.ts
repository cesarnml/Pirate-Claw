import { describe, expect, it } from 'bun:test';

import {
  type ApiFetchDeps,
  buildFeedStatuses,
  buildMovieBreakdowns,
  buildShowBreakdowns,
  createApiFetch,
  createHealthState,
  recordCycleInHealth,
  redactConfig,
} from '../src/api';
import type { AppConfig } from '../src/config';
import type { PollState } from '../src/poll-state';
import type { CandidateStateRecord, Repository } from '../src/repository';
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

function stubConfig(): AppConfig {
  return {
    feeds: [
      {
        name: 'TV Feed',
        url: 'https://example.test/tv.rss',
        mediaType: 'tv',
      },
    ],
    tv: [{ name: 'Example Show', resolutions: ['1080p'], codecs: ['x265'] }],
    movies: {
      years: [2024],
      resolutions: ['1080p'],
      codecs: ['x265'],
      codecPolicy: 'prefer',
    },
    transmission: {
      url: 'http://localhost:9091/transmission/rpc',
      username: 'user',
      password: 'pass',
    },
    runtime: {
      runIntervalMinutes: 30,
      reconcileIntervalMinutes: 1,
      artifactDir: '.pirate-claw/runtime',
      artifactRetentionDays: 7,
    },
  };
}

const emptyPollState: PollState = { feeds: {} };

function createDeps(overrides: Partial<Repository> = {}): ApiFetchDeps {
  return {
    repository: stubRepository(overrides),
    health: createHealthState(),
    config: stubConfig(),
    pollStatePath: '/nonexistent/poll-state.json',
    loadPollState: () => emptyPollState,
  };
}

describe('createApiFetch', () => {
  it('returns 404 for any request when no deps provided', async () => {
    const handler = createApiFetch();
    const response = await handler(new Request('http://localhost/anything'));

    expect(response.status).toBe(404);
  });

  it('returns JSON error body when no deps provided', async () => {
    const handler = createApiFetch();
    const response = await handler(new Request('http://localhost/anything'));
    const body = await response.json();

    expect(body).toEqual({ error: 'not found' });
  });

  it('returns 404 for unknown routes', async () => {
    const deps = createDeps();
    const handler = createApiFetch(deps);
    const response = await handler(new Request('http://localhost/unknown'));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not found' });
  });
});

describe('GET /api/health', () => {
  it('returns uptime and startedAt', async () => {
    const deps = createDeps();
    const handler = createApiFetch(deps);
    const response = await handler(new Request('http://localhost/api/health'));

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

    const response = await handler(new Request('http://localhost/api/health'));
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
    const response = await handler(new Request('http://localhost/api/status'));

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
    const response = await handler(
      new Request('http://localhost/api/candidates'),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.candidates).toEqual(candidates);
  });
});

describe('GET /api/status — error handling', () => {
  it('returns 500 JSON error when repository throws', async () => {
    const deps = createDeps({
      listRecentRunSummaries: () => {
        throw new Error('db error');
      },
    });
    const handler = createApiFetch(deps);
    const response = await handler(new Request('http://localhost/api/status'));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal server error' });
  });
});

describe('GET /api/candidates — error handling', () => {
  it('returns 500 JSON error when repository throws', async () => {
    const deps = createDeps({
      listCandidateStates: () => {
        throw new Error('db error');
      },
    });
    const handler = createApiFetch(deps);
    const response = await handler(
      new Request('http://localhost/api/candidates'),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal server error' });
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

// --- P9.03 endpoint tests ---

function tvCandidate(
  overrides: Partial<CandidateStateRecord> = {},
): CandidateStateRecord {
  return {
    identityKey: 'tv-key',
    mediaType: 'tv',
    status: 'queued',
    ruleName: 'Test Show',
    score: 100,
    reasons: [],
    rawTitle: 'Test.Show.S01E01',
    normalizedTitle: 'test show',
    season: 1,
    episode: 1,
    feedName: 'feed',
    guidOrLink: 'http://example.test/1',
    publishedAt: '2026-01-01T00:00:00Z',
    downloadUrl: 'http://example.test/dl/1',
    firstSeenRunId: 1,
    lastSeenRunId: 1,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function movieCandidate(
  overrides: Partial<CandidateStateRecord> = {},
): CandidateStateRecord {
  return {
    identityKey: 'movie-key',
    mediaType: 'movie',
    status: 'queued',
    ruleName: 'Test Movie',
    score: 100,
    reasons: [],
    rawTitle: 'Test.Movie.2024',
    normalizedTitle: 'test movie',
    year: 2024,
    resolution: '1080p',
    codec: 'x265',
    feedName: 'feed',
    guidOrLink: 'http://example.test/2',
    publishedAt: '2026-01-01T00:00:00Z',
    downloadUrl: 'http://example.test/dl/2',
    firstSeenRunId: 1,
    lastSeenRunId: 1,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('GET /api/shows', () => {
  it('returns grouped TV show breakdowns', async () => {
    const candidates = [
      tvCandidate({ identityKey: 'k1', season: 1, episode: 1 }),
      tvCandidate({ identityKey: 'k2', season: 1, episode: 2 }),
      tvCandidate({
        identityKey: 'k3',
        season: 2,
        episode: 1,
      }),
    ];
    const deps = createDeps({
      listCandidateStates: () => candidates as never,
    });
    const handler = createApiFetch(deps);
    const response = await handler(new Request('http://localhost/api/shows'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.shows).toHaveLength(1);
    expect(body.shows[0].normalizedTitle).toBe('test show');
    expect(body.shows[0].seasons).toHaveLength(2);
    expect(body.shows[0].seasons[0].season).toBe(1);
    expect(body.shows[0].seasons[0].episodes).toHaveLength(2);
    expect(body.shows[0].seasons[1].season).toBe(2);
  });

  it('excludes movie candidates', async () => {
    const candidates = [
      tvCandidate({ identityKey: 'k1' }),
      movieCandidate({ identityKey: 'k2' }),
    ];
    const deps = createDeps({
      listCandidateStates: () => candidates as never,
    });
    const handler = createApiFetch(deps);
    const response = await handler(new Request('http://localhost/api/shows'));
    const body = await response.json();

    expect(body.shows).toHaveLength(1);
  });
});

describe('GET /api/movies', () => {
  it('returns movie breakdowns', async () => {
    const candidates = [movieCandidate()];
    const deps = createDeps({
      listCandidateStates: () => candidates as never,
    });
    const handler = createApiFetch(deps);
    const response = await handler(new Request('http://localhost/api/movies'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.movies).toHaveLength(1);
    expect(body.movies[0].normalizedTitle).toBe('test movie');
    expect(body.movies[0].year).toBe(2024);
  });

  it('excludes TV candidates', async () => {
    const candidates = [
      tvCandidate({ identityKey: 'k1' }),
      movieCandidate({ identityKey: 'k2' }),
    ];
    const deps = createDeps({
      listCandidateStates: () => candidates as never,
    });
    const handler = createApiFetch(deps);
    const response = await handler(new Request('http://localhost/api/movies'));
    const body = await response.json();

    expect(body.movies).toHaveLength(1);
  });
});

describe('GET /api/feeds', () => {
  it('returns feed statuses with poll timing', async () => {
    const pollState: PollState = {
      feeds: { 'TV Feed': { lastPolledAt: '2026-01-01T00:00:00Z' } },
    };
    const deps = createDeps();
    deps.loadPollState = () => pollState;
    const handler = createApiFetch(deps);
    const response = await handler(new Request('http://localhost/api/feeds'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.feeds).toHaveLength(1);
    expect(body.feeds[0].name).toBe('TV Feed');
    expect(body.feeds[0].lastPolledAt).toBe('2026-01-01T00:00:00Z');
    expect(typeof body.feeds[0].isDue).toBe('boolean');
    expect(body.feeds[0].pollIntervalMinutes).toBe(30);
  });

  it('returns isDue true when never polled', async () => {
    const deps = createDeps();
    deps.loadPollState = () => ({ feeds: {} });
    const handler = createApiFetch(deps);
    const response = await handler(new Request('http://localhost/api/feeds'));
    const body = await response.json();

    expect(body.feeds[0].isDue).toBe(true);
    expect(body.feeds[0].lastPolledAt).toBeNull();
  });
});

describe('GET /api/config', () => {
  it('returns config with redacted credentials', async () => {
    const deps = createDeps();
    const handler = createApiFetch(deps);
    const response = await handler(new Request('http://localhost/api/config'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.transmission.username).toBe('[redacted]');
    expect(body.transmission.password).toBe('[redacted]');
    expect(body.transmission.url).toBe(
      'http://localhost:9091/transmission/rpc',
    );
  });

  it('does not mutate the original config object', async () => {
    const deps = createDeps();
    const handler = createApiFetch(deps);
    await handler(new Request('http://localhost/api/config'));

    expect(deps.config.transmission.username).toBe('user');
    expect(deps.config.transmission.password).toBe('pass');
  });
});

describe('buildShowBreakdowns', () => {
  it('sorts shows by title and seasons/episodes by number', () => {
    const candidates = [
      tvCandidate({
        identityKey: 'k1',
        normalizedTitle: 'z show',
        season: 2,
        episode: 3,
      }),
      tvCandidate({
        identityKey: 'k2',
        normalizedTitle: 'a show',
        season: 1,
        episode: 2,
      }),
      tvCandidate({
        identityKey: 'k3',
        normalizedTitle: 'a show',
        season: 1,
        episode: 1,
      }),
    ];

    const shows = buildShowBreakdowns(candidates as never);

    expect(shows[0].normalizedTitle).toBe('a show');
    expect(shows[0].seasons[0].episodes[0].episode).toBe(1);
    expect(shows[0].seasons[0].episodes[1].episode).toBe(2);
    expect(shows[1].normalizedTitle).toBe('z show');
  });

  it('skips TV candidates with missing season or episode', () => {
    const candidates = [
      tvCandidate({ identityKey: 'k1', season: 1, episode: 1 }),
      { ...tvCandidate({ identityKey: 'k2' }), season: undefined, episode: 3 },
      { ...tvCandidate({ identityKey: 'k3' }), season: 2, episode: undefined },
      {
        ...tvCandidate({ identityKey: 'k4' }),
        season: undefined,
        episode: undefined,
      },
    ];

    const shows = buildShowBreakdowns(candidates as never);

    expect(shows).toHaveLength(1);
    expect(shows[0].seasons[0].episodes).toHaveLength(1);
    expect(shows[0].seasons[0].episodes[0].identityKey).toBe('k1');
  });
});

describe('buildMovieBreakdowns', () => {
  it('sorts movies by title', () => {
    const candidates = [
      movieCandidate({ identityKey: 'k1', normalizedTitle: 'z movie' }),
      movieCandidate({ identityKey: 'k2', normalizedTitle: 'a movie' }),
    ];

    const movies = buildMovieBreakdowns(candidates as never);

    expect(movies[0].normalizedTitle).toBe('a movie');
    expect(movies[1].normalizedTitle).toBe('z movie');
  });
});

describe('buildFeedStatuses', () => {
  it('marks feed as due when poll interval exceeded', () => {
    const feeds = [
      {
        name: 'Feed',
        url: 'http://example.test/rss',
        mediaType: 'tv' as const,
      },
    ];
    const pollState: PollState = {
      feeds: {
        Feed: { lastPolledAt: new Date(Date.now() - 999999999).toISOString() },
      },
    };
    const runtime = {
      runIntervalMinutes: 30,
      reconcileIntervalMinutes: 1,
      artifactDir: '',
      artifactRetentionDays: 7,
    };

    const statuses = buildFeedStatuses(feeds, pollState, runtime);

    expect(statuses[0].isDue).toBe(true);
  });

  it('marks feed as not due when recently polled', () => {
    const feeds = [
      {
        name: 'Feed',
        url: 'http://example.test/rss',
        mediaType: 'tv' as const,
      },
    ];
    const pollState: PollState = {
      feeds: { Feed: { lastPolledAt: new Date().toISOString() } },
    };
    const runtime = {
      runIntervalMinutes: 30,
      reconcileIntervalMinutes: 1,
      artifactDir: '',
      artifactRetentionDays: 7,
    };

    const statuses = buildFeedStatuses(feeds, pollState, runtime);

    expect(statuses[0].isDue).toBe(false);
  });
});

describe('redactConfig', () => {
  it('redacts transmission username and password', () => {
    const config = stubConfig();
    const redacted = redactConfig(config);

    expect(redacted.transmission.username).toBe('[redacted]');
    expect(redacted.transmission.password).toBe('[redacted]');
    expect(config.transmission.username).toBe('user');
  });

  it('redacts tmdb apiKey when present', () => {
    const config: AppConfig = {
      ...stubConfig(),
      tmdb: {
        apiKey: 'secret-tmdb',
        cacheTtlDays: 14,
        negativeCacheTtlDays: 2,
      },
    };
    const redacted = redactConfig(config);

    expect(redacted.tmdb?.apiKey).toBe('[redacted]');
    expect(config.tmdb?.apiKey).toBe('secret-tmdb');
  });
});
