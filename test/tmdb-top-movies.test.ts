import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it, spyOn } from 'bun:test';

import type { TmdbHttpClient } from '../src/tmdb/client';
import { ensureTmdbSchema } from '../src/tmdb/schema';
import {
  TopMoviesCache,
  type TopMovieItem,
  getTopMovies,
} from '../src/tmdb/top-movies';

// A trimmed one-entry excerpt of dvdsreleasedates.com's real markup shape —
// mirrors dvdsreleasedates-scraper.test.ts's own fixture.
const ONE_ENTRY_HTML = `
<table class='fieldtable-inner'><tr><td colspan='5' class='reldate'><h1>Top Movies 2026</h1></td></tr><tr><td class='dvdcell'>1<br/><a href='/movies/11346/spider-man-brand-new-day'><img class='movieimg' alt='Spider-Man: Brand New Day DVD Release Date' title='Spider-Man: Brand New Day DVD Release Date' src='/posters/110/S/Spider-Man-Brand-New-Day-2026.jpg'/></a><br/><a style='color:#000;' href='/movies/11346/spider-man-brand-new-day'>Spider-Man: Brand New Day</a><br/><table class='celldiscs'><tr><td class='imdblink left'>imdb: <a href='http://www.imdb.com/title/tt22084616/' target='_blank' rel='nofollow'>8.0</a></td><td class='imdblink right'>PG-13&nbsp;&nbsp;</td></tr></table></td>
</tr></table>
`;

function fakeTmdbClient(): TmdbHttpClient {
  return {
    findMovieByImdbId: async (imdbId: string) => ({
      id: 42,
      title: 'Spider-Man: Brand New Day',
      imdb_id: imdbId,
      poster_path: null,
      release_date: '2026-07-29',
      vote_average: 7.9,
    }),
  } as unknown as TmdbHttpClient;
}

function mockScrapeOnce(html: string): void {
  const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
    (async () =>
      new Response(html, { status: 200 })) as unknown as typeof fetch,
  );
  restores.push(() => fetchMock.mockRestore());
}

const restores: Array<() => void> = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()!();
});

describe('TopMoviesCache persistence', () => {
  it('writes through to SQLite and a fresh instance sharing the database hydrates from it', async () => {
    const database = new Database(':memory:');
    ensureTmdbSchema(database);

    const entry = {
      fetchedAt: '2026-01-01T00:00:00.000Z',
      items: [{ rank: 1, tmdbId: 42 } as TopMovieItem],
    };

    const first = new TopMoviesCache(database);
    expect(first.get(2025)).toBeUndefined();
    await first.fetchOnce(2025, async () => entry);

    // A brand-new instance never wrote to memory — this can only see the
    // entry if it truly persisted to SQLite, simulating a daemon restart.
    const second = new TopMoviesCache(database);
    expect(second.get(2025)).toEqual(entry);
  });

  it('invalidate() clears both the in-memory and SQLite copies', async () => {
    const database = new Database(':memory:');
    ensureTmdbSchema(database);
    const cache = new TopMoviesCache(database);
    const entry = {
      fetchedAt: '2026-01-01T00:00:00.000Z',
      items: [{ rank: 1, tmdbId: 1 } as TopMovieItem],
    };

    await cache.fetchOnce(2025, async () => entry);
    expect(cache.get(2025)).toEqual(entry);

    cache.invalidate(2025);
    expect(cache.get(2025)).toBeUndefined();
    expect(new TopMoviesCache(database).get(2025)).toBeUndefined();
  });

  it('a database-less cache behaves exactly as an in-memory-only cache (no persistence)', async () => {
    const cache = new TopMoviesCache();
    const entry = {
      fetchedAt: '2026-01-01T00:00:00.000Z',
      items: [{ rank: 1, tmdbId: 1 } as TopMovieItem],
    };
    await cache.fetchOnce(2025, async () => entry);
    expect(cache.get(2025)).toEqual(entry);
    cache.invalidate(2025);
    expect(cache.get(2025)).toBeUndefined();
  });
});

describe('getTopMovies fromCache', () => {
  it('reports fromCache: false on a fresh scrape, then true on the next call (cache hit)', async () => {
    mockScrapeOnce(ONE_ENTRY_HTML);
    const deps = {
      client: fakeTmdbClient(),
      cache: new TopMoviesCache(),
      log: () => {},
    };

    const first = await getTopMovies(deps, 2026, new Set());
    expect(first.fromCache).toBe(false);
    expect(first.items).toHaveLength(1);

    const second = await getTopMovies(deps, 2026, new Set());
    expect(second.fromCache).toBe(true);
    expect(second.fetchedAt).toBe(first.fetchedAt);
  });

  it('forceRescan invalidates the cache, so the next call is a fresh scrape again', async () => {
    mockScrapeOnce(ONE_ENTRY_HTML);
    const deps = {
      client: fakeTmdbClient(),
      cache: new TopMoviesCache(),
      log: () => {},
    };

    await getTopMovies(deps, 2026, new Set());

    mockScrapeOnce(ONE_ENTRY_HTML);
    const rescanned = await getTopMovies(deps, 2026, new Set(), true);
    expect(rescanned.fromCache).toBe(false);
  });
});
