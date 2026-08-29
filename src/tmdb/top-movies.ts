import type { Database } from 'bun:sqlite';
import type { TmdbHttpClient } from './client';
import { scrapeTopMovies } from '../dvdsreleasedates/scraper';
import type { MovieOwnershipStatus, PlexStatus } from '../movie-api-types';

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
  /** See MovieOwnershipStatus's doc comment — grabbed and "confirmed in
   * Plex" are deliberately separate signals here, not flattened into one
   * boolean. grabSource/plexStatus are the honest detail behind
   * alreadyGrabbed; alreadyGrabbed itself keeps driving whether the grab
   * UI shows, unchanged. */
  grabSource: MovieOwnershipStatus['grabSource'];
  plexStatus: PlexStatus;
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

  /** Every movie from every year ever cached (memory or SQLite), deduped
   * by tmdbId — backs the full Plex sync's "check everything the user has
   * ever looked at" scope, since that sync has no single "currently
   * displayed year" to scope itself to the way the per-view sweeps do. */
  listAllCachedItems(): TopMovieItem[] {
    if (!this.database)
      return dedupeByTmdbId([...this.entries.values()].flatMap((e) => e.items));
    try {
      const rows = this.database
        .query(`SELECT items_json FROM top_movies_cache`)
        .all() as { items_json: string }[];
      const fromDb = rows.flatMap(
        (row) => JSON.parse(row.items_json) as TopMovieItem[],
      );
      return dedupeByTmdbId(fromDb);
    } catch {
      return dedupeByTmdbId([...this.entries.values()].flatMap((e) => e.items));
    }
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
  ownership: Map<number, MovieOwnershipStatus>,
  forceRescan = false,
): Promise<TopMoviesResult> {
  if (forceRescan) deps.cache.invalidate(year);

  const cached = deps.cache.get(year);
  if (cached) {
    return {
      year,
      items: withOwnership(cached.items, ownership),
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
          alreadyGrabbed: false, // filled in by withOwnership below
          grabSource: null,
          plexStatus: 'unknown',
          formats: movie.formats,
        } satisfies TopMovieItem;
      }),
    );

    return { fetchedAt: new Date().toISOString(), items: enriched };
  });

  return {
    year,
    items: withOwnership(entry.items, ownership),
    scrapeError:
      entry.items.length === 0 ? 'Could not scrape or enrich this year.' : null,
    fetchedAt: entry.fetchedAt,
    fromCache: false,
  };
}

function withOwnership(
  items: TopMovieItem[],
  ownership: Map<number, MovieOwnershipStatus>,
): TopMovieItem[] {
  return items.map((item) => {
    const status =
      item.tmdbId !== null ? ownership.get(item.tmdbId) : undefined;
    return {
      ...item,
      alreadyGrabbed: status?.grabbed ?? false,
      grabSource: status?.grabSource ?? null,
      plexStatus: status?.plexStatus ?? 'unknown',
    };
  });
}

function dedupeByTmdbId(items: TopMovieItem[]): TopMovieItem[] {
  const seen = new Set<number>();
  const out: TopMovieItem[] = [];
  for (const item of items) {
    if (item.tmdbId === null || seen.has(item.tmdbId)) continue;
    seen.add(item.tmdbId);
    out.push(item);
  }
  return out;
}
