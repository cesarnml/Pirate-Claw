import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import { createApiFetch, createHealthState } from '../src/api';
import { PlexCache } from '../src/plex/cache';
import {
  enrichMovieBreakdownsFromPlexCache,
  isPlexCacheExpired,
  refreshMovieLibraryCache,
} from '../src/plex/movies';
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
  };
}

describe('plex movie enrichment', () => {
  it('writes an in-library movie cache row when Plex returns a strong match', async () => {
    const db = new Database(':memory:');
    ensurePlexSchema(db);
    const cache = new PlexCache(db);

    await refreshMovieLibraryCache(
      [
        {
          normalizedTitle: 'Example Film',
          year: 2024,
          identityKey: 'movie:example film|2024',
          status: 'queued',
          plexStatus: 'unknown',
          watchCount: null,
          lastWatchedAt: null,
        },
      ],
      {
        cache,
        client: {
          searchMovies: async () => [
            {
              ratingKey: '123',
              title: 'Example Film',
              type: 'movie',
              year: 2024,
              viewCount: 4,
              lastViewedAt: 1_712_793_600,
            },
          ],
        } as never,
        refreshIntervalMinutes: 30,
        log: () => {},
      },
    );

    expect(cache.getMovie('Example Film', 2024)).toMatchObject({
      inLibrary: true,
      plexRatingKey: '123',
      watchCount: 4,
      lastWatchedAt: '2024-04-11T00:00:00.000Z',
    });
  });

  it('writes a missing cache row when Plex returns no usable match', async () => {
    const db = new Database(':memory:');
    ensurePlexSchema(db);
    const cache = new PlexCache(db);

    await refreshMovieLibraryCache(
      [
        {
          normalizedTitle: 'Missing Film',
          year: 2024,
          identityKey: 'movie:missing film|2024',
          status: 'queued',
          plexStatus: 'unknown',
          watchCount: null,
          lastWatchedAt: null,
        },
      ],
      {
        cache,
        client: {
          searchMovies: async () => [],
        } as never,
        refreshIntervalMinutes: 30,
        log: () => {},
      },
    );

    expect(cache.getMovie('Missing Film', 2024)).toMatchObject({
      inLibrary: false,
      watchCount: 0,
      lastWatchedAt: null,
    });
  });

  it('treats stale Plex cache rows as unknown on API enrichment', () => {
    const db = new Database(':memory:');
    ensurePlexSchema(db);
    const cache = new PlexCache(db);
    cache.upsertMovie({
      title: 'Stale Film',
      year: 2024,
      plexRatingKey: '123',
      inLibrary: true,
      watchCount: 2,
      lastWatchedAt: '2026-04-01T00:00:00.000Z',
      cachedAt: '2026-04-01T00:00:00.000Z',
    });

    const movies = enrichMovieBreakdownsFromPlexCache(
      [
        {
          normalizedTitle: 'Stale Film',
          year: 2024,
          identityKey: 'movie:stale film|2024',
          status: 'queued',
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

    expect(movies[0]).toMatchObject({
      plexStatus: 'unknown',
      watchCount: null,
      lastWatchedAt: null,
    });
    expect(isPlexCacheExpired('2026-04-01T00:00:00.000Z', 30)).toBe(true);
  });

  it('surfaces Plex cache fields in GET /api/movies', async () => {
    const db = new Database(':memory:');
    ensurePlexSchema(db);
    const cache = new PlexCache(db);
    cache.upsertMovie({
      title: 'Example Film',
      year: 2024,
      plexRatingKey: '123',
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
      plexMovies: {
        cache,
        client: {} as never,
        refreshIntervalMinutes: 30,
        log: () => {},
      },
    });

    const response = await handler(new Request('http://localhost/api/movies'));
    const body = await response.json();

    expect(body.movies[0]).toMatchObject({
      plexStatus: 'in_library',
      watchCount: 5,
      lastWatchedAt: '2026-04-15T00:00:00.000Z',
    });
  });
});
