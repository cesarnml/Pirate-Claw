export type PlexStatus = 'in_library' | 'missing' | 'unknown';

/** Per-movie ownership detail backing the Movie Calendar / Top Movies of
 * Year UI's honest-language badges — see notes/public/movie-calendar-scope.md.
 * `grabbed` alone (pirate-claw queued/downloaded it, via RSS or a manual/
 * adopted grab) is a real but INTERMEDIATE state, not the golden truth:
 * Plex is. `plexStatus` is that golden truth, computed independently — a
 * movie can be `grabbed: true` with `plexStatus: 'missing'` (queued but not
 * yet in the library, or the wrong thing got grabbed) just as easily as the
 * reverse (already in Plex from before pirate-claw existed, never grabbed
 * through here at all). The UI shows "in library" only when plexStatus
 * confirms it, and "queued via {source}" only as an interim signal while
 * that hasn't been confirmed — never conflates the two the way a single
 * flattened boolean used to. */
export type MovieOwnershipStatus = {
  grabbed: boolean;
  /** Which ledger recorded the grab — 'thepiratebay' | 'yts' (manual grabs),
   * 'adopted-filesystem' | 'adopted-plex' (see src/adoption/), or 'rss' for
   * an ordinary candidate_state row from the feed pipeline. Null when
   * `grabbed` is false, or when it's true solely because plexStatus
   * confirms ownership with no ledger entry behind it at all. */
  grabSource: ManualMovieGrabSourceOrRss | null;
  plexStatus: PlexStatus;
};

export type ManualMovieGrabSourceOrRss =
  | 'thepiratebay'
  | 'yts'
  | 'adopted-filesystem'
  | 'adopted-plex'
  | 'rss';

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
  pirateClawDisposition?: 'removed' | 'deleted';
  queuedAt?: string;
  transmissionPercentDone?: number;
  transmissionStatusCode?: number;
  transmissionTorrentHash?: string;
  plexStatus: PlexStatus;
  watchCount: number | null;
  lastWatchedAt: string | null;
  tmdb?: TmdbMoviePublic;
};
