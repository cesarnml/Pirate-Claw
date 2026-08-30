import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import { ensureTmdbSchema } from '../src/tmdb/schema';
import { TmdbCache } from '../src/tmdb/cache';
import type { TmdbHttpClient } from '../src/tmdb/client';
import {
  enrichShowBreakdowns,
  isDormantShow,
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
  return { normalizedTitle: title, seasons: [] };
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
