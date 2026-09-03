import type { PlexStatus } from './movie-api-types';

/** TMDB metadata attached to a TV show breakdown (API + dashboard). */
export type TmdbTvShowMeta = {
  tmdbId?: number;
  name?: string;
  posterUrl?: string;
  backdropUrl?: string;
  network?: string;
  overview?: string;
  voteAverage?: number;
  voteCount?: number;
  numberOfSeasons?: number;
  /** Total episodes across the show's real seasons (specials excluded),
   * summed from the per-season counts TMDB returns on the same show-details
   * call as numberOfSeasons — no extra request, and no new column: the raw
   * seasons payload was already being cached, just never surfaced. Undefined
   * when the cache row predates that payload; render it as "unknown", never
   * as 0. See episodeCountFromSeasonsJson in tmdb/tv-enrichment.ts. */
  numberOfEpisodes?: number;
  /** The air date of the show's first episode ever — cheap, already part
   * of the same TMDB show-details call as numberOfSeasons, no extra
   * request. Lets the UI say "hasn't aired yet" (future date) honestly and
   * immediately, without needing the deeper per-season Plex cache below. */
  firstAirDate?: string;
  /** TMDB's own lifecycle status ('Ended' | 'Canceled' | 'Returning Series' |
   * 'In Production' | 'Planned' | 'Pilot') — also free on the same
   * show-details call. Lets the TMDB cache stop re-checking a show that will
   * never air again on the same clock as one still airing; see
   * isDormantShow in tmdb/tv-enrichment.ts. */
  status?: string;
  /** TMDB's "currently producing new episodes" flag. Checked alongside
   * status rather than alone — a 'Returning Series' between seasons can
   * still report this false during an ordinary hiatus, so it takes both
   * together to call a show truly done. */
  inProduction?: boolean;
};

/** Aired-vs-owned episode counts for one season, cached from the show
 * detail page's (or "Refresh Plex"'s) per-episode Plex walk — see
 * PlexTvSeasonCompletionRow. Powers an honest COMPLETE/MISSING(N) signal on
 * the /shows grid without a live per-episode walk per card. Absent
 * entirely (undefined on ShowBreakdown, not an empty array) means this
 * show's completion has never been computed yet. */
export type ShowSeasonCompletion = {
  season: number;
  airedCount: number;
  ownedCount: number;
  /** When this season's counts were computed — deliberately per-season, not
   * a single show-level timestamp, since seasons can be refreshed at
   * different times (e.g. only the active season on a detail-page visit
   * once the per-season lazy-load remedy for the Simpsons-scale problem
   * lands). The UI should treat the oldest of these as the trustworthy
   * "as of" bound for any whole-show claim (COMPLETE/MISSING) built from
   * all of them together. */
  cachedAt: string;
  /** Whether the live walk behind these counts saw Plex disagree with TMDB
   * on this season's episode count. undefined = unknown (row predates the
   * column, or there was nothing to compare) — never "no mismatch". */
  episodeCountMismatch?: boolean;
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
  pirateClawDisposition?: 'removed' | 'deleted';
  queuedAt?: string;
  resolution?: string;
  codec?: string;
  transmissionPercentDone?: number;
  transmissionStatusCode?: number;
  transmissionTorrentHash?: string;
  tmdb?: TmdbTvEpisodeMeta;
};

export type ShowSeason = {
  season: number;
  episodes: ShowEpisode[];
};

export type ShowBreakdown = {
  normalizedTitle: string;
  seasons: ShowSeason[];
  plexStatus: PlexStatus;
  watchCount: number | null;
  lastWatchedAt: string | null;
  /** When the Plex cache last checked this show, even if that check is now
   * stale (past refreshIntervalMinutes) and therefore not trusted for
   * `plexStatus` above — surfaced so "unknown" can be told apart from "never
   * checked" vs. "checked a while ago, due for another look." Undefined
   * when no cache row exists at all for this show yet. */
  plexCheckedAt?: string | null;
  /** Undefined = never computed; see ShowSeasonCompletion. */
  seasonCompletions?: ShowSeasonCompletion[];
  tmdb?: TmdbTvShowMeta;
  /** The operator's pinned TMDB series id for this show, when they've set one
   * (see TvRule.tmdbId). Undefined means the identity above came from TMDB's
   * popularity-ranked title search and may well be the wrong series — which
   * is exactly the distinction the show page's "Fix TMDB match" control needs
   * to render honestly. */
  tmdbPinnedId?: number;
};
