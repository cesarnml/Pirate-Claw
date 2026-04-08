/** TMDB metadata attached to a TV show breakdown (API + dashboard). */
export type TmdbTvShowMeta = {
  tmdbId?: number;
  name?: string;
  posterUrl?: string;
  backdropUrl?: string;
  overview?: string;
  voteAverage?: number;
  voteCount?: number;
  numberOfSeasons?: number;
};

/** Per-episode TMDB fields merged next to local candidate state. */
export type TmdbTvEpisodeMeta = {
  name?: string;
  stillUrl?: string;
  airDate?: string;
  overview?: string;
};

export type ShowEpisode = {
  episode: number;
  identityKey: string;
  status: string;
  lifecycleStatus?: string;
  queuedAt?: string;
  tmdb?: TmdbTvEpisodeMeta;
};

export type ShowSeason = {
  season: number;
  episodes: ShowEpisode[];
};

export type ShowBreakdown = {
  normalizedTitle: string;
  seasons: ShowSeason[];
  tmdb?: TmdbTvShowMeta;
};
