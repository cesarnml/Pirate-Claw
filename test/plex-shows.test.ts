import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import { createApiFetch, createHealthState } from '../src/api';
import { runPlexBackgroundRefresh } from '../src/plex/background-refresh';
import { PlexCache } from '../src/plex/cache';
import {
  enrichShowBreakdownsFromPlexCache,
  isPlexShowCacheExpired,
  refreshShowLibraryCache,
} from '../src/plex/shows';
import { ensurePlexSchema } from '../src/plex/schema';
import type { Repository } from '../src/repository';

function stubRepository(): Repository {
  return {
    startRun: () => ({ id: 1, startedAt: '', status: 'running' }),
    getRun: () => undefined,
    completeRun: () => ({ id: 1, startedAt: '', status: 'completed' }),
    failRun: () => ({ id: 1, startedAt: '', status: 'failed' }),
    recordFeedItem: () => ({}) as never,
    getCandidateState: () => undefined,
    isCandidateQueued: () => false,
    recordCandidateOutcome: () => ({}) as never,
    recordCandidateReconciliation: () => ({}) as never,
    recordFeedItemOutcome: () => ({}) as never,
    listFeedItemOutcomes: () => [],
    listRecentRunSummaries: () => [],
    listCandidateStates: () => [],
    listReconcilableCandidates: () => [],
    listRetryableCandidates: () => [],
    listSkippedNoMatchOutcomes: () => [],
    listDistinctUnmatchedAndFailedOutcomes: () => [],
    setPirateClawDisposition: () => {},
    trySetPirateClawDispositionIfUnset: () => true,
  };
}

describe('plex show enrichment', () => {
  it('writes an in-library show cache row when Plex returns a strong match', async () => {
    const db = new Database(':memory:');
    ensurePlexSchema(db);
    const cache = new PlexCache(db);

    await refreshShowLibraryCache(
      [
        {
          normalizedTitle: 'Example Show',
          seasons: [],
          plexStatus: 'unknown',
          watchCount: null,
          lastWatchedAt: null,
        },
      ],
      {
        cache,
        client: {
          searchShows: async () => [
            {
              ratingKey: '456',
              title: 'Example Show',
              type: 'show',
              viewCount: 6,
              lastViewedAt: 1_712_793_600,
            },
          ],
          listAllTvShowsForMatching: async () => [],
        } as never,
        refreshIntervalMinutes: 30,
        log: () => {},
      },
    );

    expect(cache.getTv('Example Show')).toMatchObject({
      inLibrary: true,
      plexRatingKey: '456',
      watchCount: 6,
      lastWatchedAt: '2024-04-11T00:00:00.000Z',
    });
  });

  it('writes a missing show cache row when Plex returns no match', async () => {
    const db = new Database(':memory:');
    ensurePlexSchema(db);
    const cache = new PlexCache(db);

    await refreshShowLibraryCache(
      [
        {
          normalizedTitle: 'Missing Show',
          seasons: [],
          plexStatus: 'unknown',
          watchCount: null,
          lastWatchedAt: null,
        },
      ],
      {
        cache,
        client: {
          searchShows: async () => [],
          listAllTvShowsForMatching: async () => [],
        } as never,
        refreshIntervalMinutes: 30,
        log: () => {},
      },
    );

    expect(cache.getTv('Missing Show')).toMatchObject({
      inLibrary: false,
      watchCount: 0,
      lastWatchedAt: null,
    });
  });

  it('matches from library catalog when global search returns no rows', async () => {
    const db = new Database(':memory:');
    ensurePlexSchema(db);
    const cache = new PlexCache(db);

    await refreshShowLibraryCache(
      [
        {
          normalizedTitle: 'The Pitt',
          seasons: [],
          plexStatus: 'unknown',
          watchCount: null,
          lastWatchedAt: null,
        },
      ],
      {
        cache,
        client: {
          searchShows: async () => [],
          listAllTvShowsForMatching: async () => [
            {
              ratingKey: '42',
              title: 'The Pitt',
              type: 'show',
              viewCount: 3,
              lastViewedAt: 1_712_793_600,
            },
          ],
        } as never,
        refreshIntervalMinutes: 30,
        log: () => {},
      },
    );

    expect(cache.getTv('The Pitt')).toMatchObject({
      inLibrary: true,
      plexRatingKey: '42',
      watchCount: 3,
      lastWatchedAt: '2024-04-11T00:00:00.000Z',
    });
  });

  it('treats stale show cache rows as unknown on API enrichment', () => {
    const db = new Database(':memory:');
    ensurePlexSchema(db);
    const cache = new PlexCache(db);
    cache.upsertTv({
      normalizedTitle: 'Stale Show',
      plexRatingKey: '456',
      inLibrary: true,
      watchCount: 3,
      lastWatchedAt: '2026-04-01T00:00:00.000Z',
      cachedAt: '2026-04-01T00:00:00.000Z',
    });

    const shows = enrichShowBreakdownsFromPlexCache(
      [
        {
          normalizedTitle: 'Stale Show',
          seasons: [],
          plexStatus: 'unknown',
          watchCount: null,
          lastWatchedAt: null,
        },
      ],
      {
        cache,
        refreshIntervalMinutes: 30,
      },
    );

    expect(shows[0]).toMatchObject({
      plexStatus: 'unknown',
      watchCount: null,
      lastWatchedAt: null,
    });
    expect(isPlexShowCacheExpired('2026-04-01T00:00:00.000Z', 30)).toBe(true);
  });

  it('surfaces Plex cache fields in GET /api/shows', async () => {
    const db = new Database(':memory:');
    ensurePlexSchema(db);
    const cache = new PlexCache(db);
    cache.upsertTv({
      normalizedTitle: 'Example Show',
      plexRatingKey: '456',
      inLibrary: true,
      watchCount: 5,
      lastWatchedAt: '2026-04-15T00:00:00.000Z',
      cachedAt: new Date().toISOString(),
    });

    const handler = createApiFetch({
      repository: {
        ...stubRepository(),
        listCandidateStates: () =>
          [
            {
              identityKey: 'tv:example show|1|1',
              mediaType: 'tv',
              status: 'queued',
              ruleName: 'Example Show',
              score: 100,
              reasons: ['matched'],
              rawTitle: 'Example.Show.S01E01.1080p',
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
          ] as never,
      },
      health: createHealthState(),
      config: {
        feeds: [],
        tv: [],
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
      },
      configPath: '/nonexistent/pirate-claw.config.json',
      pollStatePath: '/nonexistent/poll-state.json',
      loadPollState: () => ({ feeds: {} }),
      plexShows: {
        cache,
        client: {} as never,
        refreshIntervalMinutes: 30,
        log: () => {},
      },
    });

    const response = await handler(new Request('http://localhost/api/shows'));
    const body = await response.json();

    expect(body.shows[0]).toMatchObject({
      plexStatus: 'in_library',
      watchCount: 5,
      lastWatchedAt: '2026-04-15T00:00:00.000Z',
    });
  });

  it('continues refreshing later shows when one show lookup throws', async () => {
    const db = new Database(':memory:');
    ensurePlexSchema(db);
    const cache = new PlexCache(db);

    await refreshShowLibraryCache(
      [
        {
          normalizedTitle: 'Broken Show',
          seasons: [],
          plexStatus: 'unknown',
          watchCount: null,
          lastWatchedAt: null,
        },
        {
          normalizedTitle: 'Healthy Show',
          seasons: [],
          plexStatus: 'unknown',
          watchCount: null,
          lastWatchedAt: null,
        },
      ],
      {
        cache,
        client: {
          searchShows: async (title: string) => {
            if (title === 'Broken Show') {
              throw new Error('boom');
            }
            return [
              {
                ratingKey: '789',
                title: 'Healthy Show',
                type: 'show',
                viewCount: 1,
              },
            ];
          },
          listAllTvShowsForMatching: async () => [],
        } as never,
        refreshIntervalMinutes: 30,
        log: () => {},
      },
    );

    expect(cache.getTv('Broken Show')).toBeUndefined();
    expect(cache.getTv('Healthy Show')).toMatchObject({
      inLibrary: true,
      plexRatingKey: '789',
    });
  });

  it('continues the show sweep when the movie sweep fails', async () => {
    const db = new Database(':memory:');
    ensurePlexSchema(db);
    const cache = new PlexCache(db);
    const log: string[] = [];

    await runPlexBackgroundRefresh({
      repository: {
        ...stubRepository(),
        listCandidateStates: () =>
          [
            {
              identityKey: 'movie:example film|2024',
              mediaType: 'movie',
              status: 'queued',
              ruleName: 'Example Film',
              score: 100,
              reasons: ['matched'],
              rawTitle: 'Example Film 2024 1080p',
              normalizedTitle: 'Example Film',
              year: 2024,
              feedName: 'Movie Feed',
              guidOrLink: 'https://example.test/movie',
              publishedAt: '2026-01-01T00:00:00Z',
              downloadUrl: 'https://example.test/movie.torrent',
              firstSeenRunId: 1,
              lastSeenRunId: 1,
              updatedAt: '2026-01-01T00:00:00Z',
            },
            {
              identityKey: 'tv:example show|1|1',
              mediaType: 'tv',
              status: 'queued',
              ruleName: 'Example Show',
              score: 100,
              reasons: ['matched'],
              rawTitle: 'Example.Show.S01E01.1080p',
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
          ] as never,
      },
      plexMovies: {
        cache,
        client: {
          searchMovies: async () => {
            throw new Error('movie sweep failed');
          },
          listAllMoviesForMatching: async () => [],
        } as never,
        refreshIntervalMinutes: 30,
        log: () => {},
      },
      plexShows: {
        cache,
        client: {
          searchShows: async () => [
            {
              ratingKey: '456',
              title: 'Example Show',
              type: 'show',
              viewCount: 2,
            },
          ],
          listAllTvShowsForMatching: async () => [],
        } as never,
        refreshIntervalMinutes: 30,
        log: () => {},
      },
      log: (message: string) => log.push(message),
    });

    expect(cache.getTv('Example Show')).toMatchObject({
      inLibrary: true,
      plexRatingKey: '456',
    });
    expect(log.some((entry) => entry.includes('movie refresh failed'))).toBe(
      true,
    );
    expect(log).toContain('[plex] background refresh completed');
  });
});
