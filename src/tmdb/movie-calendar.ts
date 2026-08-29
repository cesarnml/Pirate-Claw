import type { TmdbDiscoverMovieResult, TmdbHttpClient } from './client';
import { languageDisplayName } from './languages';
import { movieGenreNames } from './movie-genres';

export type CalendarMovieItem = {
  tmdbId: number;
  title: string;
  releaseDate: string | null;
  overview: string;
  posterUrl: string | null;
  popularity: number;
  /** Whether this movie already exists in the owned library (Plex cache /
   * candidate_state), passed in by the caller — mirrors CalendarTvItem's
   * alreadyTracked, but movies have no "tracked by name" concept (see
   * notes/public/movie-calendar-scope.md), so this is an ownership check,
   * not a policy-tracking check. */
  alreadyGrabbed: boolean;
  language: string | undefined;
  rating: number | undefined;
  genres: string[];
  /** TMDB's real US digital/physical release date, when it has one yet.
   * Null does not mean "never" — it usually means "still in theaters, TMDB
   * hasn't recorded a digital date yet". */
  digitalOrPhysicalReleaseDate: string | null;
  /** theatrical releaseDate + ~7 weeks, only populated when
   * digitalOrPhysicalReleaseDate is null and releaseDate is known — a rough
   * "a decent torrent is plausibly out around here" estimate, not a claim
   * of fact. See getUsDigitalOrPhysicalReleaseDate's own comment for why
   * this distinction matters. */
  estimatedAvailabilityDate: string | null;
};

export type MovieCalendarDeps = {
  client: TmdbHttpClient;
  cache: MovieCalendarCache;
  releaseDateCache: MovieReleaseDateCache;
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — same rationale as CalendarCache.
const MONTHS_PER_YEAR = 12;

// Rough midpoint of the theatrical-to-quality-torrent delay described in
// notes/public/movie-calendar-scope.md (6-8 weeks) — used only as a badge
// label when TMDB has no real digital/physical date yet, never presented as
// a confirmed date.
const ESTIMATED_AVAILABILITY_OFFSET_DAYS = 49;

function monthRange(year: number, month: number): { gte: string; lte: string } {
  const pad = String(month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    gte: `${year}-${pad}-01`,
    lte: `${year}-${pad}-${String(lastDay).padStart(2, '0')}`,
  };
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Tiny in-memory TTL cache, one entry per calendar year — same shape and
 * rationale as CalendarCache in calendar.ts (see its comment). Kept as a
 * separate class rather than a shared generic: the two calendars fetch
 * different TMDB result types and this is small enough that duplicating it
 * is cheaper to read than a shared abstraction would be to follow. */
export class MovieCalendarCache {
  private readonly entries = new Map<
    number,
    { fetchedAt: number; items: TmdbDiscoverMovieResult[] }
  >();
  private readonly inFlight = new Map<
    number,
    Promise<TmdbDiscoverMovieResult[]>
  >();

  get(year: number): TmdbDiscoverMovieResult[] | undefined {
    const entry = this.entries.get(year);
    if (!entry) return undefined;
    if (Date.now() - entry.fetchedAt >= CACHE_TTL_MS) return undefined;
    return entry.items;
  }

  set(year: number, items: TmdbDiscoverMovieResult[]): void {
    this.entries.set(year, { fetchedAt: Date.now(), items });
  }

  async fetchOnce(
    year: number,
    fetcher: () => Promise<TmdbDiscoverMovieResult[]>,
  ): Promise<TmdbDiscoverMovieResult[]> {
    const pending = this.inFlight.get(year);
    if (pending) return pending;

    const promise = fetcher().finally(() => this.inFlight.delete(year));
    this.inFlight.set(year, promise);
    return promise;
  }
}

/** Per-movie cache for the release_dates lookup — a separate TTL cache from
 * MovieCalendarCache because it's keyed by movie id (fetched lazily, one
 * page's worth of items at a time), not by year. A `null` result (TMDB has
 * no digital/physical date yet) is cached too, same length as a real
 * result: it's a normal, common outcome for a still-in-theaters movie, not
 * a failure worth re-fetching every page load. */
export class MovieReleaseDateCache {
  private readonly entries = new Map<
    number,
    { fetchedAt: number; date: string | null }
  >();
  private readonly inFlight = new Map<
    number,
    Promise<string | null | undefined>
  >();

  get(tmdbId: number): { date: string | null } | undefined {
    const entry = this.entries.get(tmdbId);
    if (!entry) return undefined;
    if (Date.now() - entry.fetchedAt >= CACHE_TTL_MS) return undefined;
    return { date: entry.date };
  }

  /** `fetcher` returns undefined when the underlying TMDB call failed (see
   * TmdbHttpClient.getUsDigitalOrPhysicalReleaseDate's own comment) — that
   * case is deliberately never persisted to `entries`, so a transient
   * failure doesn't lock in "no date" for a full TTL. A confirmed `null`
   * (TMDB genuinely has no digital/physical date yet) is cached the same
   * length as a real date, same as MovieCalendarCache only caching a
   * non-empty year fetch. */
  async fetchOnce(
    tmdbId: number,
    fetcher: () => Promise<string | null | undefined>,
  ): Promise<string | null> {
    const pending = this.inFlight.get(tmdbId);
    if (pending) return (await pending) ?? null;

    const promise = fetcher().finally(() => this.inFlight.delete(tmdbId));
    this.inFlight.set(tmdbId, promise);
    const date = await promise;
    if (date !== undefined) {
      this.entries.set(tmdbId, { fetchedAt: Date.now(), date });
    }
    return date ?? null;
  }
}

export type MovieCalendarPage = {
  items: CalendarMovieItem[];
  total: number;
  offset: number;
};

const DEFAULT_PAGE_LIMIT = 20;
const UNDATED_SORT_KEY = '9999-99-99';

export async function getMovieCalendar(
  deps: MovieCalendarDeps,
  year: number,
  ownedTmdbIds: Set<number>,
  pagination: { offset?: number; limit?: number } = {},
): Promise<MovieCalendarPage> {
  const limit = pagination.limit ?? DEFAULT_PAGE_LIMIT;
  let results = deps.cache.get(year);

  if (results === undefined) {
    results = await deps.cache.fetchOnce(year, async () => {
      const months = await Promise.all(
        Array.from({ length: MONTHS_PER_YEAR }, (_, i) => {
          const { gte, lte } = monthRange(year, i + 1);
          return deps.client.discoverMovie(gte, lte, 1);
        }),
      );
      return months.flat();
    });

    // Same "don't lock in a false negative for a full TTL" rationale as
    // calendar.ts — an empty result is far more likely to mean "TMDB call
    // failed" than "nothing released this year".
    if (results.length > 0) {
      deps.cache.set(year, results);
    }
  }

  const seenIds = new Set<number>();
  const named = results.filter(
    (result): result is TmdbDiscoverMovieResult & { title: string } => {
      if (!result.title) return false;
      if (seenIds.has(result.id)) return false;
      seenIds.add(result.id);
      return true;
    },
  );
  named.sort((left, right) =>
    (left.release_date || UNDATED_SORT_KEY).localeCompare(
      right.release_date || UNDATED_SORT_KEY,
    ),
  );

  const total = named.length;
  const offset = pagination.offset ?? anchorOffsetForToday(named, total, limit);
  const page = named.slice(offset, offset + limit);

  const items = await Promise.all(
    page.map(async (result) => {
      const releaseDate = result.release_date ?? null;
      let digitalOrPhysicalReleaseDate: string | null = null;
      const cached = deps.releaseDateCache.get(result.id);
      if (cached) {
        digitalOrPhysicalReleaseDate = cached.date;
      } else {
        digitalOrPhysicalReleaseDate = await deps.releaseDateCache.fetchOnce(
          result.id,
          () => deps.client.getUsDigitalOrPhysicalReleaseDate(result.id),
        );
      }
      const estimatedAvailabilityDate =
        !digitalOrPhysicalReleaseDate && releaseDate
          ? addDaysIso(releaseDate, ESTIMATED_AVAILABILITY_OFFSET_DAYS)
          : null;

      return {
        tmdbId: result.id,
        title: result.title,
        releaseDate,
        overview: result.overview ?? '',
        posterUrl: result.poster_path
          ? `https://image.tmdb.org/t/p/w500${result.poster_path}`
          : null,
        popularity: result.popularity ?? 0,
        alreadyGrabbed: ownedTmdbIds.has(result.id),
        language: languageDisplayName(result.original_language),
        // vote_average of exactly 0 means "no votes yet" in practice, not a
        // genuine 0.0 rating — treat it the same as missing (same rule as
        // getTvCalendar in calendar.ts).
        rating: result.vote_average
          ? Math.round(result.vote_average * 10) / 10
          : undefined,
        genres: movieGenreNames(result.genre_ids).slice(0, 2),
        digitalOrPhysicalReleaseDate,
        estimatedAvailabilityDate,
      } satisfies CalendarMovieItem;
    }),
  );

  return { total, offset, items };
}

/** Same mechanism as anchorOffsetForToday in calendar.ts — see its comment
 * for the full rationale (current/past/future year all resolved by one
 * formula because `sorted` is date-ascending). */
function anchorOffsetForToday(
  sorted: (TmdbDiscoverMovieResult & { title: string })[],
  total: number,
  limit: number,
): number {
  if (total === 0) return 0;
  const todayIso = new Date().toISOString().slice(0, 10);
  let rawIndex = sorted.findIndex(
    (result) => (result.release_date || UNDATED_SORT_KEY) >= todayIso,
  );
  if (rawIndex === -1) rawIndex = total;
  return Math.min(rawIndex, Math.max(0, total - limit));
}
