/** TMDB image CDN base; append size path + file path from API. */
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export const TMDB_POSTER_SIZE = 'w500';

export const TMDB_BACKDROP_SIZE = 'w1280';

export const TMDB_API_BASE = 'https://api.themoviedb.org/3';

export function posterUrl(
  posterPath: string | null | undefined,
): string | undefined {
  if (!posterPath) {
    return undefined;
  }
  return `${TMDB_IMAGE_BASE}/${TMDB_POSTER_SIZE}${posterPath}`;
}

export function backdropUrl(
  backdropPath: string | null | undefined,
): string | undefined {
  if (!backdropPath) {
    return undefined;
  }
  return `${TMDB_IMAGE_BASE}/${TMDB_BACKDROP_SIZE}${backdropPath}`;
}
