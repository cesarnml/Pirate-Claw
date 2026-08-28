/**
 * TMDB's fixed TV genre list (id -> English name). Verified live against
 * GET /genre/tv/list on 2026-08-28 — 17 entries, and this list changes so
 * rarely that a one-time fetch-and-cache isn't worth the extra call, cache
 * TTL, and "unknown genre_id" fallback path a self-updating table would
 * need. If TMDB ever adds a genre, update this table by hand.
 */
export const TMDB_TV_GENRES: Record<number, string> = {
  10759: 'Action & Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  10762: 'Kids',
  9648: 'Mystery',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
  37: 'Western',
};

/** Maps genre_ids to display names, dropping any id not in the table. */
export function tvGenreNames(genreIds: number[] | undefined): string[] {
  if (!genreIds) return [];
  return genreIds
    .map((id) => TMDB_TV_GENRES[id])
    .filter((name): name is string => Boolean(name));
}
