import type { Database } from 'bun:sqlite';
import type { TmdbHttpClient } from './client';
import { scrapeTopMovies } from '../dvdsreleasedates/scraper';

export type TopMovieItem = {
  rank: number;
  /** Null when TMDB's find-by-imdb-id came back empty for this entry —
   * rare, but happens for obscure titles. Still shown (using the scraped
   * title) rather than dropped, so the ranking stays complete even when
   * enrichment partially fails. */
  tmdbId: number | null;
  title: string;
  imdbId: string;
  posterUrl: string | null;
  releaseDate: string | null;
  rating: number | undefined;
  alreadyGrabbed: boolean;
  formats: { dvd: boolean; bluray: boolean; fourK: boolean };
};

export type TopMoviesResult = {
  year: number;
  items: TopMovieItem[];
  /** When the scrape itself failed outright (site unreachable / markup
   * changed) — items is then whatever a prior successful fetch left
   * cached, possibly empty on a cold cache. */
  scrapeError: string | null;
  fetchedAt: string;
  /** True when this response was served from an existing cache entry
   * (memory or the SQLite-backed store behind it) rather than a scrape that
   * just happened during this request — lets the UI show "cached, scraped
   * {fetchedAt}" vs. "just scraped" so a Rescan click is an informed
   * decision, not a guess. */
  fromCache: boolean;
};

type CacheEntry = { fetchedAt: string; items: TopMovieItem[] };

type CacheRow = { year: number; fetched_at: string; items_json: string };

/** In-memory cache, one entry per year, no TTL — a past year's Top 100 is
 * settled history and never needs re-scraping once cached (see
 * notes/public/movie-calendar-scope.md). The current year is the only one
 * that can go stale as the year progresses, which is why rescan() exists
 * as an explicit operator action rather than a background timer.
 *
 * Optionally backed by SQLite (top_movies_cache, see tmdb/schema.ts): the
 * in-memory Map alone is snappy but doesn't survive a daemon restart —
 * every redeploy or NAS reboot would otherwise force every year to re-pay
 * its ~100 TMDB lookups (and a dvdsreleasedates scrape) the next time
 * someone views it. When a database is provided, a write goes to both; a
 * miss in memory falls back to a SQLite read (and hydrates memory) before
 * counting as a true cache miss. */
export class TopMoviesCache {
  private readonly entries = new Map<number, CacheEntry>();
  private readonly inFlight = new Map<number, Promise<CacheEntry>>();

  constructor(private readonly database?: Database) {}

  get(year: number): CacheEntry | undefined {
    const inMemory = this.entries.get(year);
    if (inMemory) return inMemory;

    const fromDisk = this.readFromDatabase(year);
    if (fromDisk) this.entries.set(year, fromDisk);
    return fromDisk;
  }

  async fetchOnce(
    year: number,
    fetcher: () => Promise<CacheEntry>,
  ): Promise<CacheEntry> {
    const pending = this.inFlight.get(year);
    if (pending) return pending;

    const promise = fetcher().finally(() => this.inFlight.delete(year));
    this.inFlight.set(year, promise);
    const entry = await promise;
    if (entry.items.length > 0) {
      this.entries.set(year, entry);
      this.writeToDatabase(year, entry);
    }
    return entry;
  }

  /** Drops the cached entry so the next getTopMovies call re-scrapes —
   * backs the "Rescan" button for the current year. A no-op for a year
   * with nothing cached yet. */
  invalidate(year: number): void {
    this.entries.delete(year);
    this.database?.run(`DELETE FROM top_movies_cache WHERE year = ?1`, [year]);
  }

  private readFromDatabase(year: number): CacheEntry | undefined {
    if (!this.database) return undefined;
    try {
      const row = this.database
        .query(
          `SELECT year, fetched_at, items_json FROM top_movies_cache WHERE year = ?1`,
        )
        .get(year) as CacheRow | null;
      if (!row) return undefined;
      return {
        fetchedAt: row.fetched_at,
        items: JSON.parse(row.items_json) as TopMovieItem[],
      };
    } catch {
      // A corrupt row (manual DB edit, partial write) shouldn't ever break
      // the page — treat it as a miss and let a fresh scrape overwrite it.
      return undefined;
    }
  }

  private writeToDatabase(year: number, entry: CacheEntry): void {
    if (!this.database) return;
    try {
      this.database.run(
        `INSERT INTO top_movies_cache (year, fetched_at, items_json)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(year) DO UPDATE SET
           fetched_at = excluded.fetched_at,
           items_json = excluded.items_json`,
        [year, entry.fetchedAt, JSON.stringify(entry.items)],
      );
    } catch {
      // Best-effort persistence — a write failure just means this year
      // isn't durable past a restart, not a reason to fail the request.
    }
  }
}

export type TopMoviesDeps = {
  client: TmdbHttpClient;
  cache: TopMoviesCache;
  log: (message: string) => void;
};

export async function getTopMovies(
  deps: TopMoviesDeps,
  year: number,
  grabbedTmdbIds: Set<number>,
  forceRescan = false,
): Promise<TopMoviesResult> {
  if (forceRescan) deps.cache.invalidate(year);

  const cached = deps.cache.get(year);
  if (cached) {
    return {
      year,
      items: withGrabbedStatus(cached.items, grabbedTmdbIds),
      scrapeError: null,
      fetchedAt: cached.fetchedAt,
      fromCache: true,
    };
  }

  const entry = await deps.cache.fetchOnce(year, async () => {
    const scraped = await scrapeTopMovies(year, deps.log);
    if (scraped === null || scraped.length === 0) {
      return {
        fetchedAt: new Date().toISOString(),
        items: [] as TopMovieItem[],
      };
    }

    // Sequential-by-throttle, not parallel — TmdbHttpClient serializes its
    // own requests (see MIN_REQUEST_INTERVAL_MS in tmdb/client.ts), and
    // Promise.all here still lands one request every ~55ms rather than a
    // burst of 100 concurrent ones, same as calendar.ts's 12-month fetch.
    const enriched = await Promise.all(
      scraped.map(async (movie) => {
        const found = await deps.client.findMovieByImdbId(movie.imdbId);
        return {
          rank: movie.rank,
          tmdbId: found?.id ?? null,
          title: found?.title ?? movie.title,
          imdbId: movie.imdbId,
          posterUrl: found?.poster_path
            ? `https://image.tmdb.org/t/p/w500${found.poster_path}`
            : null,
          releaseDate: found?.release_date ?? null,
          // vote_average of exactly 0 means "no votes yet" in practice, not
          // a genuine 0.0 rating — treat it the same as missing (see
          // movie-calendar.ts's getMovieCalendar for the same rule).
          rating: found?.vote_average
            ? Math.round(found.vote_average * 10) / 10
            : undefined,
          alreadyGrabbed: false, // filled in by withGrabbedStatus below
          formats: movie.formats,
        } satisfies TopMovieItem;
      }),
    );

    return { fetchedAt: new Date().toISOString(), items: enriched };
  });

  return {
    year,
    items: withGrabbedStatus(entry.items, grabbedTmdbIds),
    scrapeError:
      entry.items.length === 0 ? 'Could not scrape or enrich this year.' : null,
    fetchedAt: entry.fetchedAt,
    fromCache: false,
  };
}

function withGrabbedStatus(
  items: TopMovieItem[],
  grabbedTmdbIds: Set<number>,
): TopMovieItem[] {
  return items.map((item) => ({
    ...item,
    alreadyGrabbed: item.tmdbId !== null && grabbedTmdbIds.has(item.tmdbId),
  }));
}
