import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import type { TmdbHttpClient, TmdbTvSeasonDetails } from '../src/tmdb/client';
import { TmdbCache } from '../src/tmdb/cache';
import type { TvEnrichDeps } from '../src/tmdb/tv-enrichment';
import type {
  PlexEpisodeSummary,
  PlexHttpClient,
  PlexSearchResult,
  PlexSeasonSummary,
} from '../src/plex/client';
import { PlexCache } from '../src/plex/cache';
import { ManualGrabsStore } from '../src/manual-grabs/store';
import {
  buildShowEpisodeStatus,
  resolveDefaultSeason,
} from '../src/shows/episode-status';
import { ensureSchema } from '../src/repository';
import type { ShowBreakdown } from '../src/tv-api-types';

function freshDb(): Database {
  const db = new Database(':memory:');
  ensureSchema(db);
  return db;
}

function fakeTmdb(
  seasons: Record<number, TmdbTvSeasonDetails['episodes']>,
): TvEnrichDeps {
  const client = {
    getTvSeason: async (_tvId: number, seasonNumber: number) =>
      seasons[seasonNumber]
        ? { season_number: seasonNumber, episodes: seasons[seasonNumber] }
        : null,
  } as unknown as TmdbHttpClient;

  return {
    cache: new TmdbCache(freshDb()),
    client,
    cacheTtlMs: 1000 * 60,
    negativeCacheTtlMs: 1000 * 60,
    log: () => {},
  };
}

function showFixture(numberOfSeasons: number): ShowBreakdown {
  return {
    normalizedTitle: 'strange new worlds',
    seasons: [],
    plexStatus: 'unknown',
    watchCount: null,
    lastWatchedAt: null,
    tmdb: { tmdbId: 103516, numberOfSeasons },
  };
}

describe('buildShowEpisodeStatus', () => {
  it('restricts the walk to a single season when options.season is given — no TMDB or Plex call for other seasons (the "36-season" fix)', async () => {
    const tvCalls: number[] = [];
    const tmdb: TvEnrichDeps = {
      cache: new TmdbCache(freshDb()),
      client: {
        getTvSeason: async (_tvId: number, seasonNumber: number) => {
          tvCalls.push(seasonNumber);
          return {
            season_number: seasonNumber,
            episodes: [{ episode_number: 1, air_date: '2026-01-01' }],
          };
        },
      } as unknown as TmdbHttpClient,
      cacheTtlMs: 1000 * 60,
      negativeCacheTtlMs: 1000 * 60,
      log: () => {},
    };

    const plexCalls: number[] = [];
    const plex = {
      client: {
        searchShows: async () =>
          [
            { ratingKey: 'rk-show', title: 'Strange New Worlds', type: 'show' },
          ] as PlexSearchResult[],
        getShowSeasons: async () =>
          [1, 2, 3].map(
            (n): PlexSeasonSummary => ({
              ratingKey: `rk-s${n}`,
              seasonNumber: n,
              episodeCount: 1,
            }),
          ),
        getSeasonEpisodes: async (ratingKey: string) => {
          plexCalls.push(Number(ratingKey.slice(-1)));
          return [{ episodeNumber: 1 }] as PlexEpisodeSummary[];
        },
      } as unknown as PlexHttpClient,
      cache: new PlexCache(freshDb()),
    };

    const status = await buildShowEpisodeStatus(
      showFixture(3),
      { tmdb, plex, manualGrabs: new ManualGrabsStore(freshDb()) },
      { season: 2 },
    );

    expect(status?.seasons).toHaveLength(1);
    expect(status?.seasons[0].season).toBe(2);
    expect(tvCalls).toEqual([2]);
    expect(plexCalls).toEqual([2]);
  });

  it('returns null when the show has no TMDB match yet', async () => {
    const db = freshDb();
    const result = await buildShowEpisodeStatus(
      { ...showFixture(1), tmdb: undefined },
      {
        tmdb: fakeTmdb({}),
        manualGrabs: new ManualGrabsStore(db),
      },
    );
    expect(result).toBeNull();
  });

  it('marks every episode unknown when no Plex dep is configured', async () => {
    const db = freshDb();
    const tmdb = fakeTmdb({
      1: [
        { episode_number: 1, name: 'Pilot' },
        { episode_number: 2, name: 'Two' },
      ],
    });

    const result = await buildShowEpisodeStatus(showFixture(1), {
      tmdb,
      manualGrabs: new ManualGrabsStore(db),
    });

    expect(result?.plexReachable).toBe(false);
    expect(result?.seasons[0].episodes.map((e) => e.plexStatus)).toEqual([
      'unknown',
      'unknown',
    ]);
  });

  it('marks every episode missing when Plex was checked and the show is confidently not in the library', async () => {
    const db = freshDb();
    const tmdb = fakeTmdb({ 1: [{ episode_number: 1, name: 'Pilot' }] });
    const plexCache = new PlexCache(db);
    plexCache.upsertTv({
      normalizedTitle: 'strange new worlds',
      plexRatingKey: null,
      inLibrary: false,
      watchCount: 0,
      lastWatchedAt: null,
      cachedAt: new Date().toISOString(),
    });

    const plexClient = {
      // Live search succeeds but (correctly) finds nothing — falls through
      // to the cache, which confidently says not in library.
      searchShows: async (): Promise<PlexSearchResult[]> => [],
    } as unknown as PlexHttpClient;

    const result = await buildShowEpisodeStatus(showFixture(1), {
      tmdb,
      plex: { client: plexClient, cache: plexCache },
      manualGrabs: new ManualGrabsStore(db),
    });

    expect(result?.plexReachable).toBe(true);
    expect(result?.seasons[0].episodes[0].plexStatus).toBe('missing');
  });

  it('reproduces the real Strange New Worlds S4 gap: some episodes in Plex, some missing, season count mismatch flagged', async () => {
    const db = freshDb();
    const tmdb = fakeTmdb({
      4: [
        {
          episode_number: 1,
          name: 'Valles Marineris',
          air_date: '2026-07-23',
        },
        {
          episode_number: 2,
          name: 'The Griffin Incident',
          air_date: '2026-07-30',
        },
        {
          episode_number: 3,
          name: 'Human Best Friend',
          air_date: '2026-08-06',
        },
      ],
    });
    const plexCache = new PlexCache(db);
    plexCache.upsertTv({
      normalizedTitle: 'strange new worlds',
      plexRatingKey: '35033',
      inLibrary: true,
      watchCount: 0,
      lastWatchedAt: null,
      cachedAt: new Date().toISOString(),
    });

    const plexClient = {
      searchShows: async (): Promise<PlexSearchResult[]> => [
        {
          ratingKey: '35033',
          title: 'Star Trek: Strange New Worlds',
          type: 'show',
        },
      ],
      getShowSeasons: async (): Promise<PlexSeasonSummary[]> => [
        { ratingKey: '68673', seasonNumber: 4, episodeCount: 1 },
      ],
      getSeasonEpisodes: async (): Promise<PlexEpisodeSummary[]> => [
        { episodeNumber: 2, title: 'The Griffin Incident' },
      ],
    } as unknown as PlexHttpClient;

    const result = await buildShowEpisodeStatus(showFixture(4), {
      tmdb,
      plex: { client: plexClient, cache: plexCache },
      manualGrabs: new ManualGrabsStore(db),
    });

    const season4 = result?.seasons.find((s) => s.season === 4);
    expect(season4?.episodeCountMismatch).toBe(true); // Plex leafCount=1 vs TMDB 3
    expect(season4?.episodes.map((e) => [e.episode, e.plexStatus])).toEqual([
      [1, 'missing'],
      [2, 'in_library'],
      [3, 'missing'],
    ]);
  });

  it('does not flag a mismatch just because TMDB lists unaired future episodes (real Stuart Fails to Save the Universe reproduction)', async () => {
    // Confirmed live: TMDB's season endpoint lists the full planned season
    // up front, most with a future air_date — for a currently-airing show,
    // Plex's leafCount can never match that full count since unaired
    // episodes don't exist as files yet. Comparing against the aired-so-far
    // count (not the full list) is what episodeCountMismatch must do.
    const db = freshDb();
    // Dates computed relative to the real wall clock (not hardcoded), so
    // this test keeps reproducing the real scenario indefinitely rather
    // than silently drifting stale once real time passes fixed dates.
    const daysFromNow = (n: number): string =>
      new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const tmdb = fakeTmdb({
      1: [
        { episode_number: 1, name: 'Ep 1', air_date: daysFromNow(-35) },
        { episode_number: 2, name: 'Ep 2', air_date: daysFromNow(-28) },
        { episode_number: 3, name: 'Ep 3', air_date: daysFromNow(-21) },
        { episode_number: 4, name: 'Ep 4', air_date: daysFromNow(-14) },
        { episode_number: 5, name: 'Ep 5', air_date: daysFromNow(-7) },
        { episode_number: 6, name: 'Ep 6', air_date: daysFromNow(-1) },
        // Unaired as of today — must not count toward the mismatch
        // comparison.
        { episode_number: 7, name: 'Ep 7', air_date: daysFromNow(6) },
        { episode_number: 8, name: 'Ep 8', air_date: daysFromNow(13) },
        { episode_number: 9, name: 'Ep 9', air_date: daysFromNow(20) },
        { episode_number: 10, name: 'Ep 10', air_date: daysFromNow(27) },
      ],
    });
    const plexCache = new PlexCache(db);
    plexCache.upsertTv({
      normalizedTitle: 'strange new worlds',
      plexRatingKey: '287620',
      inLibrary: true,
      watchCount: 0,
      lastWatchedAt: null,
      cachedAt: new Date().toISOString(),
    });

    const plexClient = {
      searchShows: async (): Promise<PlexSearchResult[]> => [
        {
          ratingKey: '287620',
          title: 'Stuart Fails to Save the Universe',
          type: 'show',
        },
      ],
      getShowSeasons: async (): Promise<PlexSeasonSummary[]> => [
        { ratingKey: 's1', seasonNumber: 1, episodeCount: 6 },
      ],
      getSeasonEpisodes: async (): Promise<PlexEpisodeSummary[]> =>
        [1, 2, 3, 4, 5, 6].map((n) => ({ episodeNumber: n })),
    } as unknown as PlexHttpClient;

    const result = await buildShowEpisodeStatus(showFixture(1), {
      tmdb,
      plex: { client: plexClient, cache: plexCache },
      manualGrabs: new ManualGrabsStore(db),
    });

    const season1 = result?.seasons.find((s) => s.season === 1);
    expect(season1?.episodeCountMismatch).toBe(false);
    expect(season1?.episodes).toHaveLength(10);
  });

  it('trusts a live search over a stale "not in library" cache row (the real Shards staleness bug)', async () => {
    // Reported live: The Shards' episode was actually in Plex, downloaded
    // and complete, but still showed as missing — because the ratingKey
    // lookup only ever consulted plex_tv_cache, a periodically-refreshed
    // background snapshot that can lag behind Plex's actual current state.
    // A live search must be able to override a stale negative.
    const db = freshDb();
    const tmdb = fakeTmdb({ 1: [{ episode_number: 1, name: 'Pilot' }] });
    const plexCache = new PlexCache(db);
    plexCache.upsertTv({
      normalizedTitle: 'the shards',
      plexRatingKey: null,
      inLibrary: false,
      watchCount: 0,
      lastWatchedAt: null,
      cachedAt: new Date().toISOString(),
    });

    const plexClient = {
      searchShows: async (): Promise<PlexSearchResult[]> => [
        { ratingKey: '99001', title: 'The Shards', type: 'show' },
      ],
      getShowSeasons: async (): Promise<PlexSeasonSummary[]> => [
        { ratingKey: 'ss1', seasonNumber: 1, episodeCount: 1 },
      ],
      getSeasonEpisodes: async (): Promise<PlexEpisodeSummary[]> => [
        { episodeNumber: 1, title: 'Pilot' },
      ],
    } as unknown as PlexHttpClient;

    const result = await buildShowEpisodeStatus(
      { ...showFixture(1), normalizedTitle: 'the shards' },
      {
        tmdb,
        plex: { client: plexClient, cache: plexCache },
        manualGrabs: new ManualGrabsStore(db),
      },
    );

    expect(result?.plexReachable).toBe(true);
    expect(result?.seasons[0].episodes[0].plexStatus).toBe('in_library');
  });

  it('falls back to cache when a live search errors, rather than going unreachable', async () => {
    const db = freshDb();
    const tmdb = fakeTmdb({ 1: [{ episode_number: 1, name: 'Pilot' }] });
    const plexCache = new PlexCache(db);
    plexCache.upsertTv({
      normalizedTitle: 'strange new worlds',
      plexRatingKey: '35033',
      inLibrary: true,
      watchCount: 0,
      lastWatchedAt: null,
      cachedAt: new Date().toISOString(),
    });

    const plexClient = {
      // null == request failed, same contract as the rest of PlexHttpClient.
      searchShows: async (): Promise<PlexSearchResult[] | null> => null,
      getShowSeasons: async (): Promise<PlexSeasonSummary[]> => [
        { ratingKey: '68673', seasonNumber: 1, episodeCount: 1 },
      ],
      getSeasonEpisodes: async (): Promise<PlexEpisodeSummary[]> => [
        { episodeNumber: 1, title: 'Pilot' },
      ],
    } as unknown as PlexHttpClient;

    const result = await buildShowEpisodeStatus(showFixture(1), {
      tmdb,
      plex: { client: plexClient, cache: plexCache },
      manualGrabs: new ManualGrabsStore(db),
    });

    expect(result?.plexReachable).toBe(true);
    expect(result?.seasons[0].episodes[0].plexStatus).toBe('in_library');
  });

  it('attaches the latest manual grab record to its episode', async () => {
    const db = freshDb();
    const tmdb = fakeTmdb({ 4: [{ episode_number: 1, name: 'Ep 1' }] });
    const manualGrabs = new ManualGrabsStore(db);
    manualGrabs.record({
      normalizedTitle: 'strange new worlds',
      season: 4,
      episode: 1,
      source: 'eztv',
      rawTitle: 'grabbed release',
      transmissionTorrentHash: 'abc',
      transmissionTorrentId: 1,
    });

    const result = await buildShowEpisodeStatus(showFixture(4), {
      tmdb,
      manualGrabs,
    });

    expect(result?.seasons[0].episodes[0].manualGrabs).toMatchObject([
      { source: 'eztv', rawTitle: 'grabbed release' },
    ]);
  });

  it('drops a manual grab already marked removed/deleted — the "Queued" badge must revert to plain plexStatus, not stick forever (grill-me: torrent queue/grab UX fixes, 2026-09-01)', async () => {
    const db = freshDb();
    const tmdb = fakeTmdb({ 4: [{ episode_number: 1, name: 'Ep 1' }] });
    const manualGrabs = new ManualGrabsStore(db);
    manualGrabs.record({
      normalizedTitle: 'strange new worlds',
      season: 4,
      episode: 1,
      source: 'eztv',
      rawTitle: 'stalled release',
      transmissionTorrentHash: 'stalled-hash',
      transmissionTorrentId: 1,
    });
    manualGrabs.setDisposition('stalled-hash', 'deleted');

    const result = await buildShowEpisodeStatus(showFixture(4), {
      tmdb,
      manualGrabs,
    });

    expect(result?.seasons[0].episodes[0].manualGrabs).toEqual([]);
  });

  it('keeps only the still-active grab when an older one for the same episode was removed/deleted', async () => {
    const db = freshDb();
    const tmdb = fakeTmdb({ 4: [{ episode_number: 1, name: 'Ep 1' }] });
    const manualGrabs = new ManualGrabsStore(db);
    manualGrabs.record({
      normalizedTitle: 'strange new worlds',
      season: 4,
      episode: 1,
      source: 'eztv',
      rawTitle: 'first attempt, stalled',
      transmissionTorrentHash: 'first-hash',
      transmissionTorrentId: 1,
      queuedAt: '2026-08-01T00:00:00.000Z',
    });
    manualGrabs.setDisposition('first-hash', 'deleted');
    manualGrabs.record({
      normalizedTitle: 'strange new worlds',
      season: 4,
      episode: 1,
      source: 'thepiratebay',
      rawTitle: 'second attempt, active',
      transmissionTorrentHash: 'second-hash',
      transmissionTorrentId: 2,
      queuedAt: '2026-08-02T00:00:00.000Z',
    });

    const result = await buildShowEpisodeStatus(showFixture(4), {
      tmdb,
      manualGrabs,
    });

    expect(result?.seasons[0].episodes[0].manualGrabs).toMatchObject([
      { source: 'thepiratebay', rawTitle: 'second attempt, active' },
    ]);
  });

  it('keeps BOTH grabs visible when a replacement is queued before the stalled one is removed — the actual bug this follow-up fixes (2026-09-02)', async () => {
    const db = freshDb();
    const tmdb = fakeTmdb({ 4: [{ episode_number: 1, name: 'Ep 1' }] });
    const manualGrabs = new ManualGrabsStore(db);
    manualGrabs.record({
      normalizedTitle: 'strange new worlds',
      season: 4,
      episode: 1,
      source: 'eztv',
      rawTitle: 'first attempt, stalled but not yet removed',
      transmissionTorrentHash: 'first-hash',
      transmissionTorrentId: 1,
      queuedAt: '2026-08-01T00:00:00.000Z',
    });
    // No setDisposition call — this grab is still active, same as a
    // stalled-but-not-yet-cleared torrent in Transmission.
    manualGrabs.record({
      normalizedTitle: 'strange new worlds',
      season: 4,
      episode: 1,
      source: 'thepiratebay',
      rawTitle: 'second attempt, just grabbed',
      transmissionTorrentHash: 'second-hash',
      transmissionTorrentId: 2,
      queuedAt: '2026-08-02T00:00:00.000Z',
    });

    const result = await buildShowEpisodeStatus(showFixture(4), {
      tmdb,
      manualGrabs,
    });

    // Most-recent-first, matching listForShow's own ordering.
    expect(result?.seasons[0].episodes[0].manualGrabs).toMatchObject([
      { source: 'thepiratebay', rawTitle: 'second attempt, just grabbed' },
      {
        source: 'eztv',
        rawTitle: 'first attempt, stalled but not yet removed',
      },
    ]);
  });

  it('prefers a cached ratingKey over a live library-wide search — the expensive call is skipped entirely when the cache already has a positive row', async () => {
    const db = freshDb();
    const tmdb = fakeTmdb({ 1: [{ episode_number: 1, name: 'Pilot' }] });
    const plexCache = new PlexCache(db);
    plexCache.upsertTv({
      normalizedTitle: 'strange new worlds',
      plexRatingKey: '35033',
      inLibrary: true,
      watchCount: 0,
      lastWatchedAt: null,
      cachedAt: new Date().toISOString(),
    });

    let searchCalls = 0;
    const seasonsForKey: string[] = [];
    const plexClient = {
      searchShows: async (): Promise<PlexSearchResult[]> => {
        searchCalls++;
        return [];
      },
      getShowSeasons: async (ratingKey: string) => {
        seasonsForKey.push(ratingKey);
        return [
          { ratingKey: '68673', seasonNumber: 1, episodeCount: 1 },
        ] as PlexSeasonSummary[];
      },
      getSeasonEpisodes: async (): Promise<PlexEpisodeSummary[]> => [
        { episodeNumber: 1, title: 'Pilot' },
      ],
    } as unknown as PlexHttpClient;

    const result = await buildShowEpisodeStatus(showFixture(1), {
      tmdb,
      plex: { client: plexClient, cache: plexCache },
      manualGrabs: new ManualGrabsStore(db),
    });

    expect(searchCalls).toBe(0);
    expect(seasonsForKey).toEqual(['35033']);
    expect(result?.seasons[0].episodes[0].plexStatus).toBe('in_library');
  });

  it('falls back to a live search when the cached ratingKey resolves to a live-but-wrong item (200 OK, zero seasons)', async () => {
    // A ratingKey reused by an unrelated item after a library rebuild answers
    // 200 with no season children — `[]`, not `null`. Trusting that would
    // report every episode of a fully-owned show as missing and invite a
    // full re-grab, so an empty result must trigger the same re-search a
    // failed one does.
    const db = freshDb();
    const tmdb = fakeTmdb({ 1: [{ episode_number: 1, name: 'Pilot' }] });
    const plexCache = new PlexCache(db);
    plexCache.upsertTv({
      normalizedTitle: 'strange new worlds',
      plexRatingKey: 'reused-key',
      inLibrary: true,
      watchCount: 0,
      lastWatchedAt: null,
      cachedAt: new Date().toISOString(),
    });

    const plexClient = {
      searchShows: async (): Promise<PlexSearchResult[]> => [
        {
          ratingKey: 'correct-key',
          title: 'Star Trek: Strange New Worlds',
          type: 'show',
        },
      ],
      getShowSeasons: async (ratingKey: string) =>
        ratingKey === 'reused-key'
          ? ([] as PlexSeasonSummary[])
          : ([
              { ratingKey: '68673', seasonNumber: 1, episodeCount: 1 },
            ] as PlexSeasonSummary[]),
      getSeasonEpisodes: async (): Promise<PlexEpisodeSummary[]> => [
        { episodeNumber: 1, title: 'Pilot' },
      ],
    } as unknown as PlexHttpClient;

    const result = await buildShowEpisodeStatus(showFixture(1), {
      tmdb,
      plex: { client: plexClient, cache: plexCache },
      manualGrabs: new ManualGrabsStore(db),
    });

    expect(result?.seasons[0].episodes[0].plexStatus).toBe('in_library');
  });

  it('falls back to a live search when the cached ratingKey turns out to be stale', async () => {
    const db = freshDb();
    const tmdb = fakeTmdb({ 1: [{ episode_number: 1, name: 'Pilot' }] });
    const plexCache = new PlexCache(db);
    plexCache.upsertTv({
      normalizedTitle: 'strange new worlds',
      plexRatingKey: 'stale-key',
      inLibrary: true,
      watchCount: 0,
      lastWatchedAt: null,
      cachedAt: new Date().toISOString(),
    });

    const plexClient = {
      searchShows: async (): Promise<PlexSearchResult[]> => [
        {
          ratingKey: 'fresh-key',
          title: 'Star Trek: Strange New Worlds',
          type: 'show',
        },
      ],
      // The stale key no longer resolves; the re-searched one does.
      getShowSeasons: async (ratingKey: string) =>
        ratingKey === 'stale-key'
          ? null
          : ([
              { ratingKey: '68673', seasonNumber: 1, episodeCount: 1 },
            ] as PlexSeasonSummary[]),
      getSeasonEpisodes: async (): Promise<PlexEpisodeSummary[]> => [
        { episodeNumber: 1, title: 'Pilot' },
      ],
    } as unknown as PlexHttpClient;

    const result = await buildShowEpisodeStatus(showFixture(1), {
      tmdb,
      plex: { client: plexClient, cache: plexCache },
      manualGrabs: new ManualGrabsStore(db),
    });

    expect(result?.plexReachable).toBe(true);
    expect(result?.seasons[0].episodes[0].plexStatus).toBe('in_library');
  });

  describe('cached-completion fast path', () => {
    /** A season that finished airing well over SEASON_FINISHED_BUFFER_MS ago
     * — the eligibility gate for answering from cached counts. */
    function longFinishedSeason() {
      return [
        { episode_number: 1, name: 'One', air_date: '2003-01-05' },
        { episode_number: 2, name: 'Two', air_date: '2003-01-12' },
      ];
    }

    function countingPlex(db: Database) {
      const calls: string[] = [];
      const client = {
        searchShows: async () => {
          calls.push('searchShows');
          return [] as PlexSearchResult[];
        },
        getShowSeasons: async () => {
          calls.push('getShowSeasons');
          return [] as PlexSeasonSummary[];
        },
        getSeasonEpisodes: async () => {
          calls.push('getSeasonEpisodes');
          return [] as PlexEpisodeSummary[];
        },
      } as unknown as PlexHttpClient;
      return { calls, plex: { client, cache: new PlexCache(db) } };
    }

    it('answers a finished, fully-owned season from cached counts with zero Plex calls', async () => {
      const db = freshDb();
      const { calls, plex } = countingPlex(db);

      const result = await buildShowEpisodeStatus(
        {
          ...showFixture(5),
          seasonCompletions: [
            {
              season: 5,
              airedCount: 2,
              ownedCount: 2,
              cachedAt: new Date().toISOString(),
              episodeCountMismatch: false,
            },
          ],
        },
        {
          tmdb: fakeTmdb({ 5: longFinishedSeason() }),
          plex,
          manualGrabs: new ManualGrabsStore(db),
        },
        { season: 5 },
      );

      expect(calls).toEqual([]);
      expect(result?.plexReachable).toBe(true);
      expect(result?.seasons[0].plexSource).toBe('cached-completion');
      expect(result?.seasons[0].episodes.map((e) => e.plexStatus)).toEqual([
        'in_library',
        'in_library',
      ]);
      // No live leafCount was read, so there is nothing to compare against.
      expect(result?.seasons[0].episodeCountMismatch).toBeUndefined();
    });

    it('still walks Plex when the cached counts say the season is only partly owned', async () => {
      const db = freshDb();
      const { calls, plex } = countingPlex(db);

      const result = await buildShowEpisodeStatus(
        {
          ...showFixture(5),
          seasonCompletions: [
            {
              season: 5,
              airedCount: 2,
              ownedCount: 1,
              cachedAt: new Date().toISOString(),
              episodeCountMismatch: false,
            },
          ],
        },
        {
          tmdb: fakeTmdb({ 5: longFinishedSeason() }),
          plex,
          manualGrabs: new ManualGrabsStore(db),
        },
        { season: 5 },
      );

      expect(calls).toContain('searchShows');
      expect(result?.seasons[0].plexSource).toBe('live');
    });

    it('never short-circuits a currently-airing season — that is the one whose status actually changes', async () => {
      const db = freshDb();
      const { calls, plex } = countingPlex(db);
      const airingSoon = new Date(Date.now() + 7 * 86_400_000)
        .toISOString()
        .slice(0, 10);

      const result = await buildShowEpisodeStatus(
        {
          ...showFixture(5),
          seasonCompletions: [
            {
              season: 5,
              airedCount: 1,
              ownedCount: 1,
              cachedAt: new Date().toISOString(),
              episodeCountMismatch: false,
            },
          ],
        },
        {
          tmdb: fakeTmdb({
            5: [
              { episode_number: 1, name: 'Aired', air_date: '2003-01-05' },
              { episode_number: 2, name: 'Next week', air_date: airingSoon },
            ],
          }),
          plex,
          manualGrabs: new ManualGrabsStore(db),
        },
        { season: 5 },
      );

      expect(calls).toContain('searchShows');
      expect(result?.seasons[0].plexSource).toBe('live');
    });

    it('ignores a completion row whose airedCount no longer matches TMDB — a season that gained an episode must be re-walked, not marked owned', async () => {
      const db = freshDb();
      const { calls, plex } = countingPlex(db);

      const result = await buildShowEpisodeStatus(
        {
          ...showFixture(5),
          seasonCompletions: [
            {
              season: 5,
              // Written when TMDB listed 2 episodes; it now lists 3.
              airedCount: 2,
              ownedCount: 2,
              cachedAt: new Date().toISOString(),
              episodeCountMismatch: false,
            },
          ],
        },
        {
          tmdb: fakeTmdb({
            5: [
              ...longFinishedSeason(),
              { episode_number: 3, name: 'Three', air_date: '2003-01-19' },
            ],
          }),
          plex,
          manualGrabs: new ManualGrabsStore(db),
        },
        { season: 5 },
      );

      expect(calls).toContain('searchShows');
      expect(result?.seasons[0].plexSource).toBe('live');
    });

    it('refuses a season whose last live walk saw an episode-count mismatch — otherwise its warning banner would be suppressed forever', async () => {
      const db = freshDb();
      const { calls, plex } = countingPlex(db);

      const result = await buildShowEpisodeStatus(
        {
          ...showFixture(5),
          seasonCompletions: [
            {
              season: 5,
              airedCount: 2,
              ownedCount: 2,
              cachedAt: new Date().toISOString(),
              // Plex holds more files than TMDB lists; ownedCount still
              // reaches airedCount, so without this gate the season stays
              // cache-eligible forever and the banner never returns.
              episodeCountMismatch: true,
            },
          ],
        },
        {
          tmdb: fakeTmdb({ 5: longFinishedSeason() }),
          plex,
          manualGrabs: new ManualGrabsStore(db),
        },
        { season: 5 },
      );

      expect(calls).toContain('searchShows');
      expect(result?.seasons[0].plexSource).toBe('live');
    });

    it('refuses a row predating the mismatch column — unknown is not "no mismatch"', async () => {
      const db = freshDb();
      const { calls, plex } = countingPlex(db);

      const result = await buildShowEpisodeStatus(
        {
          ...showFixture(5),
          seasonCompletions: [
            {
              season: 5,
              airedCount: 2,
              ownedCount: 2,
              cachedAt: new Date().toISOString(),
              // episodeCountMismatch deliberately absent.
            },
          ],
        },
        {
          tmdb: fakeTmdb({ 5: longFinishedSeason() }),
          plex,
          manualGrabs: new ManualGrabsStore(db),
        },
        { season: 5 },
      );

      expect(calls).toContain('searchShows');
      expect(result?.seasons[0].plexSource).toBe('live');
    });

    it('re-verifies once the cached row ages out, so an out-of-band deletion cannot stay invisible forever', async () => {
      const db = freshDb();
      const { calls, plex } = countingPlex(db);
      const longAgo = new Date(
        Date.now() - 400 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const result = await buildShowEpisodeStatus(
        {
          ...showFixture(5),
          seasonCompletions: [
            {
              season: 5,
              airedCount: 2,
              ownedCount: 2,
              cachedAt: longAgo,
              episodeCountMismatch: false,
            },
          ],
        },
        {
          tmdb: fakeTmdb({ 5: longFinishedSeason() }),
          plex,
          manualGrabs: new ManualGrabsStore(db),
        },
        { season: 5 },
      );

      expect(calls).toContain('searchShows');
      expect(result?.seasons[0].plexSource).toBe('live');
    });

    it('forceLivePlex re-verifies even an eligible season — that is what "Refresh Plex" means', async () => {
      const db = freshDb();
      const { calls, plex } = countingPlex(db);

      const result = await buildShowEpisodeStatus(
        {
          ...showFixture(5),
          seasonCompletions: [
            {
              season: 5,
              airedCount: 2,
              ownedCount: 2,
              cachedAt: new Date().toISOString(),
              episodeCountMismatch: false,
            },
          ],
        },
        {
          tmdb: fakeTmdb({ 5: longFinishedSeason() }),
          plex,
          manualGrabs: new ManualGrabsStore(db),
        },
        { season: 5, forceLivePlex: true },
      );

      expect(calls).toContain('searchShows');
      expect(result?.seasons[0].plexSource).toBe('live');
    });
  });
});

describe('resolveDefaultSeason', () => {
  it('steps down when TMDB lists the top season but has published no episodes for it (the Simpsons S38 case)', async () => {
    const tmdb = fakeTmdb({
      37: [{ episode_number: 1, name: 'Ep 1', air_date: '2025-09-28' }],
      // No key for 38 — fakeTmdb's client returns null, same as TMDB
      // publishing an announced season with an empty episode list.
    });

    expect(await resolveDefaultSeason(showFixture(38), tmdb)).toBe(37);
  });

  it('uses the top season when it has an aired episode', async () => {
    const tmdb = fakeTmdb({
      38: [{ episode_number: 1, name: 'Ep 1', air_date: '2020-09-28' }],
    });

    expect(await resolveDefaultSeason(showFixture(38), tmdb)).toBe(38);
  });

  it('steps past a top season whose only episode is still unaired (real Simpsons S38 reproduction, 2026-09-03)', async () => {
    // TMDB publishes next season's premiere weeks ahead of broadcast. Landing
    // there shows one UNAIRED row and nothing actionable.
    const future = new Date(Date.now() + 24 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const tmdb = fakeTmdb({
      37: [{ episode_number: 1, name: 'Aired', air_date: '2025-09-28' }],
      38: [{ episode_number: 1, name: 'Upcoming', air_date: future }],
    });

    expect(await resolveDefaultSeason(showFixture(38), tmdb)).toBe(37);
  });

  it('keeps stepping down past two empty seasons to the real latest one with data', async () => {
    const tmdb = fakeTmdb({
      36: [{ episode_number: 1, name: 'Ep 1', air_date: '2025-09-28' }],
      // 37 and 38 both announced but empty.
    });

    expect(await resolveDefaultSeason(showFixture(38), tmdb)).toBe(36);
  });

  it('gives up after a bounded number of probes rather than walking every season of a broken show', async () => {
    let probes = 0;
    const tmdb: TvEnrichDeps = {
      cache: new TmdbCache(freshDb()),
      client: {
        getTvSeason: async () => {
          probes++;
          return null;
        },
      } as unknown as TmdbHttpClient,
      cacheTtlMs: 1000 * 60,
      negativeCacheTtlMs: 1000 * 60,
      log: () => {},
    };

    await resolveDefaultSeason(showFixture(38), tmdb);
    expect(probes).toBeLessThanOrEqual(3);
  });

  it('never steps below season 1 for a single-season show', async () => {
    expect(await resolveDefaultSeason(showFixture(1), fakeTmdb({}))).toBe(1);
  });

  it('returns undefined when the show has no TMDB match to count seasons from', async () => {
    expect(
      await resolveDefaultSeason(
        { ...showFixture(1), tmdb: undefined },
        fakeTmdb({}),
      ),
    ).toBeUndefined();
  });
});
