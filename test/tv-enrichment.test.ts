import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import { ensureTmdbSchema } from '../src/tmdb/schema';
import { TmdbCache } from '../src/tmdb/cache';
import type { TmdbHttpClient } from '../src/tmdb/client';
import {
  enrichShowBreakdowns,
  isDormantShow,
  isSeasonFinished,
  loadSeasonEpisodes,
  type TvEnrichDeps,
} from '../src/tmdb/tv-enrichment';
import { tvMatchKey } from '../src/tmdb/keys';
import type { ShowBreakdown } from '../src/tv-api-types';

function freshDeps(client: Partial<TmdbHttpClient>): {
  deps: TvEnrichDeps;
  cache: TmdbCache;
} {
  const db = new Database(':memory:');
  ensureTmdbSchema(db);
  const cache = new TmdbCache(db);
  return {
    cache,
    deps: {
      cache,
      client: client as TmdbHttpClient,
      cacheTtlMs: 1000 * 60,
      negativeCacheTtlMs: 1000 * 30,
      log: () => {},
    },
  };
}

function show(title: string): ShowBreakdown {
  return {
    normalizedTitle: title,
    seasons: [],
    plexStatus: 'unknown',
    watchCount: null,
    lastWatchedAt: null,
  };
}

describe('isDormantShow', () => {
  it('is true for an Ended show not in production', () => {
    expect(isDormantShow({ status: 'Ended', inProduction: false })).toBe(true);
  });

  it('is true for a Canceled show even with inProduction omitted', () => {
    expect(isDormantShow({ status: 'Canceled' })).toBe(true);
  });

  it('is false for a Returning Series', () => {
    expect(
      isDormantShow({ status: 'Returning Series', inProduction: false }),
    ).toBe(false);
  });

  it('is false when status is Ended but TMDB still reports in_production', () => {
    expect(isDormantShow({ status: 'Ended', inProduction: true })).toBe(false);
  });

  it('is false for unknown/missing status', () => {
    expect(isDormantShow({})).toBe(false);
  });
});

describe('enrichShowBreakdowns cache TTL', () => {
  it('caches an Ended, non-producing show far longer than a normal one', async () => {
    const { deps, cache } = freshDeps({
      searchTv: async () => ({ id: 1, name: 'Dead Show' }),
      getTv: async () => ({
        id: 1,
        name: 'Dead Show',
        status: 'Ended',
        in_production: false,
        number_of_seasons: 1,
      }),
    });

    const before = Date.now();
    await enrichShowBreakdowns([show('dead show')], deps);
    const row = cache.getTv(tvMatchKey('dead show'));

    expect(row?.status).toBe('Ended');
    expect(row?.inProduction).toBe(false);
    const ttl = Date.parse(row!.expiresAt) - before;
    // Comfortably past the plain cacheTtlMs (60s) — proves the dormant
    // multiplier applied, without pinning the exact constant.
    expect(ttl).toBeGreaterThan(deps.cacheTtlMs * 2);
  });

  it('caches a Returning Series at the normal TTL', async () => {
    const { deps, cache } = freshDeps({
      searchTv: async () => ({ id: 2, name: 'Live Show' }),
      getTv: async () => ({
        id: 2,
        name: 'Live Show',
        status: 'Returning Series',
        in_production: true,
        number_of_seasons: 3,
      }),
    });

    const before = Date.now();
    await enrichShowBreakdowns([show('live show')], deps);
    const row = cache.getTv(tvMatchKey('live show'));

    const ttl = Date.parse(row!.expiresAt) - before;
    expect(ttl).toBeLessThanOrEqual(deps.cacheTtlMs + 1000);
  });

  it('does not extend the TTL when TMDB reports no status at all', async () => {
    const { deps, cache } = freshDeps({
      searchTv: async () => ({ id: 3, name: 'Unknown Show' }),
      getTv: async () => ({
        id: 3,
        name: 'Unknown Show',
        number_of_seasons: 1,
      }),
    });

    const before = Date.now();
    await enrichShowBreakdowns([show('unknown show')], deps);
    const row = cache.getTv(tvMatchKey('unknown show'));

    // A show TMDB never told us a status for must not be silently treated
    // as dormant — that would go stale forever on a misread.
    const ttl = Date.parse(row!.expiresAt) - before;
    expect(ttl).toBeLessThanOrEqual(deps.cacheTtlMs + 1000);
  });
});

describe('numberOfEpisodes', () => {
  it("sums TMDB's per-season episode counts and excludes the specials season", async () => {
    // Shaped after the real cached Star Trek row (verified live 2026-09-03):
    // 4 season entries for 3 real seasons, because season 0 holds specials.
    const { deps } = freshDeps({
      searchTv: async () => ({ id: 3, name: 'Star Trek' }),
      getTv: async () => ({
        id: 3,
        name: 'Star Trek',
        number_of_seasons: 3,
        seasons: [
          { season_number: 0, episode_count: 5 },
          { season_number: 1, episode_count: 29 },
          { season_number: 2, episode_count: 26 },
          { season_number: 3, episode_count: 24 },
        ],
      }),
    });

    const [enriched] = await enrichShowBreakdowns([show('star trek')], deps);

    expect(enriched.tmdb?.numberOfEpisodes).toBe(79);
    expect(enriched.tmdb?.numberOfSeasons).toBe(3);
  });

  it('serves the same total from cache on a second pass, with no further TMDB call', async () => {
    let getTvCalls = 0;
    const { deps } = freshDeps({
      searchTv: async () => ({ id: 4, name: 'Reacher' }),
      getTv: async () => {
        getTvCalls++;
        return {
          id: 4,
          name: 'Reacher',
          number_of_seasons: 4,
          seasons: [
            { season_number: 1, episode_count: 8 },
            { season_number: 2, episode_count: 8 },
            { season_number: 3, episode_count: 8 },
            { season_number: 4, episode_count: 8 },
          ],
        };
      },
    });

    await enrichShowBreakdowns([show('reacher')], deps);
    const [again] = await enrichShowBreakdowns([show('reacher')], deps);

    expect(getTvCalls).toBe(1);
    expect(again.tmdb?.numberOfEpisodes).toBe(32);
  });

  it('reports undefined, not 0, when TMDB gave no seasons payload — "unknown" must not render as a confident zero', async () => {
    const { deps } = freshDeps({
      searchTv: async () => ({ id: 5, name: 'Bare Show' }),
      getTv: async () => ({ id: 5, name: 'Bare Show', number_of_seasons: 1 }),
    });

    const [enriched] = await enrichShowBreakdowns([show('bare show')], deps);

    expect(enriched.tmdb?.numberOfEpisodes).toBeUndefined();
  });

  it('counts announced-but-unaired episodes — a show that has not aired yet still has a size (the "1 season, 0 episodes" report)', async () => {
    const { deps } = freshDeps({
      searchTv: async () => ({ id: 6, name: 'A Knight of the Seven Kingdoms' }),
      getTv: async () => ({
        id: 6,
        name: 'A Knight of the Seven Kingdoms',
        number_of_seasons: 1,
        seasons: [{ season_number: 1, episode_count: 6 }],
      }),
    });

    const [enriched] = await enrichShowBreakdowns([show('a knight')], deps);

    expect(enriched.tmdb?.numberOfEpisodes).toBe(6);
  });
});

describe('isSeasonFinished', () => {
  it('is false for an empty episode list', () => {
    expect(isSeasonFinished([])).toBe(false);
  });

  it('is false when any episode has no air date yet', () => {
    expect(
      isSeasonFinished([{ air_date: '2020-01-01' }, { air_date: undefined }]),
    ).toBe(false);
  });

  it('is false when the latest air date is recent (within the settle buffer)', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(isSeasonFinished([{ air_date: yesterday }])).toBe(false);
  });

  it('is true once every episode has aired and the latest is well past the settle buffer', () => {
    expect(
      isSeasonFinished([
        { air_date: '2020-01-01' },
        { air_date: '2020-02-01' },
      ]),
    ).toBe(true);
  });
});

describe('loadSeasonEpisodes cache TTL', () => {
  it('caches a finished season (every episode aired long ago) far longer than a normal one, even for a non-dormant show', async () => {
    const { deps, cache } = freshDeps({
      getTvSeason: async () => ({
        season_number: 1,
        episodes: [
          { episode_number: 1, air_date: '2020-01-01' },
          { episode_number: 2, air_date: '2020-01-08' },
        ],
      }),
    });

    const before = Date.now();
    await loadSeasonEpisodes('a-show', 1, 1, deps);
    const row = cache.getTvSeason('a-show', 1);

    const ttl = Date.parse(row!.expiresAt) - before;
    // No `dormant` passed at all — this must extend purely from the
    // season's own episode list, since the missing-episodes feature
    // (episode-status.ts) never threads the show's dormant flag through.
    expect(ttl).toBeGreaterThan(deps.cacheTtlMs * 2);
  });

  it('caches a currently-airing season at the normal TTL', async () => {
    const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const { deps, cache } = freshDeps({
      getTvSeason: async () => ({
        season_number: 1,
        episodes: [
          { episode_number: 1, air_date: '2020-01-01' },
          { episode_number: 2, air_date: farFuture },
        ],
      }),
    });

    const before = Date.now();
    await loadSeasonEpisodes('a-show', 1, 1, deps);
    const row = cache.getTvSeason('a-show', 1);

    const ttl = Date.parse(row!.expiresAt) - before;
    expect(ttl).toBeLessThanOrEqual(deps.cacheTtlMs + 1000);
  });
});
