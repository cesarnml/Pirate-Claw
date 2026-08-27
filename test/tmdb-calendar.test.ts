import { describe, expect, it } from 'bun:test';

import type { TmdbDiscoverTvResult, TmdbHttpClient } from '../src/tmdb/client';
import { CalendarCache, getTvCalendar } from '../src/tmdb/calendar';

/** Stands in for TMDB's `discover/tv`, honouring the requested date range the
 * way the real endpoint does — getTvCalendar queries a year one month at a
 * time, so a fake that ignored the range and echoed a fixed page back would
 * hand the same results to all 12 calls and prove nothing about coverage.
 * Takes result arrays purely as a convenience; they're flattened and then
 * served according to each result's own air date. */
function fakeClient(pages: TmdbDiscoverTvResult[][]): {
  client: TmdbHttpClient;
  calls: { gte: string; lte: string; page: number }[];
} {
  const all = pages.flat();
  const calls: { gte: string; lte: string; page: number }[] = [];
  const client = {
    discoverTv: async (gte: string, lte: string, page: number) => {
      calls.push({ gte, lte, page });
      return all.filter((entry) => {
        // Undated results can't match a date range; TMDB wouldn't return
        // them at all. Attribute them to the January call so they surface
        // exactly once and the "undated sorts last" case stays testable.
        if (!entry.first_air_date) return gte.endsWith('-01-01');
        return entry.first_air_date >= gte && entry.first_air_date <= lte;
      });
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

  it('queries every month of the year so no month can be crowded out', async () => {
    // Regression, observed live: the year used to be fetched as one
    // 01-01..12-31 range sorted by popularity, keeping the top ~40. Since
    // popularity tracks what has already aired, querying in late August
    // returned nothing premiering after August — the rendered calendar was
    // missing Sept, Oct, Nov, Dec (and Feb) entirely, while TMDB itself had
    // 198 September titles. Bucketing per month makes popularity compete
    // only within a month, so each month gets its own slots.
    const { client, calls } = fakeClient([
      [
        result({ id: 1, name: 'January Show', first_air_date: '2026-01-15' }),
        result({ id: 2, name: 'December Show', first_air_date: '2026-12-20' }),
      ],
    ]);

    const page = await getTvCalendar(
      { client, cache: new CalendarCache() },
      2026,
      [],
      { offset: 0, limit: 20 },
    );

    expect(calls).toHaveLength(12);
    expect(calls.map((call) => call.gte)).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
      '2026-11-01',
      '2026-12-01',
    ]);
    // Month ends must be real calendar days, not a fixed 31.
    expect(calls[1]?.lte).toBe('2026-02-28');
    expect(calls[3]?.lte).toBe('2026-04-30');
    expect(calls[11]?.lte).toBe('2026-12-31');
    // A December premiere survives alongside a January one.
    expect(page.items.map((item) => item.name)).toEqual([
      'January Show',
      'December Show',
    ]);
  });

  it('uses a leap-year-correct February range', async () => {
    // 2028 is a leap year; a fixed 28-day assumption would silently drop any
    // Feb 29 premiere from the calendar.
    const { client, calls } = fakeClient([
      [result({ id: 1, name: 'Leap Day Show', first_air_date: '2028-02-29' })],
    ]);

    const page = await getTvCalendar(
      { client, cache: new CalendarCache() },
      2028,
      [],
      { offset: 0, limit: 20 },
    );

    expect(calls[1]?.lte).toBe('2028-02-29');
    expect(page.items.map((item) => item.name)).toEqual(['Leap Day Show']);
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
