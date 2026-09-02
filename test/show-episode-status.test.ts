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
import { buildShowEpisodeStatus } from '../src/shows/episode-status';
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
});
