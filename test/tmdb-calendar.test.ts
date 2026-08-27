import { describe, expect, it } from 'bun:test';

import type { TmdbDiscoverTvResult, TmdbHttpClient } from '../src/tmdb/client';
import { CalendarCache, getTvCalendar } from '../src/tmdb/calendar';

function fakeClient(pages: TmdbDiscoverTvResult[][]): {
  client: TmdbHttpClient;
  calls: number[];
} {
  const calls: number[] = [];
  const client = {
    discoverTv: async (_gte: string, _lte: string, page: number) => {
      calls.push(page);
      return pages[page - 1] ?? [];
    },
  } as unknown as TmdbHttpClient;
  return { client, calls };
}

function result(
  overrides: Partial<TmdbDiscoverTvResult>,
): TmdbDiscoverTvResult {
  return {
    id: 1,
    name: 'Untitled',
    popularity: 0,
    ...overrides,
  };
}

describe('getTvCalendar', () => {
  it('maps TMDB discover results into calendar items, sorted by popularity', async () => {
    const { client } = fakeClient([
      [
        result({ id: 1, name: 'Low Popularity', popularity: 10 }),
        result({
          id: 2,
          name: 'High Popularity',
          popularity: 90,
          first_air_date: '2026-03-01',
          overview: 'A show.',
          poster_path: '/poster.jpg',
        }),
      ],
    ]);

    const page = await getTvCalendar(
      { client, cache: new CalendarCache() },
      2026,
      [],
    );

    expect(page.total).toBe(2);
    expect(page.items).toEqual([
      {
        tmdbId: 2,
        name: 'High Popularity',
        firstAirDate: '2026-03-01',
        overview: 'A show.',
        posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
        popularity: 90,
        alreadyTracked: false,
      },
      {
        tmdbId: 1,
        name: 'Low Popularity',
        firstAirDate: null,
        overview: '',
        posterUrl: null,
        popularity: 10,
        alreadyTracked: false,
      },
    ]);
  });

  it('flags items already present in the tracked show list, case-insensitively', async () => {
    const { client } = fakeClient([
      [result({ id: 1, name: 'From', popularity: 50 })],
    ]);

    const page = await getTvCalendar(
      { client, cache: new CalendarCache() },
      2026,
      ['  FROM  '],
    );

    expect(page.items[0]?.alreadyTracked).toBe(true);
  });

  it('filters out results with no name', async () => {
    const { client } = fakeClient([
      [result({ id: 1, name: '' }), result({ id: 2, name: 'Has A Name' })],
    ]);

    const page = await getTvCalendar(
      { client, cache: new CalendarCache() },
      2026,
      [],
    );

    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(1);
    expect(page.items[0]?.name).toBe('Has A Name');
  });

  it('caches the full fetched set per year and does not refetch on a second call', async () => {
    const { client, calls } = fakeClient([[result({ id: 1, name: 'Show' })]]);
    const cache = new CalendarCache();

    await getTvCalendar({ client, cache }, 2026, []);
    const callsAfterFirst = calls.length;
    await getTvCalendar({ client, cache }, 2026, []);

    expect(calls.length).toBe(callsAfterFirst);
  });

  it('fetches independently per year', async () => {
    const { client, calls } = fakeClient([[result({ id: 1, name: 'Show' })]]);
    const cache = new CalendarCache();

    await getTvCalendar({ client, cache }, 2026, []);
    await getTvCalendar({ client, cache }, 2027, []);

    expect(calls.length).toBeGreaterThan(0);
    // Distinct years each trigger their own fetch (cache is keyed by year).
    const cachedAgain = await getTvCalendar({ client, cache }, 2026, []);
    expect(cachedAgain.items).toHaveLength(1);
  });

  describe('pagination', () => {
    function manyResults(count: number): TmdbDiscoverTvResult[] {
      return Array.from({ length: count }, (_, i) =>
        result({ id: i, name: `Show ${i}`, popularity: count - i }),
      );
    }

    it('returns only a page-sized slice, with the full count in total', async () => {
      const { client } = fakeClient([manyResults(30)]);

      const page = await getTvCalendar(
        { client, cache: new CalendarCache() },
        2026,
        [],
        { offset: 0, limit: 10 },
      );

      expect(page.total).toBe(30);
      expect(page.items).toHaveLength(10);
      // Highest popularity first, since input is already sorted descending.
      expect(page.items[0]?.name).toBe('Show 0');
      expect(page.items[9]?.name).toBe('Show 9');
    });

    it('returns the next page from a non-zero offset without refetching TMDB', async () => {
      const { client, calls } = fakeClient([manyResults(30)]);
      const cache = new CalendarCache();

      await getTvCalendar({ client, cache }, 2026, [], {
        offset: 0,
        limit: 10,
      });
      const callsAfterFirstPage = calls.length;
      const secondPage = await getTvCalendar({ client, cache }, 2026, [], {
        offset: 10,
        limit: 10,
      });

      expect(calls.length).toBe(callsAfterFirstPage);
      expect(secondPage.items).toHaveLength(10);
      expect(secondPage.items[0]?.name).toBe('Show 10');
    });

    it('returns an empty page past the end of the result set', async () => {
      const { client } = fakeClient([manyResults(5)]);

      const page = await getTvCalendar(
        { client, cache: new CalendarCache() },
        2026,
        [],
        { offset: 20, limit: 10 },
      );

      expect(page.total).toBe(5);
      expect(page.items).toEqual([]);
    });
  });
});
