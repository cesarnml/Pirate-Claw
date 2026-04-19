import { Database } from 'bun:sqlite';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, spyOn } from 'bun:test';

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
import { loadConfig } from '../src/config';
import type { PollState } from '../src/poll-state';
import type { CandidateStateRecord, Repository } from '../src/repository';
import type { CycleResult } from '../src/runtime-artifacts';
import { TmdbCache } from '../src/tmdb/cache';
import { movieMatchKey, tvMatchKey } from '../src/tmdb/keys';
import { ensureTmdbSchema } from '../src/tmdb/schema';

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
    listSkippedNoMatchOutcomes: () => [],
    listDistinctUnmatchedAndFailedOutcomes: () => [],
    setPirateClawDisposition: () => {},
    trySetPirateClawDispositionIfUnset: () => true,
    requeueCandidate: () => {},
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
    configPath: '/nonexistent/pirate-claw.config.json',
    pollStatePath: '/nonexistent/poll-state.json',
    loadPollState: () => emptyPollState,
  };
}

async function writeCompactTvConfigFile(path: string): Promise<void> {
  const doc = {
    feeds: [
      {
        name: 'TV Feed',
        url: 'https://example.test/tv.rss',
        mediaType: 'tv',
      },
    ],
    tv: {
      defaults: { resolutions: ['1080p'], codecs: ['x265'] },
      shows: ['Example Show'],
    },
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
      apiWriteToken: 'write-token',
    },
  };
  await Bun.write(path, `${JSON.stringify(doc, null, 2)}\n`);
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

  it('merges TMDB from SQLite cache when tmdbCache is set (no HTTP)', async () => {
    const db = new Database(':memory:');
    try {
      ensureTmdbSchema(db);
      const cache = new TmdbCache(db);
      const matchKey = movieMatchKey('test movie', 2024);
      cache.upsertMovie({
        matchKey,
        tmdbId: 99,
        isNegative: false,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        title: 'Test Movie TMDB',
        overview: null,
        posterPath: '/p.jpg',
        backdropPath: null,
        voteAverage: 7.5,
        voteCount: 10,
        genreIdsJson: '[]',
        releaseDate: null,
      });
      const candidates = [movieCandidate()];
      const deps: ApiFetchDeps = {
        ...createDeps({ listCandidateStates: () => candidates as never }),
        tmdbCache: cache,
      };
      const handler = createApiFetch(deps);
      const response = await handler(
        new Request('http://localhost/api/candidates'),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.candidates[0].tmdb?.title).toBe('Test Movie TMDB');
      expect(body.candidates[0].tmdb?.voteAverage).toBe(7.5);
    } finally {
      db.close();
    }
  });

  it('merges TV TMDB from SQLite cache when tmdbCache is set (no HTTP)', async () => {
    const db = new Database(':memory:');
    try {
      ensureTmdbSchema(db);
      const cache = new TmdbCache(db);
      const matchKey = tvMatchKey('test show');
      cache.upsertTv({
        matchKey,
        tmdbId: 42,
        isNegative: false,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        name: 'Test Show TMDB',
        overview: null,
        posterPath: '/t.jpg',
        backdropPath: null,
        networkName: 'HBO',
        voteAverage: 8,
        voteCount: 5,
        genreIdsJson: '[]',
        firstAirDate: null,
        numberOfSeasons: 1,
        seasonsJson: null,
      });
      const candidates = [tvCandidate()];
      const deps: ApiFetchDeps = {
        ...createDeps({ listCandidateStates: () => candidates as never }),
        tmdbCache: cache,
      };
      const handler = createApiFetch(deps);
      const response = await handler(
        new Request('http://localhost/api/candidates'),
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.candidates[0].tmdb?.name).toBe('Test Show TMDB');
      expect(body.candidates[0].tmdb?.network).toBe('HBO');
      expect(body.candidates[0].tmdb?.voteAverage).toBe(8);
    } finally {
      db.close();
    }
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
      tvCandidate({
        identityKey: 'k1',
        season: 1,
        episode: 1,
        resolution: '1080p',
        codec: 'x265',
      }),
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
    expect(body.shows[0].seasons[0].episodes[0].resolution).toBe('1080p');
    expect(body.shows[0].seasons[0].episodes[0].codec).toBe('x265');
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

describe('POST /api/shows/:slug/tmdb/refresh', () => {
  it('refreshes show TMDB metadata and episode details', async () => {
    const db = new Database(':memory:');
    try {
      ensureTmdbSchema(db);
      const cache = new TmdbCache(db);
      const deps = createDeps({
        listCandidateStates: () =>
          [
            tvCandidate({
              identityKey: 'k1',
              normalizedTitle: 'test show',
              season: 1,
              episode: 1,
              resolution: '1080p',
              codec: 'x265',
            }),
          ] as never,
      });
      deps.config.runtime.apiWriteToken = 'write-token';
      deps.tmdbShows = {
        cache,
        client: {
          searchTv: async () => ({ id: 42, name: 'Test Show' }),
          getTv: async () => ({
            id: 42,
            name: 'Test Show',
            overview: 'Updated overview',
            poster_path: '/poster.jpg',
            backdrop_path: '/backdrop.jpg',
            networks: [{ name: 'HBO' }],
            vote_average: 8.8,
            vote_count: 120,
            number_of_seasons: 1,
          }),
          getTvSeason: async () => ({
            season_number: 1,
            episodes: [
              {
                episode_number: 1,
                name: 'Pilot',
                still_path: '/still.jpg',
                air_date: '2026-01-01',
                overview: 'Pilot overview',
              },
            ],
          }),
        } as never,
        cacheTtlMs: 60_000,
        negativeCacheTtlMs: 10_000,
        log: () => {},
      };

      const handler = createApiFetch(deps);
      const response = await handler(
        new Request('http://localhost/api/shows/test%20show/tmdb/refresh', {
          method: 'POST',
          headers: { authorization: 'Bearer write-token' },
        }),
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        ok: boolean;
        show: {
          tmdb?: { network?: string };
          seasons: Array<{ episodes: Array<{ tmdb?: { name?: string } }> }>;
        };
      };
      expect(body.ok).toBe(true);
      expect(body.show.tmdb?.network).toBe('HBO');
      expect(body.show.seasons[0].episodes[0].tmdb?.name).toBe('Pilot');
    } finally {
      db.close();
    }
  });

  it('rejects refresh requests without write auth', async () => {
    const deps = createDeps();
    deps.config.runtime.apiWriteToken = 'write-token';
    const handler = createApiFetch(deps);
    const response = await handler(
      new Request('http://localhost/api/shows/test%20show/tmdb/refresh', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(401);
  });

  it('reports when TMDB refresh support is not configured', async () => {
    const deps = createDeps();
    deps.config.runtime.apiWriteToken = 'write-token';
    const handler = createApiFetch(deps);
    const response = await handler(
      new Request('http://localhost/api/shows/test%20show/tmdb/refresh', {
        method: 'POST',
        headers: { authorization: 'Bearer write-token' },
      }),
    );

    expect(response.status).toBe(409);
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
    deps.config.runtime.apiWriteToken = 'write-token';
    const handler = createApiFetch(deps);
    const response = await handler(new Request('http://localhost/api/config'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.transmission.username).toBe('[redacted]');
    expect(body.transmission.password).toBe('[redacted]');
    expect(body.transmission.url).toBe(
      'http://localhost:9091/transmission/rpc',
    );
    expect(body.runtime.apiWriteToken).toBe('[redacted]');
    expect(response.headers.get('etag')).toMatch(/^"[0-9a-f]{64}"$/);
  });

  it('does not mutate the original config object', async () => {
    const deps = createDeps();
    const handler = createApiFetch(deps);
    await handler(new Request('http://localhost/api/config'));

    expect(deps.config.transmission.username).toBe('user');
    expect(deps.config.transmission.password).toBe('pass');
  });

  it('returns a stable ETag across unchanged reads', async () => {
    const deps = createDeps();
    const handler = createApiFetch(deps);

    const first = await handler(new Request('http://localhost/api/config'));
    const second = await handler(new Request('http://localhost/api/config'));

    const firstEtag = first.headers.get('etag');
    const secondEtag = second.headers.get('etag');

    expect(firstEtag).toBeTruthy();
    expect(firstEtag).toBe(secondEtag);
  });
});

describe('PUT /api/config', () => {
  it('persists runtime and tv.shows and updates configHolder', async () => {
    const prevWrite = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    try {
      const directory = await mkdtemp(
        join(tmpdir(), 'pirate-claw-api-config-'),
      );
      const configPath = join(directory, 'pirate-claw.config.json');
      await writeCompactTvConfigFile(configPath);
      const loaded = await loadConfig(configPath);
      const holder = { current: loaded };
      const deps = createDeps();
      deps.config = loaded;
      deps.configHolder = holder;
      deps.configPath = configPath;

      const handler = createApiFetch(deps);
      const get = await handler(new Request('http://localhost/api/config'));
      const etag = get.headers.get('etag')!;

      const put = await handler(
        new Request('http://localhost/api/config', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
            'if-match': etag,
          },
          body: JSON.stringify({
            runtime: {
              runIntervalMinutes: 45,
              reconcileIntervalMinutes: 2,
              tmdbRefreshIntervalMinutes: 0,
            },
            tv: {
              shows: ['Alpha Show', 'Beta Show'],
            },
          }),
        }),
      );

      expect(put.status).toBe(200);
      expect(holder.current.tv.map((r) => r.name)).toEqual([
        'Alpha Show',
        'Beta Show',
      ]);
      expect(holder.current.runtime.runIntervalMinutes).toBe(45);

      const disk = await Bun.file(configPath).json();
      expect(disk.tv.defaults).toEqual({
        resolutions: ['1080p'],
        codecs: ['x265'],
      });
      expect(disk.tv.shows).toEqual(['Alpha Show', 'Beta Show']);
    } finally {
      if (prevWrite !== undefined) {
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      } else {
        delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
      }
    }
  });

  it('preserves per-show objects from disk when names match', async () => {
    const prevWrite = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    try {
      const directory = await mkdtemp(
        join(tmpdir(), 'pirate-claw-api-config-'),
      );
      const configPath = join(directory, 'pirate-claw.config.json');
      const doc = {
        feeds: [
          {
            name: 'TV Feed',
            url: 'https://example.test/tv.rss',
            mediaType: 'tv',
          },
        ],
        tv: {
          defaults: { resolutions: ['1080p'], codecs: ['x265'] },
          shows: ['Alpha', { name: 'Beta', matchPattern: 'beta-pattern' }],
        },
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
          apiWriteToken: 'write-token',
        },
      };
      await Bun.write(configPath, `${JSON.stringify(doc, null, 2)}\n`);
      const loaded = await loadConfig(configPath);
      const deps = createDeps();
      deps.config = loaded;
      deps.configPath = configPath;

      const handler = createApiFetch(deps);
      const get = await handler(new Request('http://localhost/api/config'));
      const etag = get.headers.get('etag')!;

      const put = await handler(
        new Request('http://localhost/api/config', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
            'if-match': etag,
          },
          body: JSON.stringify({
            runtime: {
              runIntervalMinutes: 30,
              reconcileIntervalMinutes: 1,
              tmdbRefreshIntervalMinutes: 0,
            },
            tv: {
              shows: ['Alpha', 'Beta'],
            },
          }),
        }),
      );

      expect(put.status).toBe(200);
      const disk = await Bun.file(configPath).json();
      expect(disk.tv.shows[0]).toBe('Alpha');
      expect(disk.tv.shows[1]).toEqual({
        name: 'Beta',
        matchPattern: 'beta-pattern',
      });
    } finally {
      if (prevWrite !== undefined) {
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      } else {
        delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
      }
    }
  });

  it('rejects tv.defaults in the request body', async () => {
    const prevWrite = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    try {
      const directory = await mkdtemp(
        join(tmpdir(), 'pirate-claw-api-config-'),
      );
      const configPath = join(directory, 'pirate-claw.config.json');
      await writeCompactTvConfigFile(configPath);
      const loaded = await loadConfig(configPath);
      const deps = createDeps();
      deps.config = loaded;
      deps.configPath = configPath;

      const handler = createApiFetch(deps);
      const get = await handler(new Request('http://localhost/api/config'));
      const etag = get.headers.get('etag')!;

      const put = await handler(
        new Request('http://localhost/api/config', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
            'if-match': etag,
          },
          body: JSON.stringify({
            runtime: {
              runIntervalMinutes: 30,
              reconcileIntervalMinutes: 1,
              tmdbRefreshIntervalMinutes: 0,
            },
            tv: {
              shows: ['Example Show'],
              defaults: { resolutions: ['720p'], codecs: ['x264'] },
            },
          }),
        }),
      );

      expect(put.status).toBe(400);
      const body = (await put.json()) as { error?: string };
      expect(body.error).toContain('only allows "shows"');
    } finally {
      if (prevWrite !== undefined) {
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      } else {
        delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
      }
    }
  });

  it('rejects missing tv in the body', async () => {
    const prevWrite = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    try {
      const directory = await mkdtemp(
        join(tmpdir(), 'pirate-claw-api-config-'),
      );
      const configPath = join(directory, 'pirate-claw.config.json');
      await writeCompactTvConfigFile(configPath);
      const loaded = await loadConfig(configPath);
      const deps = createDeps();
      deps.config = loaded;
      deps.configPath = configPath;

      const handler = createApiFetch(deps);
      const get = await handler(new Request('http://localhost/api/config'));
      const etag = get.headers.get('etag')!;

      const put = await handler(
        new Request('http://localhost/api/config', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
            'if-match': etag,
          },
          body: JSON.stringify({
            runtime: {
              runIntervalMinutes: 30,
              reconcileIntervalMinutes: 1,
              tmdbRefreshIntervalMinutes: 0,
            },
          }),
        }),
      );

      expect(put.status).toBe(400);
      const body = (await put.json()) as { error?: string };
      expect(body.error).toContain('must include "tv"');
    } finally {
      if (prevWrite !== undefined) {
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      } else {
        delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
      }
    }
  });

  it('returns a deployment-specific error when the config file is not writable', async () => {
    const prevWrite = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    try {
      const directory = await mkdtemp(
        join(tmpdir(), 'pirate-claw-api-config-readonly-'),
      );
      const configPath = join(directory, 'pirate-claw.config.json');
      await writeCompactTvConfigFile(configPath);
      await chmod(directory, 0o555);

      const loaded = await loadConfig(configPath);
      const deps = createDeps();
      deps.config = loaded;
      deps.configPath = configPath;

      const handler = createApiFetch(deps);
      const get = await handler(new Request('http://localhost/api/config'));
      const etag = get.headers.get('etag')!;

      const put = await handler(
        new Request('http://localhost/api/config', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
            'if-match': etag,
          },
          body: JSON.stringify({
            runtime: {
              runIntervalMinutes: 45,
              reconcileIntervalMinutes: 2,
              tmdbRefreshIntervalMinutes: 0,
            },
            tv: {
              shows: ['Alpha Show', 'Beta Show'],
            },
          }),
        }),
      );

      expect(put.status).toBe(500);
      await expect(put.json()).resolves.toEqual({
        error:
          'config file is not writable; check deployment mount permissions and restart the daemon after fixing them',
      });
    } finally {
      if (prevWrite !== undefined) {
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      } else {
        delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
      }
    }
  });

  it('preserves a .env-sourced write token across successful saves', async () => {
    const prevWrite = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    try {
      const directory = await mkdtemp(
        join(tmpdir(), 'pirate-claw-api-config-dotenv-'),
      );
      const configPath = join(directory, 'pirate-claw.config.json');
      await writeCompactTvConfigFile(configPath);

      const disk = (await Bun.file(configPath).json()) as Record<
        string,
        unknown
      >;
      const runtime = disk.runtime as Record<string, unknown>;
      delete runtime.apiWriteToken;
      await Bun.write(configPath, `${JSON.stringify(disk, null, 2)}\n`);
      await writeFile(
        join(directory, '.env'),
        'PIRATE_CLAW_API_WRITE_TOKEN=dotenv-write-token\n',
        'utf8',
      );

      const loaded = await loadConfig(configPath);
      const deps = createDeps();
      deps.config = loaded;
      deps.configHolder = { current: loaded };
      deps.configPath = configPath;

      const handler = createApiFetch(deps);
      const get = await handler(new Request('http://localhost/api/config'));
      const etag = get.headers.get('etag')!;

      const put = await handler(
        new Request('http://localhost/api/config', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer dotenv-write-token',
            'if-match': etag,
          },
          body: JSON.stringify({
            runtime: {
              runIntervalMinutes: 45,
              reconcileIntervalMinutes: 2,
              tmdbRefreshIntervalMinutes: 0,
            },
            tv: {
              shows: ['Alpha Show', 'Beta Show'],
            },
          }),
        }),
      );

      expect(put.status).toBe(200);
      expect(
        (await put.json()) as { runtime: { apiWriteToken?: string } },
      ).toMatchObject({
        runtime: { apiWriteToken: '[redacted]' },
      });

      const nextEtag = put.headers.get('etag')!;
      const secondPut = await handler(
        new Request('http://localhost/api/config', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer dotenv-write-token',
            'if-match': nextEtag,
          },
          body: JSON.stringify({
            runtime: {
              runIntervalMinutes: 30,
              reconcileIntervalMinutes: 1,
              tmdbRefreshIntervalMinutes: 0,
            },
            tv: {
              shows: ['Alpha Show'],
            },
          }),
        }),
      );

      expect(secondPut.status).toBe(200);
    } finally {
      if (prevWrite !== undefined) {
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      } else {
        delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
      }
    }
  });
});

describe('PUT /api/config/tv/defaults', () => {
  async function makeHandler() {
    const prevWrite = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    const directory = await mkdtemp(join(tmpdir(), 'pirate-claw-tv-def-'));
    const configPath = join(directory, 'pirate-claw.config.json');
    await writeCompactTvConfigFile(configPath);
    const loaded = await loadConfig(configPath);
    const holder = { current: loaded };
    const deps = createDeps();
    deps.config = loaded;
    deps.configHolder = holder;
    deps.configPath = configPath;
    const handler = createApiFetch(deps);
    const get = await handler(new Request('http://localhost/api/config'));
    const etag = get.headers.get('etag')!;
    return { handler, holder, configPath, etag, prevWrite };
  }

  it('returns 403 when writes are disabled', async () => {
    // Use deps with no apiWriteToken (stubConfig default)
    const deps = createDeps();
    const handler = createApiFetch(deps);
    const res = await handler(
      new Request('http://localhost/api/config/tv/defaults', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'if-match': '"any"' },
        body: JSON.stringify({ resolutions: ['1080p'], codecs: ['x265'] }),
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain('disabled');
  });

  it('returns 401 when bearer token is missing', async () => {
    const { handler, holder, etag, prevWrite } = await makeHandler();
    holder.current = {
      ...holder.current,
      runtime: { ...holder.current.runtime, apiWriteToken: 'write-token' },
    };
    try {
      const res = await handler(
        new Request('http://localhost/api/config/tv/defaults', {
          method: 'PUT',
          headers: { 'content-type': 'application/json', 'if-match': etag },
          body: JSON.stringify({ resolutions: ['1080p'], codecs: ['x265'] }),
        }),
      );
      expect(res.status).toBe(401);
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
  });

  it('returns 403 when bearer token is wrong', async () => {
    const { handler, holder, etag, prevWrite } = await makeHandler();
    holder.current = {
      ...holder.current,
      runtime: { ...holder.current.runtime, apiWriteToken: 'write-token' },
    };
    try {
      const res = await handler(
        new Request('http://localhost/api/config/tv/defaults', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer wrong-token',
            'if-match': etag,
          },
          body: JSON.stringify({ resolutions: ['1080p'], codecs: ['x265'] }),
        }),
      );
      expect(res.status).toBe(403);
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
  });

  it('returns 428 when If-Match header is missing', async () => {
    const { handler, holder, prevWrite } = await makeHandler();
    holder.current = {
      ...holder.current,
      runtime: { ...holder.current.runtime, apiWriteToken: 'write-token' },
    };
    try {
      const res = await handler(
        new Request('http://localhost/api/config/tv/defaults', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
          },
          body: JSON.stringify({ resolutions: ['1080p'], codecs: ['x265'] }),
        }),
      );
      expect(res.status).toBe(428);
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
  });

  it('returns 409 on stale ETag', async () => {
    const { handler, holder, prevWrite } = await makeHandler();
    holder.current = {
      ...holder.current,
      runtime: { ...holder.current.runtime, apiWriteToken: 'write-token' },
    };
    try {
      const res = await handler(
        new Request('http://localhost/api/config/tv/defaults', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
            'if-match': '"stale-etag"',
          },
          body: JSON.stringify({ resolutions: ['1080p'], codecs: ['x265'] }),
        }),
      );
      expect(res.status).toBe(409);
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
  });

  it('returns 400 on validation failure (unknown resolution)', async () => {
    const prevWrite = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    try {
      const directory = await mkdtemp(join(tmpdir(), 'pirate-claw-tv-def-'));
      const configPath = join(directory, 'pirate-claw.config.json');
      await writeCompactTvConfigFile(configPath);
      const loaded = await loadConfig(configPath);
      const holder = {
        current: {
          ...loaded,
          runtime: { ...loaded.runtime, apiWriteToken: 'write-token' },
        },
      };
      const deps = createDeps();
      deps.config = holder.current;
      deps.configHolder = holder;
      deps.configPath = configPath;
      const handler = createApiFetch(deps);
      const get = await handler(new Request('http://localhost/api/config'));
      const etag = get.headers.get('etag')!;

      const res = await handler(
        new Request('http://localhost/api/config/tv/defaults', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
            'if-match': etag,
          },
          body: JSON.stringify({ resolutions: ['8k'], codecs: ['x265'] }),
        }),
      );
      expect(res.status).toBe(400);
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
  });

  it('happy path: updates tv defaults and returns fresh ETag', async () => {
    const prevWrite = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    try {
      const directory = await mkdtemp(join(tmpdir(), 'pirate-claw-tv-def-'));
      const configPath = join(directory, 'pirate-claw.config.json');
      await writeCompactTvConfigFile(configPath);
      const loaded = await loadConfig(configPath);
      const holder = {
        current: {
          ...loaded,
          runtime: { ...loaded.runtime, apiWriteToken: 'write-token' },
        },
      };
      const deps = createDeps();
      deps.config = holder.current;
      deps.configHolder = holder;
      deps.configPath = configPath;
      const handler = createApiFetch(deps);
      const get = await handler(new Request('http://localhost/api/config'));
      const etag = get.headers.get('etag')!;

      const res = await handler(
        new Request('http://localhost/api/config/tv/defaults', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
            'if-match': etag,
          },
          body: JSON.stringify({ resolutions: ['720p'], codecs: ['x264'] }),
        }),
      );
      expect(res.status).toBe(200);
      const newEtag = res.headers.get('etag');
      expect(newEtag).not.toBe(etag);

      // configHolder updated
      expect(holder.current.tv[0].resolutions).toEqual(['720p']);
      expect(holder.current.tv[0].codecs).toEqual(['x264']);

      // disk updated
      const disk = await Bun.file(configPath).json();
      expect(disk.tv.defaults).toEqual({
        resolutions: ['720p'],
        codecs: ['x264'],
      });
      // shows preserved
      expect(disk.tv.shows).toEqual(['Example Show']);
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
  });
});

describe('PUT /api/config/movies', () => {
  async function makeMovieHandler() {
    const prevWrite = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    const directory = await mkdtemp(join(tmpdir(), 'pirate-claw-movies-'));
    const configPath = join(directory, 'pirate-claw.config.json');
    await writeCompactTvConfigFile(configPath);
    const loaded = await loadConfig(configPath);
    const holder = {
      current: {
        ...loaded,
        runtime: { ...loaded.runtime, apiWriteToken: 'write-token' },
      },
    };
    const deps = createDeps();
    deps.config = holder.current;
    deps.configHolder = holder;
    deps.configPath = configPath;
    const handler = createApiFetch(deps);
    const get = await handler(new Request('http://localhost/api/config'));
    const etag = get.headers.get('etag')!;
    return { handler, holder, configPath, etag, prevWrite };
  }

  it('returns 403 when writes are disabled', async () => {
    // Use deps with no apiWriteToken (stubConfig default)
    const deps = createDeps();
    const handler = createApiFetch(deps);
    const res = await handler(
      new Request('http://localhost/api/config/movies', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'if-match': '"any"' },
        body: JSON.stringify({
          years: [2024],
          resolutions: ['1080p'],
          codecs: ['x265'],
          codecPolicy: 'prefer',
        }),
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain('disabled');
  });

  it('returns 401 when bearer token is missing', async () => {
    const { handler, etag, prevWrite } = await makeMovieHandler();
    try {
      const res = await handler(
        new Request('http://localhost/api/config/movies', {
          method: 'PUT',
          headers: { 'content-type': 'application/json', 'if-match': etag },
          body: JSON.stringify({
            years: [2024],
            resolutions: ['1080p'],
            codecs: ['x265'],
            codecPolicy: 'prefer',
          }),
        }),
      );
      expect(res.status).toBe(401);
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
  });

  it('returns 403 when bearer token is wrong', async () => {
    const { handler, etag, prevWrite } = await makeMovieHandler();
    try {
      const res = await handler(
        new Request('http://localhost/api/config/movies', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer wrong',
            'if-match': etag,
          },
          body: JSON.stringify({
            years: [2024],
            resolutions: ['1080p'],
            codecs: ['x265'],
            codecPolicy: 'prefer',
          }),
        }),
      );
      expect(res.status).toBe(403);
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
  });

  it('returns 428 when If-Match is missing', async () => {
    const { handler, prevWrite } = await makeMovieHandler();
    try {
      const res = await handler(
        new Request('http://localhost/api/config/movies', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
          },
          body: JSON.stringify({
            years: [2024],
            resolutions: ['1080p'],
            codecs: ['x265'],
            codecPolicy: 'prefer',
          }),
        }),
      );
      expect(res.status).toBe(428);
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
  });

  it('returns 409 on stale ETag', async () => {
    const { handler, prevWrite } = await makeMovieHandler();
    try {
      const res = await handler(
        new Request('http://localhost/api/config/movies', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
            'if-match': '"stale"',
          },
          body: JSON.stringify({
            years: [2024],
            resolutions: ['1080p'],
            codecs: ['x265'],
            codecPolicy: 'prefer',
          }),
        }),
      );
      expect(res.status).toBe(409);
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
  });

  it('returns 400 when codecPolicy is absent', async () => {
    const { handler, etag, prevWrite } = await makeMovieHandler();
    try {
      const res = await handler(
        new Request('http://localhost/api/config/movies', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
            'if-match': etag,
          },
          body: JSON.stringify({
            years: [2024],
            resolutions: ['1080p'],
            codecs: ['x265'],
          }),
        }),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toContain('codecPolicy');
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
  });

  it('returns 400 on validation failure (invalid codecPolicy value)', async () => {
    const { handler, etag, prevWrite } = await makeMovieHandler();
    try {
      const res = await handler(
        new Request('http://localhost/api/config/movies', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
            'if-match': etag,
          },
          body: JSON.stringify({
            years: [2024],
            resolutions: ['1080p'],
            codecs: ['x265'],
            codecPolicy: 'optional',
          }),
        }),
      );
      expect(res.status).toBe(400);
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
  });

  it('happy path: updates movies section and returns fresh ETag', async () => {
    const { handler, holder, configPath, etag, prevWrite } =
      await makeMovieHandler();
    try {
      const res = await handler(
        new Request('http://localhost/api/config/movies', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
            'if-match': etag,
          },
          body: JSON.stringify({
            years: [2023, 2024],
            resolutions: ['720p', '1080p'],
            codecs: ['x264', 'x265'],
            codecPolicy: 'require',
          }),
        }),
      );
      expect(res.status).toBe(200);
      const newEtag = res.headers.get('etag');
      expect(newEtag).not.toBe(etag);

      expect(holder.current.movies.years).toEqual([2023, 2024]);
      expect(holder.current.movies.codecPolicy).toBe('require');

      const disk = await Bun.file(configPath).json();
      expect(disk.movies.codecPolicy).toBe('require');
      expect(disk.movies.years).toEqual([2023, 2024]);
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
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

  it('passes through transmissionPercentDone and transmissionTorrentHash', () => {
    const candidates = [
      {
        ...tvCandidate({ identityKey: 'k1', season: 1, episode: 1 }),
        transmissionPercentDone: 0.42,
        transmissionTorrentHash: 'abc123',
      },
    ];

    const shows = buildShowBreakdowns(candidates as never);
    const ep = shows[0].seasons[0].episodes[0];

    expect(ep.transmissionPercentDone).toBe(0.42);
    expect(ep.transmissionTorrentHash).toBe('abc123');
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

  it('passes through transmissionPercentDone and transmissionTorrentHash', () => {
    const candidates = [
      {
        ...movieCandidate({ identityKey: 'k1' }),
        transmissionPercentDone: 0.55,
        transmissionTorrentHash: 'abc123',
      },
    ];

    const movies = buildMovieBreakdowns(candidates as never);

    expect(movies[0].transmissionPercentDone).toBe(0.55);
    expect(movies[0].transmissionTorrentHash).toBe('abc123');
  });
});

describe('PUT /api/config/feeds', () => {
  const validFeedsBody = [
    { name: 'TV Feed', url: 'https://example.test/tv.rss', mediaType: 'tv' },
  ];

  async function makeFeedsHandler() {
    const prevWrite = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    const directory = await mkdtemp(join(tmpdir(), 'pirate-claw-feeds-'));
    const configPath = join(directory, 'pirate-claw.config.json');
    await writeCompactTvConfigFile(configPath);
    const loaded = await loadConfig(configPath);
    const holder = {
      current: {
        ...loaded,
        runtime: { ...loaded.runtime, apiWriteToken: 'write-token' },
      },
    };
    const deps = createDeps();
    deps.config = holder.current;
    deps.configHolder = holder;
    deps.configPath = configPath;
    const handler = createApiFetch(deps);
    const get = await handler(new Request('http://localhost/api/config'));
    const etag = get.headers.get('etag')!;
    return { handler, holder, configPath, etag, prevWrite };
  }

  it('returns 403 when writes are disabled', async () => {
    const deps = createDeps();
    const handler = createApiFetch(deps);
    const res = await handler(
      new Request('http://localhost/api/config/feeds', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'if-match': '"any"' },
        body: JSON.stringify(validFeedsBody),
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain('disabled');
  });

  it('returns 401 when bearer token is missing', async () => {
    const { handler, etag, prevWrite } = await makeFeedsHandler();
    try {
      const res = await handler(
        new Request('http://localhost/api/config/feeds', {
          method: 'PUT',
          headers: { 'content-type': 'application/json', 'if-match': etag },
          body: JSON.stringify(validFeedsBody),
        }),
      );
      expect(res.status).toBe(401);
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
  });

  it('returns 403 when bearer token is wrong', async () => {
    const { handler, etag, prevWrite } = await makeFeedsHandler();
    try {
      const res = await handler(
        new Request('http://localhost/api/config/feeds', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer wrong-token',
            'if-match': etag,
          },
          body: JSON.stringify(validFeedsBody),
        }),
      );
      expect(res.status).toBe(403);
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
  });

  it('returns 428 when If-Match header is missing', async () => {
    const { handler, prevWrite } = await makeFeedsHandler();
    try {
      const res = await handler(
        new Request('http://localhost/api/config/feeds', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
          },
          body: JSON.stringify(validFeedsBody),
        }),
      );
      expect(res.status).toBe(428);
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
  });

  it('returns 409 on stale ETag', async () => {
    const { handler, prevWrite } = await makeFeedsHandler();
    try {
      const res = await handler(
        new Request('http://localhost/api/config/feeds', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
            'if-match': '"stale-etag"',
          },
          body: JSON.stringify(validFeedsBody),
        }),
      );
      expect(res.status).toBe(409);
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
  });

  it('returns 400 on validation failure (malformed feed entry)', async () => {
    const prevWrite = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    try {
      const directory = await mkdtemp(join(tmpdir(), 'pirate-claw-feeds-'));
      const configPath = join(directory, 'pirate-claw.config.json');
      await writeCompactTvConfigFile(configPath);
      const loaded = await loadConfig(configPath);
      const holder = {
        current: {
          ...loaded,
          runtime: { ...loaded.runtime, apiWriteToken: 'write-token' },
        },
      };
      const deps = createDeps();
      deps.config = holder.current;
      deps.configHolder = holder;
      deps.configPath = configPath;
      const handler = createApiFetch(deps);
      const get = await handler(new Request('http://localhost/api/config'));
      const etag = get.headers.get('etag')!;

      const res = await handler(
        new Request('http://localhost/api/config/feeds', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
            'if-match': etag,
          },
          // missing required mediaType field
          body: JSON.stringify([
            { name: 'Bad Feed', url: 'https://example.test/rss' },
          ]),
        }),
      );
      expect(res.status).toBe(400);
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
  });

  it('returns 400 when new URL returns non-2xx', async () => {
    const prevWrite = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    try {
      const directory = await mkdtemp(join(tmpdir(), 'pirate-claw-feeds-'));
      const configPath = join(directory, 'pirate-claw.config.json');
      await writeCompactTvConfigFile(configPath);
      const loaded = await loadConfig(configPath);
      const holder = {
        current: {
          ...loaded,
          runtime: { ...loaded.runtime, apiWriteToken: 'write-token' },
        },
      };
      const deps = createDeps();
      deps.config = holder.current;
      deps.configHolder = holder;
      deps.configPath = configPath;
      const handler = createApiFetch(deps);
      const get = await handler(new Request('http://localhost/api/config'));
      const etag = get.headers.get('etag')!;

      // Use a URL that will fail DNS resolution (new URL, not on disk)
      const failingUrl = 'https://this-domain-does-not-exist.invalid/rss';
      const res = await handler(
        new Request('http://localhost/api/config/feeds', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
            'if-match': etag,
          },
          body: JSON.stringify([
            {
              name: 'New Feed',
              url: failingUrl,
              mediaType: 'tv',
            },
          ]),
        }),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toContain(failingUrl);
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
  });

  it('skips re-fetch for existing URLs and updates config', async () => {
    // The existing TV Feed URL is already on disk — should not be fetched.
    // No outbound request means test won't hang or fail even without a real server.
    const prevWrite = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    try {
      const directory = await mkdtemp(join(tmpdir(), 'pirate-claw-feeds-'));
      const configPath = join(directory, 'pirate-claw.config.json');
      await writeCompactTvConfigFile(configPath);
      const loaded = await loadConfig(configPath);
      const holder = {
        current: {
          ...loaded,
          runtime: { ...loaded.runtime, apiWriteToken: 'write-token' },
        },
      };
      const deps = createDeps();
      deps.config = holder.current;
      deps.configHolder = holder;
      deps.configPath = configPath;
      const handler = createApiFetch(deps);
      const get = await handler(new Request('http://localhost/api/config'));
      const etag = get.headers.get('etag')!;

      // Same URL as on disk — no outbound fetch should occur
      const existingUrl = 'https://example.test/tv.rss';
      const res = await handler(
        new Request('http://localhost/api/config/feeds', {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer write-token',
            'if-match': etag,
          },
          body: JSON.stringify([
            { name: 'TV Feed Renamed', url: existingUrl, mediaType: 'tv' },
          ]),
        }),
      );
      expect(res.status).toBe(200);
      const newEtag = res.headers.get('etag');
      expect(newEtag).not.toBe(etag);

      // Disk updated
      const disk = await Bun.file(configPath).json();
      expect(disk.feeds).toHaveLength(1);
      expect(disk.feeds[0].name).toBe('TV Feed Renamed');
      expect(disk.feeds[0].url).toBe(existingUrl);

      // configHolder updated
      expect(holder.current.feeds[0].name).toBe('TV Feed Renamed');
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
      else delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    }
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

describe('GET /api/outcomes', () => {
  it('returns 400 when status param is missing', async () => {
    const deps = createDeps();
    const handler = createApiFetch(deps);
    const response = await handler(
      new Request('http://localhost/api/outcomes'),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'unsupported status filter',
    });
  });

  it('returns 400 when status param is not skipped_no_match', async () => {
    const deps = createDeps();
    const handler = createApiFetch(deps);
    const response = await handler(
      new Request('http://localhost/api/outcomes?status=queued'),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'unsupported status filter',
    });
  });

  it('returns outcomes from repository on valid request', async () => {
    const mockOutcomes = [
      {
        id: 1,
        runId: 42,
        status: 'skipped_no_match' as const,
        recordedAt: '2026-04-10T12:00:00.000Z',
        title: 'Some.Show.S01E01.720p',
        feedName: 'main-tv',
        identityKey: null,
      },
      {
        id: 2,
        runId: 42,
        status: 'skipped_no_match' as const,
        recordedAt: '2026-04-10T12:00:05.000Z',
        title: null,
        feedName: null,
        identityKey: null,
      },
    ];

    const deps = createDeps({
      listSkippedNoMatchOutcomes: () => mockOutcomes,
    });
    const handler = createApiFetch(deps);
    const response = await handler(
      new Request('http://localhost/api/outcomes?status=skipped_no_match'),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ outcomes: mockOutcomes });
  });

  it('returns empty outcomes array when repository returns none', async () => {
    const deps = createDeps({
      listSkippedNoMatchOutcomes: () => [],
    });
    const handler = createApiFetch(deps);
    const response = await handler(
      new Request('http://localhost/api/outcomes?status=skipped_no_match'),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcomes: [] });
  });
});

describe('POST /api/candidates/:id/requeue', () => {
  const writeToken = 'write-token';
  const authHeader = { Authorization: `Bearer ${writeToken}` };

  function createDepsWithAuth(overrides: Partial<Repository> = {}): ApiFetchDeps {
    return {
      ...createDeps(overrides),
      config: { ...stubConfig(), runtime: { ...stubConfig().runtime, apiWriteToken: writeToken } },
    };
  }

  function requeueRequest(identityKey: string, headers: Record<string, string> = {}) {
    return new Request(
      `http://localhost/api/candidates/${encodeURIComponent(identityKey)}/requeue`,
      { method: 'POST', headers },
    );
  }

  it('returns 403 when write auth is not configured', async () => {
    const deps = createDeps();
    const handler = createApiFetch({
      ...deps,
      downloader: { submit: async () => ({ ok: true, status: 'queued' as const }) },
    });
    const response = await handler(requeueRequest('some-key', authHeader));
    expect(response.status).toBe(403);
  });

  it('returns 401 when bearer token is missing', async () => {
    const deps = createDepsWithAuth({ getCandidateState: () => tvCandidate({ status: 'failed' }) });
    const handler = createApiFetch({
      ...deps,
      downloader: { submit: async () => ({ ok: true, status: 'queued' as const }) },
    });
    const response = await handler(requeueRequest('some-key'));
    expect(response.status).toBe(401);
  });

  it('returns 503 when downloader is not configured', async () => {
    const deps = createDepsWithAuth();
    const handler = createApiFetch(deps);
    const response = await handler(requeueRequest('some-key', authHeader));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it('returns 404 when candidate not found', async () => {
    const deps = createDepsWithAuth({ getCandidateState: () => undefined });
    const handler = createApiFetch({
      ...deps,
      downloader: { submit: async () => ({ ok: true, status: 'queued' as const }) },
    });
    const response = await handler(requeueRequest('missing-key', authHeader));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false, error: 'candidate not found' });
  });

  it('returns 400 when candidate status is not failed', async () => {
    const deps = createDepsWithAuth({
      getCandidateState: () => tvCandidate({ status: 'queued' }),
    });
    const handler = createApiFetch({
      ...deps,
      downloader: { submit: async () => ({ ok: true, status: 'queued' as const }) },
    });
    const response = await handler(requeueRequest('some-key', authHeader));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it('returns 500 when downloader.submit fails', async () => {
    const failedCandidate = tvCandidate({ status: 'failed' });
    const deps = createDepsWithAuth({ getCandidateState: () => failedCandidate });
    const handler = createApiFetch({
      ...deps,
      downloader: {
        submit: async () => ({
          ok: false as const,
          code: 'network_error' as const,
          message: 'connection refused',
        }),
      },
    });
    const response = await handler(requeueRequest('some-key', authHeader));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false, error: 'connection refused' });
  });

  it('calls requeueCandidate and returns torrent fields on success', async () => {
    const failedCandidate = tvCandidate({
      identityKey: 'test-key',
      status: 'failed',
      downloadUrl: 'http://example.test/torrent.torrent',
    });
    let requeuedWith: Parameters<Repository['requeueCandidate']> | null = null;
    const deps = createDepsWithAuth({
      getCandidateState: () => failedCandidate,
      requeueCandidate: (...args) => { requeuedWith = args; },
    });
    const handler = createApiFetch({
      ...deps,
      downloader: {
        submit: async () => ({
          ok: true as const,
          status: 'queued' as const,
          torrentId: 42,
          torrentHash: 'abc123',
          torrentName: 'Test.Show.S01E01',
        }),
      },
    });
    const response = await handler(requeueRequest('test-key', authHeader));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      torrentId: 42,
      torrentHash: 'abc123',
      torrentName: 'Test.Show.S01E01',
    });
    expect(requeuedWith).not.toBeNull();
    expect(requeuedWith![0]).toBe('test-key');
    expect(requeuedWith![1]).toMatchObject({ torrentId: 42, torrentHash: 'abc123' });
  });
});

describe('GET /api/transmission/torrents', () => {
  it('returns empty torrents when no candidates have a hash', async () => {
    const deps = createDeps({
      listCandidateStates: () => [],
    });
    const handler = createApiFetch(deps);
    const response = await handler(
      new Request('http://localhost/api/transmission/torrents'),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ torrents: [] });
  });

  it('returns 502 when Transmission is unreachable', async () => {
    const mockCandidate = {
      identityKey: 'tv:breaking bad|s01e01',
      mediaType: 'tv' as const,
      status: 'queued' as const,
      transmissionTorrentHash: 'abc123',
      ruleName: 'Breaking Bad',
      score: 10,
      reasons: [],
      rawTitle: 'Breaking.Bad.S01E01',
      normalizedTitle: 'Breaking Bad',
      feedName: 'tv-feed',
      guidOrLink: 'https://example.test/1',
      publishedAt: '2026-04-01T00:00:00Z',
      downloadUrl: 'https://example.test/1.torrent',
      firstSeenRunId: 1,
      lastSeenRunId: 1,
      updatedAt: '2026-04-01T00:00:00Z',
    };

    const deps = createDeps({
      listCandidateStates: () => [mockCandidate],
    });

    deps.config = {
      ...deps.config,
      transmission: {
        url: 'http://127.0.0.1:1/transmission/rpc',
        username: 'u',
        password: 'p',
      },
    };

    const handler = createApiFetch(deps);
    const response = await handler(
      new Request('http://localhost/api/transmission/torrents'),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: 'transmission unavailable',
    });
  });
});

describe('GET /api/transmission/session', () => {
  it('returns 502 when Transmission is unreachable', async () => {
    const deps = createDeps();
    deps.config = {
      ...deps.config,
      transmission: {
        url: 'http://127.0.0.1:1/transmission/rpc',
        username: 'u',
        password: 'p',
      },
    };

    const handler = createApiFetch(deps);
    const response = await handler(
      new Request('http://localhost/api/transmission/session'),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: 'transmission unavailable',
    });
  });
});

describe('POST /api/daemon/restart', () => {
  it('returns 403 when writes are disabled', async () => {
    const deps = createDeps();
    const handler = createApiFetch(deps);
    const res = await handler(
      new Request('http://localhost/api/daemon/restart', { method: 'POST' }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 401 when bearer token is missing', async () => {
    const deps = createDeps();
    deps.config = {
      ...deps.config,
      runtime: { ...deps.config.runtime, apiWriteToken: 'tok' },
    };
    const handler = createApiFetch(deps);
    const res = await handler(
      new Request('http://localhost/api/daemon/restart', { method: 'POST' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when bearer token is wrong', async () => {
    const deps = createDeps();
    deps.config = {
      ...deps.config,
      runtime: { ...deps.config.runtime, apiWriteToken: 'tok' },
    };
    const handler = createApiFetch(deps);
    const res = await handler(
      new Request('http://localhost/api/daemon/restart', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong' },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 200 ok and queues SIGTERM on valid auth', async () => {
    const killSpy = spyOn(process, 'kill').mockImplementation(
      () => undefined as never,
    );
    try {
      const deps = createDeps();
      deps.config = {
        ...deps.config,
        runtime: { ...deps.config.runtime, apiWriteToken: 'tok' },
      };
      const handler = createApiFetch(deps);
      const res = await handler(
        new Request('http://localhost/api/daemon/restart', {
          method: 'POST',
          headers: { Authorization: 'Bearer tok' },
        }),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      // Flush the microtask queue so queueMicrotask fires before we assert.
      await Promise.resolve();
      expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    } finally {
      killSpy.mockRestore();
    }
  });
});

describe('POST /api/transmission/ping', () => {
  it('returns 403 when writes are disabled', async () => {
    const deps = createDeps();
    const handler = createApiFetch(deps);
    const res = await handler(
      new Request('http://localhost/api/transmission/ping', { method: 'POST' }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 401 when bearer token is missing', async () => {
    const deps = createDeps();
    deps.config = {
      ...deps.config,
      runtime: { ...deps.config.runtime, apiWriteToken: 'tok' },
    };
    const handler = createApiFetch(deps);
    const res = await handler(
      new Request('http://localhost/api/transmission/ping', { method: 'POST' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when bearer token is wrong', async () => {
    const deps = createDeps();
    deps.config = {
      ...deps.config,
      runtime: { ...deps.config.runtime, apiWriteToken: 'tok' },
    };
    const handler = createApiFetch(deps);
    const res = await handler(
      new Request('http://localhost/api/transmission/ping', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong' },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 502 when Transmission is unreachable', async () => {
    const deps = createDeps();
    deps.config = {
      ...deps.config,
      runtime: { ...deps.config.runtime, apiWriteToken: 'tok' },
      transmission: {
        url: 'http://127.0.0.1:1/transmission/rpc',
        username: 'u',
        password: 'p',
      },
    };
    const handler = createApiFetch(deps);
    const res = await handler(
      new Request('http://localhost/api/transmission/ping', {
        method: 'POST',
        headers: { Authorization: 'Bearer tok' },
      }),
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false });
  });
});

describe('GET /api/config — tvDefaults', () => {
  it('includes tvDefaults in response when config uses compact tv format', async () => {
    const prevWrite = process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    delete process.env.PIRATE_CLAW_API_WRITE_TOKEN;
    try {
      const dir = await mkdtemp(join(tmpdir(), 'pirate-claw-test-'));
      const configPath = join(dir, 'pirate-claw.config.json');
      await writeCompactTvConfigFile(configPath);
      const loaded = await loadConfig(configPath);
      const deps = createDeps();
      deps.config = loaded;
      deps.configPath = configPath;
      const handler = createApiFetch(deps);
      const res = await handler(new Request('http://localhost/api/config'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tvDefaults).toEqual({
        resolutions: ['1080p'],
        codecs: ['x265'],
      });
    } finally {
      if (prevWrite !== undefined)
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = prevWrite;
    }
  });
});

describe('redactConfig', () => {
  it('redacts transmission username and password', () => {
    const config = stubConfig();
    config.runtime.apiWriteToken = 'write-token';
    const redacted = redactConfig(config);

    expect(redacted.transmission.username).toBe('[redacted]');
    expect(redacted.transmission.password).toBe('[redacted]');
    expect(redacted.runtime.apiWriteToken).toBe('[redacted]');
    expect(config.transmission.username).toBe('user');
    expect(config.runtime.apiWriteToken).toBe('write-token');
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

  it('redacts plex token when present', () => {
    const config: AppConfig = {
      ...stubConfig(),
      plex: {
        url: 'http://plex.local:32400',
        token: 'secret-plex',
        refreshIntervalMinutes: 30,
      },
    };
    const redacted = redactConfig(config);

    expect(redacted.plex?.token).toBe('[redacted]');
    expect(config.plex?.token).toBe('secret-plex');
  });
});

describe('build Plex defaults', () => {
  it('sets unknown Plex fields on movie breakdowns', () => {
    const movies = buildMovieBreakdowns([
      {
        identityKey: 'movie:example movie|2024',
        mediaType: 'movie',
        status: 'queued',
        ruleName: 'Example Movie',
        score: 100,
        reasons: ['matched'],
        rawTitle: 'Example Movie 2024 1080p x265',
        normalizedTitle: 'Example Movie',
        year: 2024,
        feedName: 'Movie Feed',
        guidOrLink: 'https://example.test/movie',
        publishedAt: '2026-01-01T00:00:00Z',
        downloadUrl: 'https://example.test/movie.torrent',
        firstSeenRunId: 1,
        lastSeenRunId: 1,
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]);

    expect(movies[0]).toMatchObject({
      plexStatus: 'unknown',
      watchCount: null,
      lastWatchedAt: null,
    });
  });

  it('sets unknown Plex fields on show breakdowns', () => {
    const shows = buildShowBreakdowns([
      {
        identityKey: 'tv:example show|1|1',
        mediaType: 'tv',
        status: 'queued',
        ruleName: 'Example Show',
        score: 100,
        reasons: ['matched'],
        rawTitle: 'Example.Show.S01E01.1080p.x265',
        normalizedTitle: 'Example Show',
        season: 1,
        episode: 1,
        feedName: 'TV Feed',
        guidOrLink: 'https://example.test/show',
        publishedAt: '2026-01-01T00:00:00Z',
        downloadUrl: 'https://example.test/show.torrent',
        firstSeenRunId: 1,
        lastSeenRunId: 1,
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]);

    expect(shows[0]).toMatchObject({
      plexStatus: 'unknown',
      watchCount: null,
      lastWatchedAt: null,
    });
  });
});
