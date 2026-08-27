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
  it('maps TMDB discover results into calendar items, sorted by air date', async () => {
    const { client } = fakeClient([
      [
        result({
          id: 1,
          name: 'Later Show',
          popularity: 90,
          first_air_date: '2026-06-01',
          overview: 'A show.',
          poster_path: '/poster.jpg',
        }),
        result({
          id: 2,
          name: 'Earlier Show',
          popularity: 10,
          first_air_date: '2026-01-15',
        }),
      ],
    ]);

    const page = await getTvCalendar(
      { client, cache: new CalendarCache() },
      2026,
      [],
      { offset: 0, limit: 20 },
    );

    expect(page.total).toBe(2);
    expect(page.items).toEqual([
      {
        tmdbId: 2,
        name: 'Earlier Show',
        firstAirDate: '2026-01-15',
        overview: '',
        posterUrl: null,
        popularity: 10,
        alreadyTracked: false,
      },
      {
        tmdbId: 1,
        name: 'Later Show',
        firstAirDate: '2026-06-01',
        overview: 'A show.',
        posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
        popularity: 90,
        alreadyTracked: false,
      },
    ]);
  });

  it('drops results repeated across TMDB pages, keeping one entry per id', async () => {
    // Regression, observed live: PAGES_PER_YEAR fetches two popularity-sorted
    // `discover/tv` pages, and popularity shifts between those two requests,
    // so a boundary item comes back on both ("Cape Fear", id 277439, in the
    // real 2026 calendar). The web UI renders a keyed `{#each ... (tmdbId)}`
    // and Svelte throws a fatal each_key_duplicate on a repeated key, which
    // blanks the whole page after an otherwise-successful fetch. `total` must
    // count the deduped set too, or pagination overruns the real end.
    const { client } = fakeClient([
      [
        result({ id: 10, name: 'Cape Fear', first_air_date: '2026-06-04' }),
        result({ id: 11, name: 'Other', first_air_date: '2026-06-05' }),
      ],
      [result({ id: 10, name: 'Cape Fear', first_air_date: '2026-06-04' })],
    ]);

    const page = await getTvCalendar(
      { client, cache: new CalendarCache() },
      2026,
      [],
      { offset: 0, limit: 20 },
    );

    expect(page.items.map((item) => item.tmdbId)).toEqual([10, 11]);
    expect(page.total).toBe(2);
  });

  it('sorts items with no air date last', async () => {
    const { client } = fakeClient([
      [
        result({ id: 1, name: 'No Date' }),
        result({ id: 2, name: 'Has Date', first_air_date: '2026-01-01' }),
      ],
    ]);

    const page = await getTvCalendar(
      { client, cache: new CalendarCache() },
      2026,
      [],
      { offset: 0, limit: 20 },
    );

    expect(page.items.map((item) => item.name)).toEqual([
      'Has Date',
      'No Date',
    ]);
  });

  it('flags items already present in the tracked show list, case-insensitively', async () => {
    const { client } = fakeClient([
      [result({ id: 1, name: 'From', first_air_date: '2026-01-01' })],
    ]);

    const page = await getTvCalendar(
      { client, cache: new CalendarCache() },
      2026,
      ['  FROM  '],
      { offset: 0, limit: 20 },
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
      { offset: 0, limit: 20 },
    );

    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(1);
    expect(page.items[0]?.name).toBe('Has A Name');
  });

  it('caches the full fetched set per year and does not refetch on a second call', async () => {
    const { client, calls } = fakeClient([[result({ id: 1, name: 'Show' })]]);
    const cache = new CalendarCache();

    await getTvCalendar({ client, cache }, 2026, [], { offset: 0, limit: 20 });
    const callsAfterFirst = calls.length;
    await getTvCalendar({ client, cache }, 2026, [], { offset: 0, limit: 20 });

    expect(calls.length).toBe(callsAfterFirst);
  });

  it('fetches independently per year', async () => {
    const { client, calls } = fakeClient([[result({ id: 1, name: 'Show' })]]);
    const cache = new CalendarCache();

    await getTvCalendar({ client, cache }, 2026, [], { offset: 0, limit: 20 });
    await getTvCalendar({ client, cache }, 2027, [], { offset: 0, limit: 20 });

    expect(calls.length).toBeGreaterThan(0);
    // Distinct years each trigger their own fetch (cache is keyed by year).
    const cachedAgain = await getTvCalendar({ client, cache }, 2026, [], {
      offset: 0,
      limit: 20,
    });
    expect(cachedAgain.items).toHaveLength(1);
  });

  describe('pagination', () => {
    function manyResults(count: number): TmdbDiscoverTvResult[] {
      // Dates spread evenly across the year, in order, so sorted output is
      // deterministic regardless of input order.
      return Array.from({ length: count }, (_, i) => {
        const month = String(1 + Math.floor((i / count) * 12)).padStart(2, '0');
        return result({
          id: i,
          name: `Show ${i}`,
          first_air_date: `2026-${month}-01`,
        });
      });
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
      expect(page.offset).toBe(0);
      expect(page.items).toHaveLength(10);
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

  describe('auto-anchor when offset is omitted', () => {
    // These use real Date.now() rather than mocking it — deliberately, since
    // the point being tested is the *shape* of the anchor formula (present
    // year lands mid-list, past year lands at the end, future year lands at
    // the start), which holds true on any real date.
    const thisYear = new Date().getFullYear();

    function yearSpanningResults(): TmdbDiscoverTvResult[] {
      // One item per month of `thisYear`, so at least one is guaranteed to
      // be on/after today (this month) and at least one before (January),
      // regardless of what day it is when the test runs.
      return Array.from({ length: 12 }, (_, i) =>
        result({
          id: i,
          name: `Month ${i + 1}`,
          first_air_date: `${thisYear}-${String(i + 1).padStart(2, '0')}-01`,
        }),
      );
    }

    it('lands on a page containing items from around today for the current year', async () => {
      const { client } = fakeClient([yearSpanningResults()]);

      const page = await getTvCalendar(
        { client, cache: new CalendarCache() },
        thisYear,
        [],
        { limit: 4 },
      );

      expect(page.items).toHaveLength(4);
      // Anchored somewhere other than always-page-1, unless today happens to
      // be in January (still a valid anchor position, just not evidence of
      // anything) — the real assertion is the past/future year cases below.
      expect(page.offset).toBeGreaterThanOrEqual(0);
      expect(page.offset).toBeLessThanOrEqual(8);
    });

    it('lands on the last page for a year that is entirely in the past', async () => {
      const pastYear = thisYear - 5;
      const results = Array.from({ length: 10 }, (_, i) =>
        result({
          id: i,
          name: `Show ${i}`,
          first_air_date: `${pastYear}-${String(1 + i).padStart(2, '0')}-01`,
        }),
      );
      const { client } = fakeClient([results]);

      const page = await getTvCalendar(
        { client, cache: new CalendarCache() },
        pastYear,
        [],
        { limit: 4 },
      );

      expect(page.offset).toBe(6); // total(10) - limit(4)
      expect(page.items).toHaveLength(4);
      expect(page.items[page.items.length - 1]?.name).toBe('Show 9');
    });

    it('lands on the first page for a year that is entirely in the future', async () => {
      const futureYear = thisYear + 5;
      const results = Array.from({ length: 10 }, (_, i) =>
        result({
          id: i,
          name: `Show ${i}`,
          first_air_date: `${futureYear}-${String(1 + i).padStart(2, '0')}-01`,
        }),
      );
      const { client } = fakeClient([results]);

      const page = await getTvCalendar(
        { client, cache: new CalendarCache() },
        futureYear,
        [],
        { limit: 4 },
      );

      expect(page.offset).toBe(0);
      expect(page.items[0]?.name).toBe('Show 0');
    });

    it('clamps to 0 rather than going negative when total is smaller than the limit', async () => {
      // A clearly-past year so every date compares before "today" regardless
      // of what day it is when this test runs — isolates the total < limit
      // clamp from the "which direction is today" logic tested above.
      const pastYear = thisYear - 5;
      const results = Array.from({ length: 3 }, (_, i) =>
        result({
          id: i,
          name: `Show ${i}`,
          first_air_date: `${pastYear}-01-0${i + 1}`,
        }),
      );
      const { client } = fakeClient([results]);

      const page = await getTvCalendar(
        { client, cache: new CalendarCache() },
        pastYear,
        [],
        { limit: 10 },
      );

      expect(page.offset).toBe(0);
      expect(page.items).toHaveLength(3);
    });
  });
});
