import type { PlexHttpClient } from '../plex/client';
import type { PlexCache } from '../plex/cache';
import { selectBestShowMatch } from '../plex/shows';
import {
  isSeasonFinished,
  loadSeasonEpisodes,
  type TvEnrichDeps,
} from '../tmdb/tv-enrichment';
import { tvMatchKey } from '../tmdb/keys';
import type { ManualGrabsStore } from '../manual-grabs/store';
import type { ShowBreakdown } from '../tv-api-types';
import type { TransmissionConfig } from '../config';
import { fetchTorrentStats, type TorrentStatSnapshot } from '../transmission';

export type EpisodePlexStatus = 'in_library' | 'missing' | 'unknown';

/** "Today" in the timezone TMDB's `air_date` is expressed in — the US
 * broadcast day. The server's own clock is the wrong reference (this box
 * sits in Pacific, and the operator reads the UI from wherever they are),
 * and UTC runs ~5h ahead of Eastern, which flips an episode's air day over
 * while it's still airing on the east coast.
 *
 * Built from formatToParts with 'en-US', not the more direct
 * `new Intl.DateTimeFormat('en-CA', {timeZone}).format(now)` — a Node build
 * with small-icu (no full timezone-aware locale data) silently mis-renders
 * 'en-CA' as M/D/YYYY instead of YYYY-MM-DD, corrupting every string
 * comparison against airDate. Reassembling the digits ourselves sidesteps
 * locale-data completeness entirely; mirrors web/src/lib/helpers.ts. */
export function broadcastTodayIsoDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Where one grab attempt currently stands. Resolved in strict precedence
 * order (see toGrabState), so exactly one of these is true at a time:
 *
 *  - 'completed' — Transmission was observed at 100% for this hash
 *    (manual_grabs.done_at). Wins over 'removed' deliberately: a torrent
 *    that finished and was *then* cleared out of Transmission is a success
 *    story, and must not be counted among the releases that failed.
 *  - 'removed'   — disposed without ever completing. This is the "tried that
 *    one, don't try it again" record; it is what the panel counts as
 *    Attempted.
 *  - 'stalled'   — still active, and its torrent looks stuck (see
 *    isStalledSnapshot).
 *  - 'queued'    — still active and not (yet) stuck. The ordinary case.
 */
export type EpisodeManualGrabState =
  | 'queued'
  | 'stalled'
  | 'completed'
  | 'removed';

export type EpisodeManualGrabInfo = {
  /** The manual_grabs row id. Carried purely so the client has a key that is
   * genuinely unique per attempt — the same magnet grabbed twice for one
   * episode yields two rows sharing a hash, which collides as a Svelte keyed
   * `each` key and silently drops one of them from the DOM. */
  id: number;
  queuedAt: string;
  source: string;
  rawTitle: string;
  transmissionTorrentHash: string | null;
  state: EpisodeManualGrabState;
  /** Whether this grab was ever disposed, which `state` alone can't answer:
   * 'completed' outranks 'removed', so a finished-then-cleared torrent and a
   * finished-and-still-seeding one both read 'completed'. The panel needs the
   * difference to decide whether a remove button would do anything — pulling
   * an already-removed torrent just earns a 400. Not derivable from
   * disposedAt either: rows disposed before that column existed have none. */
  disposed: boolean;
  /** When it was disposed — null while active, and null on rows disposed
   * before disposed_at existed. Shown in the panel's per-episode attempt
   * history so "when did I give up on this one" is answerable. */
  disposedAt: string | null;
  doneAt: string | null;
};

export type EpisodeWithStatus = {
  episode: number;
  name?: string;
  overview?: string;
  airDate?: string;
  plexStatus: EpisodePlexStatus;
  /** Every manual grab ever recorded for this episode, most recent first,
   * whatever became of it — each carrying its own `state`. Plural because
   * grabbing a replacement for a stalled torrent is meant to leave the old
   * one in place (and manageable) until you've confirmed the new one is
   * actually working, not silently hide it (see grill-me: torrent queue/grab
   * UX fixes, 2026-09-02 follow-up).
   *
   * Disposed rows are included, not filtered out — that history is exactly
   * what lets the panel mark a search result "Attempted (2)" so the operator
   * doesn't re-grab a release they already gave up on (grill-me: per-torrent
   * grab state, 2026-09-03). Consumers that only care about live torrents
   * must filter on `state`; the "Queued via X" badge in particular has to,
   * or a long-abandoned grab would read as queued forever. */
  manualGrabs: EpisodeManualGrabInfo[];
};

export type SeasonWithStatus = {
  season: number;
  episodes: EpisodeWithStatus[];
  /** True when Plex's own episode count for this season differs from
   * TMDB's — a season-level numbering/detection quirk worth flagging rather
   * than trusting the per-episode grid blindly. Undefined when Plex data for
   * this season isn't available (can't compare). */
  episodeCountMismatch: boolean | undefined;
  /** How many of this season's episodes have aired as of today, per TMDB's
   * air dates — exposed so callers (e.g. api.ts's persistSeasonCompletions)
   * reuse this instead of re-deriving the same date comparison themselves. */
  airedEpisodeCount: number;
  /** Where this season's per-episode `plexStatus` values came from.
   * 'cached-completion' means no Plex call was made at all — the season is
   * TMDB-finished and the cached plex_tv_season_completion row already says
   * every aired episode is owned (see canServeFromCompletionCache). Callers
   * that write *back* into that cache must skip these seasons, or the cache
   * would keep re-confirming itself from itself and never re-verify. */
  plexSource: 'live' | 'cached-completion';
};

export type ShowEpisodeStatus = {
  /** False when Plex data could not be confirmed at all for this show right
   * now (unconfigured, never scanned, or a live request just failed) — every
   * episode then reads 'unknown', not 'missing', to avoid steering a manual
   * grab for something already owned. */
  plexReachable: boolean;
  seasons: SeasonWithStatus[];
};

export type EpisodeStatusDeps = {
  tmdb: TvEnrichDeps;
  plex?: {
    client: PlexHttpClient;
    cache: PlexCache;
  };
  manualGrabs: ManualGrabsStore;
  /** Optional: without it, every manualGrab reads stalled:false rather than
   * failing the whole panel — the missing-episodes panel worked fine before
   * stalled-detection existed, and a Transmission-lookup failure shouldn't
   * take the rest of the page down with it. */
  transmissionConfig?: TransmissionConfig;
  /** Optional: without it, loadPlexPresence's per-phase timing (roadmap item
   * 22) is measured but never surfaces anywhere. Wired up in api.ts so this
   * module itself stays agnostic of console vs. any other log sink. */
  log?: (message: string) => void;
  /** Optional: the same `x-request-id` the web layer stamps on the outbound
   * call and the daemon's [route] middleware echoes (roadmap item 9) — carried
   * this one level deeper so a slow [plex-match] line can be grepped by the
   * exact same id as the [route] line it happened inside, instead of
   * correlating by timestamp the way §11 originally had to. */
  requestId?: string;
};

/** A torrent counts as stalled when it's sat in Transmission's downloading
 * state for more than a day (still resolving pieces, no matter the current
 * instantaneous rate — see grill-me Q: "skip the download rate
 * requirement", 2026-09-01), or when Transmission itself is reporting an
 * error (e.g. no peers found) regardless of age. Deliberately NOT
 * 'queued' (Transmission's own queue-cap hold — not this torrent's fault)
 * or 'stopped'/'seeding'/'completed' (paused or already done isn't
 * "stalled"). */
const STALL_AGE_MS = 24 * 60 * 60 * 1000;

function isStalledSnapshot(torrent: TorrentStatSnapshot | undefined): boolean {
  if (!torrent) return false;
  if (torrent.errorString) return true;
  if (torrent.status !== 'downloading') return false;
  if (!torrent.addedDate) return false;
  return Date.now() - Date.parse(torrent.addedDate) > STALL_AGE_MS;
}

/**
 * Assembles the season/episode grid for the missing-episodes feature: TMDB's
 * canonical per-season episode list (independent of local queue history) +
 * Plex's live per-episode presence + any manual-grab records for this show.
 * Returns null when the show has no TMDB match yet (nothing to build from).
 *
 * `options.season`, when given, restricts the *entire* walk (TMDB per-season
 * fetch AND the Plex per-season episode fetch) to just that one season —
 * this is the difference between an O(seasons) live walk and an O(1) one. A
 * show with 30+ seasons (the "Simpsons case") would otherwise re-fetch every
 * season's Plex + TMDB data on every single page view. Season buttons for
 * *other* seasons are rendered by the caller from the already-cached
 * plex_tv_season_completion rows (see ShowBreakdown.seasonCompletions), not
 * from this function's output — so omitting them here costs nothing in the
 * UI. Omitting `options.season` entirely still walks every season (used by
 * the explicit "Refresh Plex" action, which is deliberately a full refresh).
 *
 * `options.forceLivePlex` disables the cached-completion fast path below.
 * That same "Refresh Plex" action is the one caller that means *re-verify*
 * rather than "answer as cheaply as you honestly can."
 */
export async function buildShowEpisodeStatus(
  show: ShowBreakdown,
  deps: EpisodeStatusDeps,
  options?: { season?: number; forceLivePlex?: boolean },
): Promise<ShowEpisodeStatus | null> {
  const tmdbId = show.tmdb?.tmdbId;
  const numberOfSeasons = show.tmdb?.numberOfSeasons;
  if (!tmdbId || !numberOfSeasons) {
    return null;
  }

  const matchKey = tvMatchKey(show.normalizedTitle);
  const todayIsoDate = broadcastTodayIsoDate();
  const targetSeason = options?.season;
  const manualGrabsByKey = groupManualGrabsByEpisode(
    deps.manualGrabs.listForShow(show.normalizedTitle),
  );
  await annotateStalledGrabs(manualGrabsByKey, deps.transmissionConfig);

  // Each season's TMDB lookup is independent (own cache row, own possible
  // HTTP call) — run them concurrently rather than one at a time, the same
  // way enrichShowBreakdowns already does for its own per-show TMDB calls.
  const seasonNumbers =
    targetSeason !== undefined
      ? [targetSeason]
      : Array.from({ length: numberOfSeasons }, (_, i) => i + 1);

  // TMDB resolves before Plex, deliberately. The two halves of this grid have
  // wildly different volatility and cost: TMDB's per-season episode list is
  // SQLite-cached for 7 days (42 once the season is finished — see
  // tv-enrichment.ts) and usually costs zero network, while the Plex half is
  // 2-3 live PMS round trips per view. Doing TMDB first is what lets
  // canServeFromCompletionCache decide, per season, whether the Plex half is
  // needed at all — that question can't be answered without the season's air
  // dates.
  type TmdbSeasonEpisodes = Awaited<ReturnType<typeof loadSeasonEpisodes>>;
  const tmdbSeasons = new Map<number, TmdbSeasonEpisodes>(
    await Promise.all(
      seasonNumbers.map(
        async (seasonNumber) =>
          [
            seasonNumber,
            await loadSeasonEpisodes(matchKey, tmdbId, seasonNumber, deps.tmdb),
          ] as const,
      ),
    ),
  );

  // Any season a cached completion row can answer for free (finished, and
  // already fully owned) drops out of the live walk entirely. For a
  // long-running show this is the difference between "clicking into a 2003
  // season costs three PMS calls" and "it costs none."
  const cachedSeasons = new Set<number>();
  let needsLiveWalk = false;
  for (const seasonNumber of seasonNumbers) {
    const tmdbEpisodes = tmdbSeasons.get(seasonNumber);
    if (!tmdbEpisodes) continue;
    if (
      !options?.forceLivePlex &&
      deps.plex !== undefined &&
      canServeFromCompletionCache(
        show,
        seasonNumber,
        tmdbEpisodes,
        todayIsoDate,
      )
    ) {
      cachedSeasons.add(seasonNumber);
    } else {
      needsLiveWalk = true;
    }
  }

  const plexPresence: PlexPresence = needsLiveWalk
    ? await loadPlexPresence(
        show,
        deps.plex,
        targetSeason,
        deps.log,
        deps.requestId,
      )
    : { reachable: false, seasons: new Map() };

  const seasonResults = seasonNumbers.map((seasonNumber) => {
    const tmdbEpisodes = tmdbSeasons.get(seasonNumber);
    if (!tmdbEpisodes) {
      return null;
    }
    const servedFromCache = cachedSeasons.has(seasonNumber);

    const plexSeason = plexPresence.seasons.get(seasonNumber);
    const episodes: EpisodeWithStatus[] = tmdbEpisodes
      .slice()
      .sort((a, b) => a.episode_number - b.episode_number)
      .map((ep) => {
        const grabs = manualGrabsByKey.get(
          episodeKey(seasonNumber, ep.episode_number),
        );
        return {
          episode: ep.episode_number,
          name: ep.name,
          overview: ep.overview,
          airDate: ep.air_date,
          plexStatus: servedFromCache
            ? ('in_library' as const)
            : resolveEpisodeStatus(
                plexPresence.reachable,
                plexSeason,
                ep.episode_number,
              ),
          manualGrabs: grabs ?? [],
        };
      });

    // TMDB's season episode list includes unaired future episodes (a
    // "Returning Series" season lists all planned episodes up front,
    // most with a future air_date) — Plex's leafCount can only ever
    // count episodes that actually exist as files, so comparing it
    // against the *full* TMDB count would flag a mismatch for every
    // currently-airing show, every time. Compare against aired-so-far
    // count instead. Confirmed live against a real currently-airing
    // show (Stuart Fails to Save the Universe): season 1 lists 10
    // TMDB episodes, 4 of them not yet aired.
    //
    // Strictly-before-today, not on-or-before: an episode airing *today*
    // isn't yet something we can call unaccounted for. Indexers lag
    // broadcast by hours and the feed normally catches it on its own, so
    // counting it as "aired and owed" is what produced phantom missing
    // episodes for every currently-airing show, every air day. Mirrors
    // isConfirmedUnaired in web MissingEpisodesPanel.svelte — the two have
    // to agree or the shows list and the show page contradict each other.
    const airedEpisodeCount = episodes.filter(
      (ep) => ep.airDate !== undefined && ep.airDate < todayIsoDate,
    ).length;
    // On an air day, either count is legitimate: the episode may already be
    // in Plex (grabbed fast) or not (feed hasn't caught it). Treating a
    // single exact number as correct would just move the false mismatch
    // from one side of the boundary to the other, so accept the whole
    // window instead.
    const airedIncludingTodayCount = episodes.filter(
      (ep) => ep.airDate !== undefined && ep.airDate <= todayIsoDate,
    ).length;
    const season: SeasonWithStatus = {
      season: seasonNumber,
      episodes,
      // No live Plex read happened for a cached season, so there is no
      // leafCount to compare against — "no data to compare" (undefined),
      // not a fabricated `false`. The cached row's own owned==aired
      // agreement is what licenses the fast path in the first place.
      episodeCountMismatch: servedFromCache
        ? undefined
        : plexSeason === undefined
          ? undefined
          : plexSeason.episodeCount === undefined
            ? true
            : plexSeason.episodeCount < airedEpisodeCount ||
              plexSeason.episodeCount > airedIncludingTodayCount,
      airedEpisodeCount,
      plexSource: servedFromCache ? 'cached-completion' : 'live',
    };
    return season;
  });

  const seasons = seasonResults.filter(
    (s): s is SeasonWithStatus => s !== null,
  );
  // A season answered from the completion cache is confidently answered —
  // reporting plexReachable:false there would make the UI show its "every
  // episode reads unknown" banner over a grid that is, in fact, all
  // in_library.
  return {
    plexReachable: plexPresence.reachable || cachedSeasons.size > 0,
    seasons,
  };
}

/**
 * True when this season's per-episode Plex status can be answered from the
 * cached plex_tv_season_completion row alone, with no live PMS call.
 *
 * Requires all of:
 *  - TMDB considers the season finished (every episode has an air date and
 *    the last one is >14 days past — see isSeasonFinished). A currently-
 *    airing season is never eligible: that's exactly the season whose status
 *    changes week to week, and the one the operator is actually here to check.
 *  - A cached completion row exists saying every aired episode is owned
 *    (ownedCount >= airedCount > 0). A partially-owned season has real
 *    per-episode gaps this shortcut couldn't place, so it goes live.
 *  - The row's airedCount still matches what TMDB now lists as aired. Guards
 *    against a row written when the season had a different episode count —
 *    e.g. TMDB later split or added an episode, which would otherwise get
 *    silently marked owned.
 *  - The row explicitly records that the live walk behind it saw *no*
 *    episode-count mismatch. Serving a mismatched season from cache would
 *    suppress its "count doesn't match TMDB" banner on every later view —
 *    and because ownedCount can hit airedCount while Plex holds extra files,
 *    such a season stays cache-eligible forever, so the banner would never
 *    come back. `undefined` (a row written before this column existed) is
 *    treated as ineligible: unknown is not "no mismatch".
 *  - The row is younger than COMPLETION_CACHE_MAX_AGE_MS, so the season is
 *    periodically re-verified no matter what.
 *
 * The trade-off, accepted deliberately: a file deleted out of band keeps
 * showing a stale in_library badge for this season until the row ages past
 * that window, or "Refresh Plex" (which passes forceLivePlex) rewrites it.
 * Nothing else rewrites it — persistSeasonCompletions is the only writer of
 * this table and it deliberately skips cache-served seasons, so without the
 * age bound a deleted file would stay invisible indefinitely rather than
 * "until the next sweep". A badge briefly optimistic on a finished season
 * nobody is chasing episodes for is cheap next to three PMS round trips on
 * every click into every back-catalogue season of a 38-season show.
 */
const COMPLETION_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function canServeFromCompletionCache(
  show: ShowBreakdown,
  seasonNumber: number,
  tmdbEpisodes: { air_date?: string }[],
  todayIsoDate: string,
): boolean {
  if (tmdbEpisodes.length === 0) return false;
  if (!isSeasonFinished(tmdbEpisodes)) return false;

  const completion = show.seasonCompletions?.find(
    (c) => c.season === seasonNumber,
  );
  if (!completion) return false;
  if (completion.airedCount <= 0) return false;
  if (completion.ownedCount < completion.airedCount) return false;
  if (completion.episodeCountMismatch !== false) return false;

  const cachedAtMs = Date.parse(completion.cachedAt);
  if (Number.isNaN(cachedAtMs)) return false;
  if (Date.now() - cachedAtMs > COMPLETION_CACHE_MAX_AGE_MS) return false;

  const airedNow = tmdbEpisodes.filter(
    (ep) => ep.air_date !== undefined && ep.air_date < todayIsoDate,
  ).length;
  return airedNow === completion.airedCount;
}

/**
 * Which season the show detail page opens on when the caller didn't name one.
 *
 * "Highest season number" is the obvious answer and the wrong one: TMDB lists
 * an announced-but-unaired season (The Simpsons season 38, live 2026-09-03)
 * in numberOfSeasons while publishing zero episodes for it. Defaulting there
 * returned an empty grid, cost a full Plex walk for a season that doesn't
 * exist as files, and left the client to notice and re-fetch the *real*
 * latest season — a guaranteed spinner plus a wasted round trip on every
 * single page view of that show.
 *
 * Steps down until it finds a season with at least one *aired* episode. Not
 * merely "has episodes on record": confirmed live 2026-09-03, TMDB had already
 * published Simpsons season 38 episode 1 with an air date 24 days in the
 * future, so an episodes-exist test lands the operator on a season holding one
 * UNAIRED row and nothing to act on — the same wasted trip back to season 37
 * this function exists to remove, just relocated. "Aired" uses the same
 * strictly-before-today rule as airedEpisodeCount, so an episode airing today
 * doesn't yank the default forward mid-broadcast.
 *
 * TMDB-only and cache-first (loadSeasonEpisodes), so the probe normally costs
 * no network at all, and never touches Plex.
 *
 * Bounded by DEFAULT_SEASON_PROBE_LIMIT rather than walking to season 1: two
 * announced-or-unaired seasons stacked on top of each other is already
 * unusual, and a show whose TMDB data is broken outright shouldn't turn one
 * page view into dozens of probes. On giving up it returns the last season it
 * tried — for a show that simply hasn't aired yet that's the right landing
 * spot anyway (its UNAIRED grid is all there is to show).
 */
const DEFAULT_SEASON_PROBE_LIMIT = 3;

export async function resolveDefaultSeason(
  show: ShowBreakdown,
  tmdb: TvEnrichDeps,
): Promise<number | undefined> {
  const tmdbId = show.tmdb?.tmdbId;
  const numberOfSeasons = show.tmdb?.numberOfSeasons;
  if (!tmdbId || !numberOfSeasons || numberOfSeasons < 1) return undefined;

  const matchKey = tvMatchKey(show.normalizedTitle);
  const todayIsoDate = broadcastTodayIsoDate();
  let season = numberOfSeasons;
  for (
    let probe = 0;
    probe < DEFAULT_SEASON_PROBE_LIMIT && season >= 1;
    probe++
  ) {
    const episodes = await loadSeasonEpisodes(matchKey, tmdbId, season, tmdb);
    const hasAiredEpisode = episodes?.some(
      (ep) => ep.air_date !== undefined && ep.air_date < todayIsoDate,
    );
    if (hasAiredEpisode) return season;
    if (season === 1) break;
    season--;
  }
  return season;
}

type PlexSeasonPresence = {
  episodeCount: number | undefined;
  /** undefined = this season's own episode walk failed; every episode in it
   * reads 'unknown' even though the show overall is reachable. */
  episodeNumbers: Set<number> | undefined;
};

type PlexPresence = {
  reachable: boolean;
  seasons: Map<number, PlexSeasonPresence>;
};

/**
 * Roadmap item 22: item 18's event-loop-lag probe found real multi-second
 * stalls correlated with concurrent /shows/*\/episodes requests, not
 * reconcile — but that's a correlation, not yet a cause (and a fresh 2026-
 * 09-05 sample taken while writing this instrumentation did NOT reproduce
 * that correlation — see roadmap item 22's status note). This is the
 * targeted timing that decides it either way: four phases (ratingKey
 * resolution/matching, the show's own season list, a stale-cache retry
 * search — kept separate from the seasons phase because resolveRatingKey's
 * own doc comment calls /library/search the most expensive of the three PMS
 * calls this module makes, and folding it in would hide that call behind
 * the wrong phase — and the per-season episode walk) each measured with
 * performance.now() (monotonic — same reasoning as event-loop-lag.ts, not
 * repeated here) and logged in one line regardless of which early-return or
 * throw path this call takes, via try/catch/finally. If one phase's ms
 * consistently dominates and lines up with an [event-loop] SEVERE line at
 * the same wall-clock moment, that phase is the next fix's actual target —
 * not a second guess replacing this one.
 */
async function loadPlexPresence(
  show: ShowBreakdown,
  plex: EpisodeStatusDeps['plex'],
  targetSeason?: number,
  log?: (message: string) => void,
  requestId?: string,
): Promise<PlexPresence> {
  const empty: PlexPresence = { reachable: false, seasons: new Map() };
  if (!plex) {
    return empty;
  }

  const walkStartedAt = performance.now();
  let ratingKeyMs = 0;
  let showSeasonsMs = 0;
  // Its own counter, not folded into showSeasonsMs: resolveRatingKey's own
  // doc comment calls /library/search "by far the most expensive of the
  // three PMS calls this module makes" — burying its retry inside the
  // seasons phase would hide the most expensive call in the module behind
  // the one phase this item exists to rule *out* as the matching-work
  // suspect.
  let retrySearchMs = 0;
  let seasonEpisodesMs = 0;
  let outcome:
    | 'unconfirmed'
    | 'not_in_library'
    | 'walk_failed'
    | 'ok'
    | 'threw' = 'unconfirmed';
  let seasonCount = 0;

  try {
    const ratingKeyStartedAt = performance.now();
    const resolved = await resolveRatingKey(show, plex);
    ratingKeyMs = Math.round(performance.now() - ratingKeyStartedAt);
    if (resolved.ratingKey === undefined) {
      // Neither the cache nor a live search could confirm anything right now.
      return empty;
    }
    if (resolved.ratingKey === null) {
      // Confidently not in Plex — confident "missing" territory, not
      // "unknown". reachable:true with an empty seasons map means every
      // episode resolves to 'missing' below.
      outcome = 'not_in_library';
      return { reachable: true, seasons: new Map() };
    }

    const showSeasonsStartedAt = performance.now();
    let allPlexSeasons = await plex.client.getShowSeasons(resolved.ratingKey);
    showSeasonsMs = Math.round(performance.now() - showSeasonsStartedAt);
    // The optimistically-used cached ratingKey didn't pan out — the show may
    // have been removed and re-added in Plex (new ratingKey), or the key may
    // have been reused by an unrelated item after a library rebuild. Pay for
    // the live search we skipped rather than trusting a key we now doubt.
    //
    // Empty counts as "didn't pan out" alongside null, not just null: a key
    // pointing at a live-but-wrong item (a movie, some other entry) answers
    // 200 with zero season children, and treating that as a real answer would
    // report every episode of a fully-owned show as `missing` and invite a
    // full re-grab. `null` alone would miss that case entirely.
    if (
      resolved.fromCache &&
      (allPlexSeasons === null || allPlexSeasons.length === 0)
    ) {
      const retrySearchStartedAt = performance.now();
      const live = await liveSearchRatingKey(show, plex);
      if (live !== undefined && live !== resolved.ratingKey) {
        const retried = await plex.client.getShowSeasons(live);
        // Only take the retry when it actually found something — a show
        // legitimately having zero seasons must not be turned into
        // "unreachable" by a fallback that also came back empty.
        if (retried !== null && retried.length > 0) {
          allPlexSeasons = retried;
        }
      }
      retrySearchMs = Math.round(performance.now() - retrySearchStartedAt);
    }
    if (allPlexSeasons === null) {
      // Have a ratingKey, but the live walk failed just now — transient,
      // not "this show isn't in Plex".
      outcome = 'walk_failed';
      return empty;
    }
    // getShowSeasons is one cheap PMS call returning every season's metadata
    // (no per-episode walk yet) — filtering here only skips the *heavier*
    // per-season getSeasonEpisodes call below, one per season, for whichever
    // seasons the caller didn't ask for.
    const plexSeasons =
      targetSeason === undefined
        ? allPlexSeasons
        : allPlexSeasons.filter((s) => s.seasonNumber === targetSeason);
    seasonCount = plexSeasons.length;

    // Same reasoning as the TMDB season loop above — one PMS round trip per
    // season, independent of the others, so run them concurrently.
    const seasonEpisodesStartedAt = performance.now();
    const entries = await Promise.all(
      plexSeasons.map(async (season) => {
        const episodes = await plex.client.getSeasonEpisodes(season.ratingKey);
        const presence: PlexSeasonPresence = {
          episodeCount: season.episodeCount,
          episodeNumbers:
            episodes === null
              ? undefined
              : new Set(episodes.map((e) => e.episodeNumber)),
        };
        return [season.seasonNumber, presence] as const;
      }),
    );
    seasonEpisodesMs = Math.round(performance.now() - seasonEpisodesStartedAt);
    outcome = 'ok';
    return { reachable: true, seasons: new Map(entries) };
  } catch (error) {
    // Without this, a throw mid-walk leaves outcome at its initial
    // 'unconfirmed' — indistinguishable in the log from "nothing could
    // confirm this show one way or the other," when it's actually "this
    // blew up." Re-thrown unchanged; the caller's own try/catch (see
    // buildShowEpisodeStatus's callers in api.ts) still owns the response.
    outcome = 'threw';
    throw error;
  } finally {
    const totalMs = Math.round(performance.now() - walkStartedAt);
    const tag = requestId ? `[plex-match]:${requestId}` : '[plex-match]';
    log?.(
      `${tag} show=${JSON.stringify(show.normalizedTitle)} outcome=${outcome} ` +
        `seasons=${seasonCount} rating_key_ms=${ratingKeyMs} ` +
        `show_seasons_ms=${showSeasonsMs} retry_search_ms=${retrySearchMs} ` +
        `season_episodes_ms=${seasonEpisodesMs} total_ms=${totalMs}`,
    );
  }
}

/**
 * Resolves this show's Plex ratingKey, preferring a cached *positive* row
 * over a live search.
 *
 * A ratingKey is the most stable thing Plex exposes about a show, and
 * /library/search is by far the most expensive of the three PMS calls this
 * module makes — it's a library-wide query, where getShowSeasons is a keyed
 * lookup. Skipping it whenever the cache already says "in library, key K"
 * takes the common path from three round trips to two. If K turns out to be
 * wrong, the caller falls back to a live search (see loadPlexPresence), so
 * this is a shortcut, not a new source of truth.
 *
 * Only a *positive* cached row short-circuits. A cached "not in library" must
 * still go through live search first, or a show added to Plex since the last
 * background sweep would keep reading missing until the sweep caught up —
 * the exact staleness the previous live-first ordering existed to avoid.
 *
 * A live search miss does NOT by itself mean "confidently not in library" —
 * falls through to cache regardless, since /library/search is documented
 * elsewhere in this codebase (refreshShowLibraryCache) to sometimes omit or
 * reshape hits. Only a *cached* "not in library" is trusted as confident.
 *
 * Returns a ratingKey when found (cached or live); null when confidently not
 * in the library; undefined when nothing could confirm either way.
 * `fromCache` tells the caller whether the key was taken on trust.
 */
async function resolveRatingKey(
  show: ShowBreakdown,
  plex: NonNullable<EpisodeStatusDeps['plex']>,
): Promise<{ ratingKey: string | null | undefined; fromCache: boolean }> {
  const cacheRow = plex.cache.getTv(show.normalizedTitle);
  if (cacheRow?.inLibrary && cacheRow.plexRatingKey) {
    return { ratingKey: cacheRow.plexRatingKey, fromCache: true };
  }

  const live = await liveSearchRatingKey(show, plex);
  if (live !== undefined) {
    return { ratingKey: live, fromCache: false };
  }

  if (!cacheRow) {
    return { ratingKey: undefined, fromCache: false };
  }
  // Reached only for a cached row that is negative or key-less — positive
  // rows short-circuited above.
  return { ratingKey: null, fromCache: false };
}

/** The live /library/search half of resolveRatingKey, split out so
 * loadPlexPresence can re-run it on its own when a cached ratingKey turns
 * out to be stale. undefined when the search found nothing usable. */
async function liveSearchRatingKey(
  show: ShowBreakdown,
  plex: NonNullable<EpisodeStatusDeps['plex']>,
): Promise<string | undefined> {
  const liveResults = await plex.client.searchShows(show.normalizedTitle);
  if (liveResults === null) return undefined;
  const match = selectBestShowMatch(show.normalizedTitle, liveResults);
  return match?.ratingKey ?? undefined;
}

function resolveEpisodeStatus(
  showReachable: boolean,
  season: PlexSeasonPresence | undefined,
  episodeNumber: number,
): EpisodePlexStatus {
  if (!showReachable) {
    return 'unknown';
  }
  if (season === undefined) {
    // Show is confidently not in Plex at all (empty seasons map case), or
    // TMDB has a season Plex has no season entry for at all — either way,
    // confident "missing".
    return 'missing';
  }
  if (season.episodeNumbers === undefined) {
    // This one season's episode walk failed — unknown, not missing.
    return 'unknown';
  }
  return season.episodeNumbers.has(episodeNumber) ? 'in_library' : 'missing';
}

/**
 * One batched Transmission torrent-get for every still-active grab's hash
 * on this page, promoting 'queued' entries to 'stalled' in place. Batched
 * rather
 * than one lookup per episode — a season with several manual grabs must
 * cost one RPC round trip, not N (see grill-me Q1, 2026-09-01: live lookup
 * at render time was chosen over a background poller specifically on the
 * condition it stays batched). Best-effort: any failure (no config, RPC
 * error) just leaves every state at 'queued', same as every other
 * best-effort Transmission read in this codebase — a page render must never
 * hard-fail because Transmission is briefly unreachable.
 *
 * Only 'queued' grabs are candidates. A 'removed' or 'completed' row is
 * already in a terminal state the DB is authoritative about, and its hash
 * may well have been reused by nothing at all — asking Transmission about
 * it would at best waste a lookup and at worst re-open a settled question.
 */
async function annotateStalledGrabs(
  manualGrabsByKey: Map<string, EpisodeManualGrabInfo[]>,
  transmissionConfig: TransmissionConfig | undefined,
): Promise<void> {
  if (!transmissionConfig) return;

  const activeGrabs = Array.from(manualGrabsByKey.values())
    .flat()
    .filter((grab) => grab.state === 'queued');
  const hashes = Array.from(
    new Set(
      activeGrabs
        .map((grab) => grab.transmissionTorrentHash)
        .filter((hash): hash is string => hash !== null),
    ),
  );
  if (hashes.length === 0) return;

  const result = await fetchTorrentStats(transmissionConfig, hashes);
  if (!result.ok) return;

  const byHash = new Map(result.torrents.map((t) => [t.hash, t]));
  for (const grab of activeGrabs) {
    if (!grab.transmissionTorrentHash) continue;
    if (isStalledSnapshot(byHash.get(grab.transmissionTorrentHash))) {
      grab.state = 'stalled';
    }
  }
}

function episodeKey(season: number, episode: number): string {
  return `${season}:${episode}`;
}

/** The DB-only half of a grab's state — everything decidable without asking
 * Transmission anything. 'stalled' can only be reached later, by
 * annotateStalledGrabs, since it depends on a live snapshot. See
 * EpisodeManualGrabState for why doneAt outranks disposition. */
function toGrabState(row: {
  doneAt: string | null;
  disposition: string | null;
}): EpisodeManualGrabState {
  if (row.doneAt !== null) return 'completed';
  if (row.disposition !== null) return 'removed';
  return 'queued';
}

function groupManualGrabsByEpisode(
  rows: ReturnType<ManualGrabsStore['listForShow']>,
): Map<string, EpisodeManualGrabInfo[]> {
  const map = new Map<string, EpisodeManualGrabInfo[]>();
  // rows is already most-recent-first. Every row for an episode is kept —
  // both because a replacement grab must leave the stalled one it replaces
  // visible and removable (grill-me: torrent queue/grab UX fixes, 2026-09-02
  // follow-up), and because disposed rows are the "already tried that
  // release" history the panel needs to stop the operator re-grabbing a
  // known-dead swarm (2026-09-03). Disposition is no longer a filter, it's a
  // `state` — every consumer that means "live torrent" must say so.
  for (const row of rows) {
    const key = episodeKey(row.season, row.episode);
    const grab: EpisodeManualGrabInfo = {
      id: row.id,
      queuedAt: row.queuedAt,
      source: row.source,
      rawTitle: row.rawTitle,
      transmissionTorrentHash: row.transmissionTorrentHash,
      state: toGrabState(row),
      disposed: row.disposition !== null,
      disposedAt: row.disposedAt,
      doneAt: row.doneAt,
    };
    const existing = map.get(key);
    if (existing) {
      existing.push(grab);
    } else {
      map.set(key, [grab]);
    }
  }
  return map;
}
