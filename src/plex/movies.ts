import type { MovieBreakdown } from '../movie-api-types';
import {
  type PlexHttpClient,
  type PlexSearchResult,
  dedupeSearchResults,
} from './client';
import type { PlexCache } from './cache';

const PLEX_MOVIE_MATCH_THRESHOLD = 0.72;

export type PlexMovieEnrichDeps = {
  cache: PlexCache;
  client: PlexHttpClient;
  refreshIntervalMinutes: number;
  log: (message: string) => void;
};

export function enrichMovieBreakdownsFromPlexCache(
  movies: MovieBreakdown[],
  deps: Pick<PlexMovieEnrichDeps, 'cache' | 'refreshIntervalMinutes'>,
): MovieBreakdown[] {
  return movies.map((movie) => {
    if (movie.year == null) {
      return movie;
    }

    const row = deps.cache.getMovie(movie.normalizedTitle, movie.year);
    if (!row || isPlexCacheExpired(row.cachedAt, deps.refreshIntervalMinutes)) {
      return movie;
    }

    return {
      ...movie,
      plexStatus: row.inLibrary ? 'in_library' : 'missing',
      watchCount: row.watchCount ?? 0,
      lastWatchedAt: row.lastWatchedAt,
    };
  });
}

export type RefreshLibraryCacheResult = {
  /** Cache rows actually written this pass — a real Plex answer, positive
   * or negative. */
  checked: number;
  /** Left untouched because Plex gave no usable answer this pass (see the
   * `!catalogAvailable` skip below) — the prior cache row, if any, still
   * stands. Callers that report "sync complete" to a user (the Config
   * "Sync Now" buttons) need this to tell a real check apart from a no-op:
   * see runFullTvPlexSyncUncached's own comment for why reporting success
   * when everything was skipped would itself be a dishonest-state bug of
   * the same shape this whole fix is about. */
  skipped: number;
};

export async function refreshMovieLibraryCache(
  movies: MovieBreakdown[],
  deps: PlexMovieEnrichDeps,
): Promise<RefreshLibraryCacheResult> {
  const uniqueMovies = dedupeMovies(movies);
  let movieCatalog: PlexSearchResult[] = [];
  // Tracks whether the catalog fetch actually succeeded — distinct from
  // "movieCatalog is empty", which is also what a legitimately-empty-but-
  // successful fetch looks like. See the `!best` branch below for why this
  // matters: a failed fetch must never be treated the same as a real,
  // complete "not in the library" answer.
  let catalogAvailable = true;
  try {
    movieCatalog = await deps.client.listAllMoviesForMatching();
  } catch (error) {
    catalogAvailable = false;
    const message = error instanceof Error ? error.message : String(error);
    deps.log(`plex movie library catalog failed: ${message}`);
  }

  let checked = 0;
  let skipped = 0;

  for (const movie of uniqueMovies) {
    if (movie.year == null) {
      continue;
    }

    // Deliberately NOT wrapped in a per-movie try/catch — a thrown error
    // here (e.g. searchMovies itself throwing rather than returning null)
    // propagates out of this whole function, same as before this fix.
    // background-refresh.ts's own try/catch around this call is the
    // isolation boundary: it's what keeps a broken movie sweep from taking
    // the show sweep down with it (see its "continues the show sweep when
    // the movie sweep fails" test) — that's the granularity this codebase
    // has chosen, not per-item.
    const searchResults = await deps.client.searchMovies(movie.normalizedTitle);
    if (searchResults === null) {
      deps.log(
        `plex movie refresh: search unavailable for ${movie.normalizedTitle} (${String(movie.year)}); matching against library catalog only`,
      );
    }

    const merged = dedupeSearchResults([
      ...(searchResults ?? []),
      ...movieCatalog,
    ]);

    const best = selectBestMovieMatch(movie, merged);
    const cachedAt = new Date().toISOString();

    if (!best) {
      // No match found — but that's only a real "not in Plex" answer when
      // the whole-library catalog fetch actually succeeded. The catalog is
      // the trustworthy, complete signal; a per-title search is documented
      // (see listAllMoviesForMatching) as a fallback that can itself omit
      // or reshape real hits, so it's never on its own enough to justify a
      // negative conclusion — only to confirm a POSITIVE match faster than
      // waiting on the catalog. If the catalog fetch failed, `merged`
      // being empty just means nothing trustworthy was checked, not that
      // Plex confirmed an empty result — writing inLibrary:false here
      // would silently overwrite (and, downstream in ownedMovieStatuses,
      // un-grab) a previously confirmed in_library row purely because
      // Plex was unreachable this cycle. Leave the existing cache row
      // untouched instead; the next cycle that actually reaches Plex will
      // record the real answer. Found via a live incident 2026-08-31: a
      // run of Plex timeouts during the background refresh reset several
      // already-owned movies back to "missing" and brought back their
      // grab buttons.
      if (!catalogAvailable) {
        deps.log(
          `plex movie refresh: no full-catalog answer from Plex for ${movie.normalizedTitle} (${String(movie.year)}) — leaving cached status as-is`,
        );
        skipped += 1;
        continue;
      }
      deps.cache.upsertMovie({
        title: movie.normalizedTitle,
        year: movie.year,
        plexRatingKey: null,
        inLibrary: false,
        watchCount: 0,
        lastWatchedAt: null,
        cachedAt,
      });
      checked += 1;
      continue;
    }

    deps.cache.upsertMovie({
      title: movie.normalizedTitle,
      year: movie.year,
      plexRatingKey: best.ratingKey ?? null,
      inLibrary: true,
      watchCount: best.viewCount ?? 0,
      lastWatchedAt:
        best.lastViewedAt != null
          ? new Date(best.lastViewedAt * 1000).toISOString()
          : null,
      cachedAt,
    });
    checked += 1;
  }

  return { checked, skipped };
}

export function isPlexCacheExpired(
  cachedAt: string,
  refreshIntervalMinutes: number,
): boolean {
  const parsed = Date.parse(cachedAt);
  if (Number.isNaN(parsed)) {
    return true;
  }

  return parsed + refreshIntervalMinutes * 2 * 60_000 <= Date.now();
}

function dedupeMovies(movies: MovieBreakdown[]): MovieBreakdown[] {
  const seen = new Set<string>();
  const unique: MovieBreakdown[] = [];

  for (const movie of movies) {
    const key = `${movie.normalizedTitle.toLowerCase()}|${movie.year ?? '_'}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(movie);
  }

  return unique;
}

function selectBestMovieMatch(
  movie: MovieBreakdown,
  candidates: PlexSearchResult[],
): PlexSearchResult | undefined {
  let best: { score: number; result: PlexSearchResult } | undefined;

  for (const candidate of candidates) {
    const score = movieMatchScore(movie, candidate);
    if (score < PLEX_MOVIE_MATCH_THRESHOLD) {
      continue;
    }
    if (!best || score > best.score) {
      best = { score, result: candidate };
    }
  }

  return best?.result;
}

function movieMatchScore(
  movie: MovieBreakdown,
  candidate: PlexSearchResult,
): number {
  const title = normalizeForMatch(movie.normalizedTitle);
  const candidateTitle = normalizeForMatch(candidate.title ?? '');
  if (!candidateTitle) {
    return 0;
  }

  let score = Math.max(
    tokenCoverScore(title, candidateTitle),
    title.length >= 2 && candidateTitle.length >= 2
      ? diceCoefficient(title, candidateTitle)
      : 0,
  );

  if (movie.year != null && candidate.year != null) {
    if (movie.year === candidate.year) {
      score += 0.2;
    } else {
      score -= Math.min(Math.abs(movie.year - candidate.year) * 0.2, 0.6);
    }
  }

  if (candidate.type && candidate.type !== 'movie') {
    score -= 0.2;
  }

  return score;
}

function tokenCoverScore(needle: string, haystack: string): number {
  const words = needle.split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) {
    return 0;
  }
  const padded = ` ${haystack} `;
  const covered = words.filter((w) => padded.includes(` ${w} `)).length;
  if (covered !== words.length) {
    return 0;
  }
  return 0.94;
}

function normalizeForMatch(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function diceCoefficient(left: string, right: string): number {
  if (left === right) {
    return 1;
  }
  if (left.length < 2 || right.length < 2) {
    return 0;
  }

  const leftPairs = pairCounts(left);
  const rightPairs = pairCounts(right);
  let overlap = 0;

  for (const [pair, leftCount] of leftPairs) {
    const rightCount = rightPairs.get(pair) ?? 0;
    overlap += Math.min(leftCount, rightCount);
  }

  return (2 * overlap) / (left.length - 1 + (right.length - 1));
}

function pairCounts(input: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let index = 0; index < input.length - 1; index += 1) {
    const pair = input.slice(index, index + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}
