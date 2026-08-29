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
};

type CacheEntry = { fetchedAt: string; items: TopMovieItem[] };

/** In-memory cache, one entry per year, no TTL — a past year's Top 100 is
 * settled history and never needs re-scraping once cached (see
 * notes/public/movie-calendar-scope.md). The current year is the only one
 * that can go stale as the year progresses, which is why rescan() exists
 * as an explicit operator action rather than a background timer. */
export class TopMoviesCache {
  private readonly entries = new Map<number, CacheEntry>();
  private readonly inFlight = new Map<number, Promise<CacheEntry>>();

  get(year: number): CacheEntry | undefined {
    return this.entries.get(year);
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
    if (entry.items.length > 0) this.entries.set(year, entry);
    return entry;
  }

  /** Drops the cached entry so the next getTopMovies call re-scrapes —
   * backs the "Rescan" button for the current year. A no-op for a year
   * with nothing cached yet. */
  invalidate(year: number): void {
    this.entries.delete(year);
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
