import type { MovieBreakdown, TmdbMoviePublic } from '../movie-api-types';
import { backdropUrl, posterUrl } from './constants';
import type { TmdbHttpClient } from './client';
import type { TmdbCache, TmdbMovieCacheRow } from './cache';
import { movieMatchKey } from './keys';
import { expiresAtIso, isCacheExpired } from './settings';

export type MovieEnrichDeps = {
  cache: TmdbCache;
  client: TmdbHttpClient;
  cacheTtlMs: number;
  negativeCacheTtlMs: number;
  log: (message: string) => void;
};

function cacheRowToPublic(row: {
  tmdbId: number | null;
  title: string | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number | null;
  voteCount: number | null;
}): TmdbMoviePublic {
  return {
    tmdbId: row.tmdbId ?? undefined,
    title: row.title ?? undefined,
    posterUrl: posterUrl(row.posterPath),
    backdropUrl: backdropUrl(row.backdropPath),
    overview: row.overview ?? undefined,
    voteAverage: row.voteAverage ?? undefined,
    voteCount: row.voteCount ?? undefined,
  };
}

/** Map a cache row to API fields; returns undefined for negative (miss) rows. */
export function movieCacheRowToPublic(
  row: TmdbMovieCacheRow,
): TmdbMoviePublic | undefined {
  if (row.isNegative) {
    return undefined;
  }
  return cacheRowToPublic(row);
}

async function resolveMatchKey(
  key: string,
  sample: MovieBreakdown,
  deps: MovieEnrichDeps,
): Promise<TmdbMoviePublic | undefined> {
  const title = sample.normalizedTitle;
  const year = sample.year;

  try {
    const cached = deps.cache.getMovie(key);
    if (cached && !isCacheExpired(cached.expiresAt)) {
      return cached.isNegative ? undefined : cacheRowToPublic(cached);
    }

    const search = await deps.client.searchMovie(title, year);
    if (!search) {
      deps.cache.upsertMovie({
        matchKey: key,
        tmdbId: null,
        isNegative: true,
        expiresAt: expiresAtIso(deps.negativeCacheTtlMs),
        title: null,
        overview: null,
        posterPath: null,
        backdropPath: null,
        voteAverage: null,
        voteCount: null,
        genreIdsJson: null,
        releaseDate: null,
      });
      deps.log(`tmdb movie search miss: ${key}`);
      return undefined;
    }

    const details = await deps.client.getMovie(search.id);
    if (!details) {
      deps.log(
        `tmdb movie details unavailable: ${key} (id=${String(search.id)})`,
      );
      return undefined;
    }

    const genreIdsJson = JSON.stringify(details.genres?.map((g) => g.id) ?? []);

    deps.cache.upsertMovie({
      matchKey: key,
      tmdbId: details.id,
      isNegative: false,
      expiresAt: expiresAtIso(deps.cacheTtlMs),
      title: details.title,
      overview: details.overview ?? null,
      posterPath: details.poster_path ?? null,
      backdropPath: details.backdrop_path ?? null,
      voteAverage: details.vote_average ?? null,
      voteCount: details.vote_count ?? null,
      genreIdsJson,
      releaseDate: details.release_date ?? null,
    });

    return cacheRowToPublic({
      tmdbId: details.id,
      title: details.title,
      overview: details.overview ?? null,
      posterPath: details.poster_path ?? null,
      backdropPath: details.backdrop_path ?? null,
      voteAverage: details.vote_average ?? null,
      voteCount: details.vote_count ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.log(`tmdb movie enrich failed for ${key}: ${message}`);
    return undefined;
  }
}

/**
 * Enrich movie breakdown rows with TMDB metadata (lazy cache + API on miss).
 */
export async function enrichMovieBreakdowns(
  movies: MovieBreakdown[],
  deps: MovieEnrichDeps,
): Promise<MovieBreakdown[]> {
  const uniqueKeys = [
    ...new Set(movies.map((m) => movieMatchKey(m.normalizedTitle, m.year))),
  ];

  const resolved = new Map<string, TmdbMoviePublic | undefined>();

  for (const key of uniqueKeys) {
    const sample = movies.find(
      (m) => movieMatchKey(m.normalizedTitle, m.year) === key,
    );
    if (!sample) {
      continue;
    }
    resolved.set(key, await resolveMatchKey(key, sample, deps));
  }

  return movies.map((m) => {
    const key = movieMatchKey(m.normalizedTitle, m.year);
    const tmdb = resolved.get(key);
    return tmdb ? { ...m, tmdb } : { ...m };
  });
}
