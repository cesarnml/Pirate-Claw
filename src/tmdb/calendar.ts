import type { TmdbDiscoverTvResult, TmdbHttpClient } from './client';
import { languageDisplayName } from './languages';
import { tvGenreNames } from './tv-genres';

export type CalendarTvItem = {
  tmdbId: number;
  name: string;
  firstAirDate: string | null;
  overview: string;
  posterUrl: string | null;
  popularity: number;
  alreadyTracked: boolean;
  /** Undefined when TMDB didn't report a language for this result. */
  language: string | undefined;
  /** Rounded to 1 decimal (TMDB's own vote_average precision); undefined
   * when TMDB reported no votes. */
  rating: number | undefined;
  /** Up to 2 genre names, most-relevant first per TMDB's own genre_ids order. */
  genres: string[];
};

export type CalendarDeps = {
  client: TmdbHttpClient;
  cache: CalendarCache;
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — short enough to reflect new
// premiere announcements without hitting TMDB on every page load.

// The year is queried one month at a time (12 requests, filled once per cache
// TTL) rather than as a single year-wide range.
//
// This is not an optimization — it's the only way to get a calendar without
// holes. `discover/tv` sorts by popularity, and popularity tracks what has
// *already* aired: querying 2026-01-01..2026-12-31 in late August and taking
// the top ~40 returned nothing after August, because every unaired autumn
// premiere ranks below the shows that ran in spring. Re-sorting that biased
// sample by date produced a "calendar" missing Sept–Dec entirely (and Feb),
// while TMDB itself had 198 September titles, 78 October, 30 November and 28
// December. Bucketing by month makes the popularity ranking compete only
// within a month, so every month gets its own slots.
const MONTHS_PER_YEAR = 12;

/** Last calendar day of a 1-indexed month, as an ISO date. Day 0 of the
 * following month is the last day of this one, which handles leap years
 * without a table. */
function monthRange(year: number, month: number): { gte: string; lte: string } {
  const pad = String(month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    gte: `${year}-${pad}-01`,
    lte: `${year}-${pad}-${String(lastDay).padStart(2, '0')}`,
  };
}

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

export type CalendarPage = {
  items: CalendarTvItem[];
  total: number;
  /** The offset actually used — echoes the caller's explicit offset, or the
   * resolved value when omitted and auto-anchored to today (see below). */
  offset: number;
};

const DEFAULT_PAGE_LIMIT = 20;
const UNDATED_SORT_KEY = '9999-99-99'; // sorts after every real ISO date

export async function getTvCalendar(
  deps: CalendarDeps,
  year: number,
  trackedNames: string[],
  pagination: { offset?: number; limit?: number } = {},
): Promise<CalendarPage> {
  const limit = pagination.limit ?? DEFAULT_PAGE_LIMIT;
  let results = deps.cache.get(year);

  if (results === undefined) {
    results = await deps.cache.fetchOnce(year, async () => {
      const months = await Promise.all(
        Array.from({ length: MONTHS_PER_YEAR }, (_, i) => {
          const { gte, lte } = monthRange(year, i + 1);
          return deps.client.discoverTv(gte, lte, 1);
        }),
      );
      return months.flat();
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

  // The full year's worth of items is fetched and cached once (cheap, TMDB
  // side), but only a page-sized slice is mapped/returned per call — the
  // client paginates via offset/limit (infinite scroll) instead of the
  // daemon ever sending the whole year in one response. A ~40-item response
  // with full overviews + poster URLs was found to be large enough to break
  // client-side hydration over some mobile/VPN network paths.
  //
  // Sorted by air date, not popularity — this is a calendar, not a popularity
  // chart. Undated results (shouldn't normally happen, TMDB's date-range
  // discover query implies a date) sort last rather than being dropped.
  //
  // Deduplicated by TMDB id first, and this is load-bearing, not hygiene:
  // PAGES_PER_YEAR fetches two `discover/tv` pages sorted by popularity, and
  // popularity shifts between those two requests — so an item sitting near
  // the page-1/page-2 boundary can come back on both. The web UI renders a
  // *keyed* `{#each ... (item.tmdbId)}`, and Svelte throws a fatal
  // each_key_duplicate on a repeated key, which kills the whole component
  // render: the page fetches fine, then blanks out. Observed live with
  // "Cape Fear" (id 277439) appearing twice in the 2026 calendar.
  const seenIds = new Set<number>();
  const named = results.filter(
    (result): result is TmdbDiscoverTvResult & { name: string } => {
      if (!result.name) return false;
      if (seenIds.has(result.id)) return false;
      seenIds.add(result.id);
      return true;
    },
  );
  named.sort((left, right) =>
    (left.first_air_date || UNDATED_SORT_KEY).localeCompare(
      right.first_air_date || UNDATED_SORT_KEY,
    ),
  );

  const total = named.length;
  const offset = pagination.offset ?? anchorOffsetForToday(named, total, limit);
  const page = named.slice(offset, offset + limit);

  return {
    total,
    offset,
    items: page.map((result) => ({
      tmdbId: result.id,
      name: result.name,
      firstAirDate: result.first_air_date ?? null,
      overview: result.overview ?? '',
      posterUrl: result.poster_path
        ? `https://image.tmdb.org/t/p/w500${result.poster_path}`
        : null,
      popularity: result.popularity ?? 0,
      alreadyTracked: trackedSet.has(result.name.trim().toLowerCase()),
      language: languageDisplayName(result.original_language),
      // vote_average of exactly 0 means "no votes yet" in practice, not a
      // genuine 0.0 rating — treat it the same as missing.
      rating: result.vote_average
        ? Math.round(result.vote_average * 10) / 10
        : undefined,
      genres: tvGenreNames(result.genre_ids).slice(0, 2),
    })),
  };
}

/**
 * Resolves the offset a caller lands on when it doesn't specify one — used
 * so the client's initial page load, and its "load earlier months" rollover
 * into the previous year, share one mechanism instead of each needing to
 * special-case "which direction am I coming from".
 *
 * One formula covers every case because `sorted` is date-ascending:
 * - current year: lands on the page containing today's date.
 * - a past year (every date < today): the index search runs off the end,
 *   so this clamps to the last full page — exactly "load earlier months"
 *   rolling into the previous year wants.
 * - a future year (every date > today): the index search matches
 *   immediately at 0 — exactly "load more" rolling into next year wants.
 */
function anchorOffsetForToday(
  sorted: (TmdbDiscoverTvResult & { name: string })[],
  total: number,
  limit: number,
): number {
  if (total === 0) return 0;
  const todayIso = new Date().toISOString().slice(0, 10);
  let rawIndex = sorted.findIndex(
    (result) => (result.first_air_date || UNDATED_SORT_KEY) >= todayIso,
  );
  if (rawIndex === -1) rawIndex = total;
  return Math.min(rawIndex, Math.max(0, total - limit));
}
