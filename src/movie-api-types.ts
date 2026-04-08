/** TMDB fields exposed on movie API responses (dashboard + JSON). */
export type TmdbMoviePublic = {
  tmdbId?: number;
  title?: string;
  posterUrl?: string;
  backdropUrl?: string;
  overview?: string;
  voteAverage?: number;
  voteCount?: number;
};

export type MovieBreakdown = {
  normalizedTitle: string;
  year?: number;
  resolution?: string;
  codec?: string;
  identityKey: string;
  status: string;
  lifecycleStatus?: string;
  queuedAt?: string;
  tmdb?: TmdbMoviePublic;
};
