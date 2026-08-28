import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import type { TmdbHttpClient, TmdbTvSeasonDetails } from '../src/tmdb/client';
import { TmdbCache } from '../src/tmdb/cache';
import type { TvEnrichDeps } from '../src/tmdb/tv-enrichment';
import type {
  PlexEpisodeSummary,
  PlexHttpClient,
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

    const result = await buildShowEpisodeStatus(showFixture(1), {
      tmdb,
      plex: { client: {} as PlexHttpClient, cache: plexCache },
      manualGrabs: new ManualGrabsStore(db),
    });

    expect(result?.plexReachable).toBe(true);
    expect(result?.seasons[0].episodes[0].plexStatus).toBe('missing');
  });

  it('reproduces the real Strange New Worlds S4 gap: some episodes in Plex, some missing, season count mismatch flagged', async () => {
    const db = freshDb();
    const tmdb = fakeTmdb({
      4: [
        { episode_number: 1, name: 'Valles Marineris' },
        { episode_number: 2, name: 'The Griffin Incident' },
        { episode_number: 3, name: 'Human Best Friend' },
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

    expect(result?.seasons[0].episodes[0].manualGrab).toMatchObject({
      source: 'eztv',
      rawTitle: 'grabbed release',
    });
  });
});
