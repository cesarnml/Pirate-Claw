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
 * cheap to rebuild, and a daemon restart naturally re-warms it on next hit. */
export class CalendarCache {
  private readonly entries = new Map<
    number,
    { fetchedAt: number; items: TmdbDiscoverTvResult[] }
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
}

export async function getTvCalendar(
  deps: CalendarDeps,
  year: number,
  trackedNames: string[],
): Promise<CalendarTvItem[]> {
  let results = deps.cache.get(year);

  if (results === undefined) {
    const pages = await Promise.all(
      Array.from({ length: PAGES_PER_YEAR }, (_, i) =>
        deps.client.discoverTv(`${year}-01-01`, `${year}-12-31`, i + 1),
      ),
    );
    results = pages.flat();
    deps.cache.set(year, results);
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
