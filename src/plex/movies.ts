import type { MovieBreakdown } from '../movie-api-types';
import type { PlexHttpClient, PlexSearchResult } from './client';
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

export async function refreshMovieLibraryCache(
  movies: MovieBreakdown[],
  deps: PlexMovieEnrichDeps,
): Promise<void> {
  const uniqueMovies = dedupeMovies(movies);

  for (const movie of uniqueMovies) {
    if (movie.year == null) {
      continue;
    }

    const searchResults = await deps.client.searchMovies(movie.normalizedTitle);
    if (searchResults === null) {
      deps.log(
        `plex movie refresh skipped for ${movie.normalizedTitle} (${String(movie.year)}): search unavailable`,
      );
      continue;
    }

    const best = selectBestMovieMatch(movie, searchResults);
    const cachedAt = new Date().toISOString();

    if (!best) {
      deps.cache.upsertMovie({
        title: movie.normalizedTitle,
        year: movie.year,
        plexRatingKey: null,
        inLibrary: false,
        watchCount: 0,
        lastWatchedAt: null,
        cachedAt,
      });
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
  }
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

  let score = diceCoefficient(title, candidateTitle);

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

function normalizeForMatch(input: string): string {
  return input
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
