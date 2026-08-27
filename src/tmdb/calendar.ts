import type { TmdbDiscoverTvResult, TmdbHttpClient } from './client';

export type CalendarTvItem = {
  tmdbId: number;
  name: string;
  firstAirDate: string | null;
  overview: string;
  posterUrl: string | null;
  popularity: number;
  alreadyTracked: boolean;
};

export type CalendarDeps = {
  client: TmdbHttpClient;
  cache: CalendarCache;
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — short enough to reflect new
// premiere announcements without hitting TMDB on every page load.
const PAGES_PER_YEAR = 2; // ~40 results, sorted by popularity — enough to
// surface anything worth adding without paginating a full calendar UI.

/** Tiny in-memory TTL cache, one entry per calendar year. Not persisted:
 * cheap to rebuild, and a daemon restart naturally re-warms it on next hit.
 * Also tracks an in-flight fetch per year so concurrent callers on a cache
 * miss share one TMDB round trip instead of each firing their own. */
export class CalendarCache {
  private readonly entries = new Map<
    number,
    { fetchedAt: number; items: TmdbDiscoverTvResult[] }
  >();
  private readonly inFlight = new Map<
    number,
    Promise<TmdbDiscoverTvResult[]>
  >();

  get(year: number): TmdbDiscoverTvResult[] | undefined {
    const entry = this.entries.get(year);
    if (!entry) return undefined;
    if (Date.now() - entry.fetchedAt >= CACHE_TTL_MS) return undefined;
    return entry.items;
  }

  set(year: number, items: TmdbDiscoverTvResult[]): void {
    this.entries.set(year, { fetchedAt: Date.now(), items });
  }

  async fetchOnce(
    year: number,
    fetcher: () => Promise<TmdbDiscoverTvResult[]>,
  ): Promise<TmdbDiscoverTvResult[]> {
    const pending = this.inFlight.get(year);
    if (pending) return pending;

    const promise = fetcher().finally(() => this.inFlight.delete(year));
    this.inFlight.set(year, promise);
    return promise;
  }
}

export async function getTvCalendar(
  deps: CalendarDeps,
  year: number,
  trackedNames: string[],
): Promise<CalendarTvItem[]> {
  let results = deps.cache.get(year);

  if (results === undefined) {
    results = await deps.cache.fetchOnce(year, async () => {
      const pages = await Promise.all(
        Array.from({ length: PAGES_PER_YEAR }, (_, i) =>
          deps.client.discoverTv(`${year}-01-01`, `${year}-12-31`, i + 1),
        ),
      );
      return pages.flat();
    });

    // TmdbHttpClient.getJson() coalesces every fetch failure (network error,
    // timeout, exhausted 429 retries, bad/rotated key, 5xx) to null, and
    // discoverTv() coalesces that to []. An empty result is therefore far
    // more likely to mean "TMDB call failed" than "nothing premieres this
    // year" — don't lock that in as a false negative for a full cache TTL.
    if (results.length > 0) {
      deps.cache.set(year, results);
    }
  }

  const trackedSet = new Set(
    trackedNames.map((name) => name.trim().toLowerCase()).filter(Boolean),
  );

  return results
    .filter((result): result is TmdbDiscoverTvResult & { name: string } =>
      Boolean(result.name),
    )
    .map((result) => ({
      tmdbId: result.id,
      name: result.name,
      firstAirDate: result.first_air_date ?? null,
      overview: result.overview ?? '',
      posterUrl: result.poster_path
        ? `https://image.tmdb.org/t/p/w500${result.poster_path}`
        : null,
      popularity: result.popularity ?? 0,
      alreadyTracked: trackedSet.has(result.name.trim().toLowerCase()),
    }))
    .sort((left, right) => right.popularity - left.popularity);
}
