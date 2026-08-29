import { describe, expect, it } from 'bun:test';

import type {
  TmdbDiscoverMovieResult,
  TmdbHttpClient,
} from '../src/tmdb/client';
import {
  MovieCalendarCache,
  MovieReleaseDateCache,
  getMovieCalendar,
} from '../src/tmdb/movie-calendar';

/** Mirrors tmdb-calendar.test.ts's fakeClient, movie-shaped — plus a
 * releaseDates map standing in for getUsDigitalOrPhysicalReleaseDate,
 * since getMovieCalendar (unlike getTvCalendar) makes one extra lazy call
 * per rendered item for the release-date badge. */
function fakeClient(
  pages: TmdbDiscoverMovieResult[][],
  releaseDates: Record<number, string | null> = {},
  // Movie ids whose release-date lookup should simulate a failed TMDB call
  // (returns undefined, not null) — see getUsDigitalOrPhysicalReleaseDate's
  // own comment on why the two are distinct.
  releaseDateFailures: Set<number> = new Set(),
): {
  client: TmdbHttpClient;
  calls: { gte: string; lte: string; page: number }[];
  releaseDateCalls: number[];
} {
  const all = pages.flat();
  const calls: { gte: string; lte: string; page: number }[] = [];
  const releaseDateCalls: number[] = [];
  const client = {
    discoverMovie: async (gte: string, lte: string, page: number) => {
      calls.push({ gte, lte, page });
      return all.filter((entry) => {
        if (!entry.release_date) return gte.endsWith('-01-01');
        return entry.release_date >= gte && entry.release_date <= lte;
      });
    },
    getUsDigitalOrPhysicalReleaseDate: async (movieId: number) => {
      releaseDateCalls.push(movieId);
      if (releaseDateFailures.has(movieId)) return undefined;
      return releaseDates[movieId] ?? null;
    },
  } as unknown as TmdbHttpClient;
  return { client, calls, releaseDateCalls };
}

function result(
  overrides: Partial<TmdbDiscoverMovieResult>,
): TmdbDiscoverMovieResult {
  return {
    id: 1,
    title: 'Untitled',
    popularity: 0,
    ...overrides,
  };
}

function deps(client: TmdbHttpClient) {
  return {
    client,
    cache: new MovieCalendarCache(),
    releaseDateCache: new MovieReleaseDateCache(),
  };
}

describe('getMovieCalendar', () => {
  it('maps TMDB discover results into calendar items, sorted by release date', async () => {
    const { client } = fakeClient([
      [
        result({
          id: 1,
          title: 'Later Movie',
          popularity: 90,
          release_date: '2026-06-01',
          overview: 'A movie.',
          poster_path: '/poster.jpg',
          original_language: 'en',
          vote_average: 8.25,
          genre_ids: [18, 9648],
        }),
        result({
          id: 2,
          title: 'Earlier Movie',
          popularity: 10,
          release_date: '2026-01-15',
        }),
      ],
    ]);

    const page = await getMovieCalendar(deps(client), 2026, new Set(), {
      offset: 0,
      limit: 20,
    });

    expect(page.total).toBe(2);
    expect(page.items[0]).toMatchObject({ tmdbId: 2, title: 'Earlier Movie' });
    expect(page.items[1]).toMatchObject({
      tmdbId: 1,
      title: 'Later Movie',
      posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      rating: 8.3,
      genres: ['Drama', 'Mystery'],
    });
  });

  it('queries every month of the year so no month can be crowded out', async () => {
    const { client, calls } = fakeClient([
      [
        result({ id: 1, title: 'January Movie', release_date: '2026-01-15' }),
        result({ id: 2, title: 'December Movie', release_date: '2026-12-20' }),
      ],
    ]);

    const page = await getMovieCalendar(deps(client), 2026, new Set(), {
      offset: 0,
      limit: 20,
    });

    expect(calls).toHaveLength(12);
    expect(calls[1]?.lte).toBe('2026-02-28');
    expect(page.items.map((item) => item.title)).toEqual([
      'January Movie',
      'December Movie',
    ]);
  });

  it('drops results repeated across TMDB pages, keeping one entry per id', async () => {
    const { client } = fakeClient([
      [
        result({ id: 10, title: 'Repeated', release_date: '2026-06-04' }),
        result({ id: 11, title: 'Other', release_date: '2026-06-05' }),
      ],
      [result({ id: 10, title: 'Repeated', release_date: '2026-06-04' })],
    ]);

    const page = await getMovieCalendar(deps(client), 2026, new Set(), {
      offset: 0,
      limit: 20,
    });

    expect(page.items.map((item) => item.tmdbId)).toEqual([10, 11]);
    expect(page.total).toBe(2);
  });

  it('flags items whose tmdbId is in the owned set as already grabbed', async () => {
    const { client } = fakeClient([
      [result({ id: 42, title: 'Owned', release_date: '2026-01-01' })],
    ]);

    const page = await getMovieCalendar(deps(client), 2026, new Set([42]), {
      offset: 0,
      limit: 20,
    });

    expect(page.items[0]?.alreadyGrabbed).toBe(true);
  });

  it('uses the real TMDB digital/physical date when available, no heuristic fallback', async () => {
    const { client, releaseDateCalls } = fakeClient(
      [
        [
          result({
            id: 1,
            title: 'Has Digital Date',
            release_date: '2026-01-01',
          }),
        ],
      ],
      { 1: '2026-02-14' },
    );

    const page = await getMovieCalendar(deps(client), 2026, new Set(), {
      offset: 0,
      limit: 20,
    });

    expect(releaseDateCalls).toEqual([1]);
    expect(page.items[0]).toMatchObject({
      digitalOrPhysicalReleaseDate: '2026-02-14',
      estimatedAvailabilityDate: null,
    });
  });

  it('falls back to a ~49-day theatrical-date estimate when TMDB has no digital/physical date yet', async () => {
    const { client } = fakeClient([
      [
        result({
          id: 1,
          title: 'Still In Theaters',
          release_date: '2026-01-01',
        }),
      ],
    ]);

    const page = await getMovieCalendar(deps(client), 2026, new Set(), {
      offset: 0,
      limit: 20,
    });

    expect(page.items[0]).toMatchObject({
      digitalOrPhysicalReleaseDate: null,
      estimatedAvailabilityDate: '2026-02-19', // 2026-01-01 + 49 days
    });
  });

  it('leaves the availability estimate null when there is no theatrical date to estimate from', async () => {
    const { client } = fakeClient([
      [result({ id: 1, title: 'No Date At All' })],
    ]);

    const page = await getMovieCalendar(deps(client), 2026, new Set(), {
      offset: 0,
      limit: 20,
    });

    expect(page.items[0]).toMatchObject({
      releaseDate: null,
      digitalOrPhysicalReleaseDate: null,
      estimatedAvailabilityDate: null,
    });
  });

  it('caches the release-date lookup per movie and does not re-fetch on a second page render', async () => {
    const { client, releaseDateCalls } = fakeClient([
      [result({ id: 1, title: 'A', release_date: '2026-01-01' })],
    ]);
    const cache = {
      client,
      cache: new MovieCalendarCache(),
      releaseDateCache: new MovieReleaseDateCache(),
    };

    await getMovieCalendar(cache, 2026, new Set(), { offset: 0, limit: 20 });
    await getMovieCalendar(cache, 2026, new Set(), { offset: 0, limit: 20 });

    expect(releaseDateCalls).toEqual([1]);
  });

  it('does not cache a failed release-date lookup as a confirmed "no date" — retries on the next render', async () => {
    // Regression: a transient TMDB failure (timeout, exhausted 429 retries,
    // 5xx) must not lock in the theatrical-date estimate for a full cache
    // TTL just because the one call that would have found the real digital
    // date happened to fail once.
    const { client, releaseDateCalls } = fakeClient(
      [[result({ id: 1, title: 'A', release_date: '2026-01-01' })]],
      {},
      new Set([1]),
    );
    const cache = {
      client,
      cache: new MovieCalendarCache(),
      releaseDateCache: new MovieReleaseDateCache(),
    };

    const first = await getMovieCalendar(cache, 2026, new Set(), {
      offset: 0,
      limit: 20,
    });
    const second = await getMovieCalendar(cache, 2026, new Set(), {
      offset: 0,
      limit: 20,
    });

    expect(releaseDateCalls).toEqual([1, 1]); // retried, not cached
    expect(first.items[0]?.digitalOrPhysicalReleaseDate).toBeNull();
    expect(first.items[0]?.estimatedAvailabilityDate).toBe('2026-02-19'); // heuristic fallback
    expect(second.items[0]?.digitalOrPhysicalReleaseDate).toBeNull();
  });

  describe('pagination', () => {
    function manyResults(count: number): TmdbDiscoverMovieResult[] {
      return Array.from({ length: count }, (_, i) => {
        const month = String(1 + Math.floor((i / count) * 12)).padStart(2, '0');
        return result({
          id: i,
          title: `Movie ${i}`,
          release_date: `2026-${month}-01`,
        });
      });
    }

    it('returns only a page-sized slice, with the full count in total', async () => {
      const { client } = fakeClient([manyResults(30)]);

      const page = await getMovieCalendar(deps(client), 2026, new Set(), {
        offset: 0,
        limit: 10,
      });

      expect(page.total).toBe(30);
      expect(page.items).toHaveLength(10);
      expect(page.items[0]?.title).toBe('Movie 0');
    });

    it('returns an empty page past the end of the result set', async () => {
      const { client } = fakeClient([manyResults(5)]);

      const page = await getMovieCalendar(deps(client), 2026, new Set(), {
        offset: 20,
        limit: 10,
      });

      expect(page.total).toBe(5);
      expect(page.items).toEqual([]);
    });
  });
});
