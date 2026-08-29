/**
 * TMDB's fixed movie genre list (id -> English name). Verified live against
 * GET /genre/movie/list on 2026-08-29 — 19 entries, same one-time
 * fetch-and-cache rationale as TMDB_TV_GENRES (see tv-genres.ts). If TMDB
 * ever adds a genre, update this table by hand.
 */
export const TMDB_MOVIE_GENRES: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
};

/** Maps genre_ids to display names, dropping any id not in the table. */
export function movieGenreNames(genreIds: number[] | undefined): string[] {
  if (!genreIds) return [];
  return genreIds
    .map((id) => TMDB_MOVIE_GENRES[id])
    .filter((name): name is string => Boolean(name));
}
