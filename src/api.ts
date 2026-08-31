import type { Database } from 'bun:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, extname } from 'node:path';
import { getSetupState } from './bootstrap';
import {
  acknowledgeNetworkPosture,
  readAuthState,
  setupOwner,
  trustOrigin,
  verifyLogin,
} from './auth-state';
import { renameSync, writeFileSync } from 'node:fs';
import { loggedFetch, logClientError } from './http-log';
import { getInstallHealth } from './install-health';
import {
  fetchAllTorrentsForAdoption,
  fetchSessionInfo,
  fetchTorrentStats,
  pauseTorrent,
  removeTorrent,
  resumeTorrent,
  resumeTorrentNow,
  setTransmissionQueueSettings,
} from './transmission';
import type { Downloader, TorrentStatSnapshot } from './transmission';
import type {
  AppConfig,
  CompactTvDefaults,
  FeedConfig,
  RuntimeConfig,
} from './config';
import {
  DEFAULT_TRANSMISSION_DOWNLOAD_DIR_MOVIE,
  DEFAULT_TRANSMISSION_DOWNLOAD_DIR_TV,
} from './config';
import { EztvHttpClient } from './eztv/client';
import {
  ThePirateBayHttpClient,
  type ThePirateBaySearchOutcome,
} from './thepiratebay/client';
import { YtsHttpClient } from './yts/client';
import { ManualGrabsStore } from './manual-grabs/store';
import type { ManualGrabSource } from './manual-grabs/store';
import { ManualMovieGrabsStore } from './manual-movie-grabs/store';
import type { ManualMovieGrabSource } from './manual-movie-grabs/store';
import { manualMovieGrabsAsBreakdowns } from './manual-movie-grabs/store';
import { buildShowEpisodeStatus } from './shows/episode-status';
import type { ShowEpisodeStatus } from './shows/episode-status';
import type { PlexCache } from './plex/cache';
import { TrackedShowsStore } from './tracked-shows/store';
import {
  normalizeShowName,
  syncTrackedShowsFromConfig,
} from './tracked-shows/sync';
import { reconcileShowLibrary, walkVideoFiles } from './adoption/reconciler';
import { titlesMatch } from './adoption/title-match';
import {
  installRootMediaMoviesDir,
  installRootMediaShowsDir,
  normalizeInstallRoot,
} from './install-bootstrap';
import {
  discoverMovieDirectories,
  discoverShowDirectories,
} from './adoption/discover-media-dirs';
import { adoptMoviesFromFilesystem } from './adoption/movie-reconciler';
import type { MovieAdoptionCandidate } from './adoption/movie-reconciler';
import {
  adoptMoviesFromPlex,
  matchCachedPlexCatalog,
  PlexMovieCatalogCache,
  recordPlexMatches,
} from './adoption/movie-plex-reconciler';
import { PlexMovieSyncStateStore } from './plex/movie-sync-state';
import {
  extractCodec,
  extractResolution,
  normalizeFeedItem,
} from './normalize';
import {
  ConfigError,
  validateCompactTvDefaults,
  validateConfig,
  validateFeed,
  validateMoviePolicy,
  validateTmdbConfig,
  loadConfigEnv,
} from './config';
import type {
  ManualMovieGrabSourceOrRss,
  MovieBreakdown,
  MovieOwnershipStatus,
  PlexStatus,
} from './movie-api-types';
export type { MovieBreakdown, TmdbMoviePublic } from './movie-api-types';
import type { ShowBreakdown, ShowEpisode, ShowSeason } from './tv-api-types';

export type {
  ShowBreakdown,
  ShowEpisode,
  ShowSeason,
  TmdbTvEpisodeMeta,
  TmdbTvShowMeta,
} from './tv-api-types';
import { isDueFeed } from './poll-state';
import type { PollState } from './poll-state';
import type {
  CandidateStateRecord,
  PirateClawDisposition,
  Repository,
} from './repository';
import type { CycleResult } from './runtime-artifacts';
import type { TmdbCache } from './tmdb/cache';
import { enrichCandidatesFromCache } from './tmdb/candidate-cache-enrich';
import type { CalendarDeps } from './tmdb/calendar';
import { getTvCalendar } from './tmdb/calendar';
import type { MovieCalendarDeps } from './tmdb/movie-calendar';
import { getMovieCalendar } from './tmdb/movie-calendar';
import type { TopMoviesDeps } from './tmdb/top-movies';
import { getTopMovies } from './tmdb/top-movies';
import type { MovieEnrichDeps } from './tmdb/movie-enrichment';
import { enrichMovieBreakdowns } from './tmdb/movie-enrichment';
import type { TvEnrichDeps } from './tmdb/tv-enrichment';
import {
  enrichShowBreakdowns,
  refreshShowBreakdown,
} from './tmdb/tv-enrichment';
import type { PlexMovieEnrichDeps } from './plex/movies';
import { enrichMovieBreakdownsFromPlexCache } from './plex/movies';
import type { PlexShowEnrichDeps } from './plex/shows';
import {
  enrichShowBreakdownsFromPlexCache,
  refreshPlexShowBreakdown,
  refreshShowLibraryCache,
} from './plex/shows';
import { PlexTvSyncStateStore } from './plex/tv-sync-state';
import { PlexAuthStore } from './plex/auth';
import {
  exchangePlexPinForAuthToken,
  PlexRateLimitError,
  startPlexPinAuth,
} from './plex/auth-client';
import { readRestartStatus, recordRestartRequested } from './restart-proof';

export type CycleSnapshot = {
  status: CycleResult['status'];
  startedAt: string;
  completedAt: string;
  durationMs: number;
};

export type HealthState = {
  startedAt: string;
  lastRunCycle: CycleSnapshot | null;
  lastReconcileCycle: CycleSnapshot | null;
};

export function createHealthState(): HealthState {
  return {
    startedAt: new Date().toISOString(),
    lastRunCycle: null,
    lastReconcileCycle: null,
  };
}

export function recordCycleInHealth(
  health: HealthState,
  result: CycleResult,
): void {
  const snapshot: CycleSnapshot = {
    status: result.status,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
  };

  if (result.type === 'run') {
    health.lastRunCycle = snapshot;
  } else if (result.type === 'reconcile') {
    health.lastReconcileCycle = snapshot;
  }
}

export type ApiFetchDeps = {
  database?: Database;
  repository: Repository;
  health: HealthState;
  config: AppConfig;
  /**
   * When set, successful PUT /api/config assigns `current` to the validated config
   * so the daemon process can read the same object as the API (in-process refresh).
   */
  configHolder?: { current: AppConfig };
  configPath: string;
  pollStatePath: string;
  loadPollState: (path: string) => PollState;
  /** When set (TMDB configured), GET /api/movies lazily enriches from cache + TMDB. */
  tmdbMovies?: MovieEnrichDeps;
  /** When set (Plex configured), GET /api/movies merges Plex cache status only. */
  plexMovies?: PlexMovieEnrichDeps;
  /** When set (Plex configured), GET /api/shows merges Plex cache status only. */
  plexShows?: PlexShowEnrichDeps;
  /** When set (TMDB configured), GET /api/shows lazily enriches from cache + TMDB. */
  tmdbShows?: TvEnrichDeps;
  /**
   * When set (TMDB configured), GET /api/candidates attaches TMDB fields from the
   * SQLite cache only — same rows as movies/shows enrichment, no extra HTTP.
   */
  tmdbCache?: TmdbCache;
  /** Optional hook when a cache read throws during candidate enrichment (fail-open). */
  onCandidateTmdbCacheError?: (
    error: unknown,
    candidate: CandidateStateRecord,
  ) => void;
  /** When set, POST /api/candidates/:id/requeue is available. */
  downloader?: Downloader;
  /** When set (TMDB configured), GET /api/calendar/tv is available. */
  calendarTv?: CalendarDeps;
  /** When set (TMDB configured), GET /api/movie-calendar is available. */
  calendarMovie?: MovieCalendarDeps;
  /** When set (TMDB configured), GET /api/movie-calendar/top is available. */
  topMovies?: TopMoviesDeps;
  /**
   * The tracked-show ledger (see src/tracked-shows/). When set, /api/shows
   * and friends include every tracked show even with zero candidate_state
   * rows, PUT /api/config keeps the ledger in sync with the watchlist, and
   * DELETE /api/shows/:slug (untrack) and the library reconciler become
   * available. Optional so existing tests/deps that don't care about this
   * feature aren't forced to construct one.
   */
  trackedShows?: TrackedShowsStore;
};

function json500(): Response {
  return Response.json({ error: 'internal server error' }, { status: 500 });
}

/** Says honestly which of the two things happened: we gave up at our own
 * deadline (apibay may well still be fine, just slow) vs. apibay itself
 * broke the request (bad status, unparseable body, network failure).
 * "Lookup failed; try again" for both was misleading — a timeout getting
 * called a "failure" reads as apibay being down when it might just be
 * slow. */
function thePirateBayErrorMessage(
  reason: Extract<ThePirateBaySearchOutcome, { ok: false }>['reason'],
): string {
  return reason === 'timeout'
    ? "The Pirate Bay didn't respond in time; try again"
    : 'The Pirate Bay lookup failed; try again';
}

function jsonConfigWriteFailure(): Response {
  return Response.json(
    {
      error:
        'config file is not writable; check deployment mount permissions and restart the daemon after fixing them',
    },
    { status: 500 },
  );
}

function jsonMethodNotAllowed(allow: string): Response {
  return Response.json(
    { error: 'method not allowed' },
    { status: 405, headers: { Allow: allow } },
  );
}

/** Repository default is 20; HTTP dashboards need a full slice for joins and torrent polling. */
const API_CANDIDATE_LIST_LIMIT = 50_000;

/** Caps how long the "Plex TV Sync" POST handler waits on runFullTvPlexSync
 * before responding — unlike the movie sync (one catalog fetch, then pure
 * in-memory matching), a TV sync does one live Plex round trip per tracked
 * show (see refreshShowLibraryCache), so on a library with many tracked
 * shows — or, worse, exactly the kind of Plex slowness this feature exists
 * to help recover from — the total wall-clock time is unbounded. That's the
 * same "~19s synchronous Plex walk trips Bun's idle-connection timeout"
 * failure mode documented near runFullMoviePlexSyncUncached above, just
 * reachable here via N sequential requests instead of one big one. Staying
 * comfortably under that lets the common case (Plex healthy) still return
 * real counts synchronously, while a slow/unhealthy Plex degrades to "still
 * running" instead of hanging the connection — the sync keeps running
 * either way (fullTvSyncInFlight holds the promise), it just isn't awaited
 * past this deadline. */
const TV_SYNC_RESPONSE_DEADLINE_MS = 15_000;

/** How long a show's library-reconciliation result is trusted before the
 * next episode-grid view re-runs it (see reconcileShowIfStale). */
const RECONCILE_STALE_AFTER_MS = 10 * 60 * 1000;

type ManagedTorrentRowState =
  | 'missing'
  | 'downloading'
  | 'seeding'
  | 'queued'
  | 'paused'
  | 'completed';

const MIN_SUPPORTED_PLEX_VERSION = '1.43.0';
const PLEX_VERSION_PROBE_TIMEOUT_MS = 2_500;

function managedTorrentRowState(
  torrent: TorrentStatSnapshot | undefined,
): ManagedTorrentRowState {
  if (!torrent) return 'missing';
  if (torrent.status === 'seeding') return 'seeding';
  if (torrent.percentDone >= 1) return 'completed';
  if (torrent.status === 'downloading') return 'downloading';
  if (torrent.status === 'queued') return 'queued';
  return 'paused';
}

async function fetchPlexServerVersion(
  plexUrl: string,
  token: string,
): Promise<string | null> {
  let response: Response;
  try {
    response = await loggedFetch(
      new URL('/identity', plexUrl).toString(),
      {
        headers: {
          Accept: 'application/xml',
        },
        signal: AbortSignal.timeout(PLEX_VERSION_PROBE_TIMEOUT_MS),
      },
      { source: 'plex', label: 'identity-probe' },
    );
  } catch {
    return null;
  }

  if (!response.ok) {
    // Some PMS deployments gate /identity unexpectedly; fall back to a root
    // probe with the token for compatibility.
    try {
      response = await loggedFetch(
        new URL('/', plexUrl).toString(),
        {
          headers: {
            Accept: 'application/xml',
            'X-Plex-Token': token,
          },
          signal: AbortSignal.timeout(PLEX_VERSION_PROBE_TIMEOUT_MS),
        },
        { source: 'plex', label: 'root-probe' },
      );
    } catch {
      return null;
    }
    if (!response.ok) {
      return null;
    }
  }

  const body = await response.text();
  const match = body.match(/<MediaContainer[^>]*\bversion="([^"]+)"/i);
  return match?.[1]?.trim() || null;
}

function isVersionAtLeast(version: string, minimum: string): boolean {
  const current = parseSemverPrefix(version);
  const baseline = parseSemverPrefix(minimum);
  if (!current || !baseline) {
    return false;
  }

  const length = Math.max(current.length, baseline.length);
  for (let i = 0; i < length; i += 1) {
    const left = current[i] ?? 0;
    const right = baseline[i] ?? 0;
    if (left > right) return true;
    if (left < right) return false;
  }
  return true;
}

function parseSemverPrefix(version: string): number[] | null {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

async function parseJsonTorrentHash(
  request: Request,
): Promise<{ ok: true; hash: string } | { ok: false; response: Response }> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return {
      ok: false,
      response: Response.json(
        { error: 'request body must be valid JSON' },
        { status: 400 },
      ),
    };
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as { hash?: unknown }).hash !== 'string'
  ) {
    return {
      ok: false,
      response: Response.json({ error: 'hash is required' }, { status: 400 }),
    };
  }
  const hash = (parsed as { hash: string }).hash.trim();
  if (!hash) {
    return {
      ok: false,
      response: Response.json({ error: 'hash is required' }, { status: 400 }),
    };
  }
  return { ok: true, hash };
}

/**
 * Resolves a Transmission hash to a manageable torrent context for
 * pause/resume/remove/remove-and-delete/dispose. Tries candidate_state first
 * (the RSS-pipeline case, which also carries an identityKey the caller can
 * set a pirateClawDisposition on); if that's not this hash's origin, falls
 * back to manual_grabs/manual_movie_grabs (see manual-grabs/schema.ts) — a
 * hash that only exists there is still a real, manageable Transmission
 * torrent, it just has its own disposition column to update instead of
 * candidate_state's (see ManualGrabsStore.setDisposition). Either origin
 * rejects a hash already in a terminal disposition (removed/deleted).
 */
async function resolveManagedTorrentAction(
  repository: Repository,
  transmissionConfig: AppConfig['transmission'],
  hash: string,
  manualGrabs: ManualGrabsStore | undefined,
  manualMovieGrabs?: ManualMovieGrabsStore,
): Promise<
  | {
      ok: true;
      candidate: CandidateStateRecord | null;
      rowState: ManagedTorrentRowState;
    }
  | { ok: false; response: Response }
> {
  const candidate = repository.getCandidateStateByTransmissionHash(hash);
  if (candidate?.transmissionTorrentHash) {
    if (
      candidate.pirateClawDisposition === 'removed' ||
      candidate.pirateClawDisposition === 'deleted'
    ) {
      return {
        ok: false,
        response: Response.json(
          { error: 'candidate is already in a terminal disposition' },
          { status: 400 },
        ),
      };
    }

    const statsResult = await fetchTorrentStats(transmissionConfig, [
      candidate.transmissionTorrentHash,
    ]);
    if (!statsResult.ok) {
      return {
        ok: false,
        response: Response.json(
          { error: statsResult.message },
          { status: 502 },
        ),
      };
    }
    const torrent = statsResult.torrents.find(
      (t) => t.hash === candidate.transmissionTorrentHash,
    );
    return { ok: true, candidate, rowState: managedTorrentRowState(torrent) };
  }

  const manualGrabKnown =
    manualGrabs?.hasTorrentHash(hash) || manualMovieGrabs?.hasTorrentHash(hash);
  if (manualGrabKnown) {
    const manualGrabActive =
      manualGrabs?.hasActiveTorrentHash(hash) ||
      manualMovieGrabs?.hasActiveTorrentHash(hash);
    if (!manualGrabActive) {
      return {
        ok: false,
        response: Response.json(
          { error: 'candidate is already in a terminal disposition' },
          { status: 400 },
        ),
      };
    }

    const statsResult = await fetchTorrentStats(transmissionConfig, [hash]);
    if (!statsResult.ok) {
      return {
        ok: false,
        response: Response.json(
          { error: statsResult.message },
          { status: 502 },
        ),
      };
    }
    const torrent = statsResult.torrents.find((t) => t.hash === hash);
    return {
      ok: true,
      candidate: null,
      rowState: managedTorrentRowState(torrent),
    };
  }

  return {
    ok: false,
    response: Response.json(
      { error: 'no candidate matches this torrent hash' },
      { status: 404 },
    ),
  };
}

async function parseJsonDisposeBody(
  request: Request,
): Promise<
  | { ok: true; hash: string; disposition: PirateClawDisposition }
  | { ok: false; response: Response }
> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return {
      ok: false,
      response: Response.json(
        { error: 'request body must be valid JSON' },
        { status: 400 },
      ),
    };
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as { hash?: unknown }).hash !== 'string' ||
    typeof (parsed as { disposition?: unknown }).disposition !== 'string'
  ) {
    return {
      ok: false,
      response: Response.json(
        { error: 'hash and disposition are required' },
        { status: 400 },
      ),
    };
  }
  const dispositionRaw = (parsed as { disposition: string }).disposition;
  if (dispositionRaw !== 'removed' && dispositionRaw !== 'deleted') {
    return {
      ok: false,
      response: Response.json(
        { error: 'invalid disposition' },
        { status: 400 },
      ),
    };
  }
  const hash = (parsed as { hash: string }).hash.trim();
  if (!hash) {
    return {
      ok: false,
      response: Response.json({ error: 'hash is required' }, { status: 400 }),
    };
  }
  return {
    ok: true,
    hash,
    disposition: dispositionRaw as PirateClawDisposition,
  };
}

function safeJson<T>(body: () => T): Response {
  try {
    return Response.json(body());
  } catch {
    return json500();
  }
}

export function createApiFetch(
  deps?: ApiFetchDeps,
): (request: Request) => Response | Promise<Response> {
  if (!deps) {
    return () => Response.json({ error: 'not found' }, { status: 404 });
  }

  const {
    database,
    repository,
    health,
    config,
    configHolder,
    configPath,
    pollStatePath,
    loadPollState,
    tmdbMovies,
    plexMovies,
    plexShows,
    tmdbShows,
    tmdbCache,
    onCandidateTmdbCacheError,
    downloader,
    calendarTv,
    calendarMovie,
    topMovies,
    trackedShows,
  } = deps;
  let activeConfig = configHolder?.current ?? config;

  /** Shared by /api/shows/:slug/episodes, /eztv, and /manual-grab — same
   * lookup showRefreshMatch already does (candidates -> breakdowns -> Plex
   * cache merge -> TMDB enrich), so all three see the same show shape. */
  async function findEnrichedShowBySlug(
    slug: string,
  ): Promise<ShowBreakdown | null> {
    const candidates = repository.listCandidateStates(API_CANDIDATE_LIST_LIMIT);
    const base = buildShowBreakdowns(candidates, trackedNormalizedTitles());
    const withPlex = plexShows
      ? enrichShowBreakdownsFromPlexCache(base, plexShows)
      : base;
    const withTmdb = tmdbShows
      ? await enrichShowBreakdowns(withPlex, tmdbShows)
      : withPlex;
    return (
      withTmdb.find(
        (entry) => entry.normalizedTitle.toLowerCase() === slug.toLowerCase(),
      ) ?? null
    );
  }

  function trackedNormalizedTitles(): string[] | undefined {
    return trackedShows?.list().map((show) => show.normalizedTitle);
  }

  /** TMDB ids for every movie already owned (RSS-feeder-grabbed and
   * confirmed by candidate_state) or manually/adopted-grabbed via the movie
   * calendar — backs CalendarMovieItem.alreadyGrabbed and
   * TopMovieItem.alreadyGrabbed. Reuses the exact same
   * candidates -> buildMovieBreakdowns -> enrichMovieBreakdowns pipeline
   * /api/movies already runs, so this costs nothing beyond what that
   * endpoint already pays (TMDB enrichment is cache-first — see
   * tmdb/movie-enrichment.ts).
   *
   * candidate_state and manual_movie_grabs are both insert-only ledgers —
   * neither one is ever corrected when the file is later deleted, whether
   * via Plex, the media directory, or Transmission (see
   * notes/public/movie-calendar-scope.md). Plex's own cache (plexStatus) is
   * the one signal here that actually reflects deletions, so when it has a
   * confirmed answer it overrides the ledger in both directions: a
   * confirmed 'missing' drops a movie out of the owned set even though the
   * ledger says grabbed; a confirmed 'in_library' keeps it in even if the
   * ledger disagrees. When Plex hasn't checked yet ('unknown' — a fresh
   * grab the background refresh hasn't reached), the ledger's own answer is
   * trusted at face value — that's the "ahead of Plex sync" grace period.
   *
   * Returns MovieOwnershipStatus per tmdbId, not a flat boolean — "grabbed"
   * (pirate-claw's ledger has a record) and "in Plex" (the golden truth)
   * are two different signals that the UI shows honestly as two different
   * things (see movie-api-types.ts's doc comment on MovieOwnershipStatus).
   * `grabbed` itself still gets the same Plex-override treatment described
   * above — a confirmed 'missing' still clears it, same as before this
   * became a richer return type — grabSource/plexStatus are purely
   * additive display detail on top of that unchanged gating logic. */
  async function ownedMovieStatuses(): Promise<
    Map<number, MovieOwnershipStatus>
  > {
    const manualMovieGrabs = database
      ? new ManualMovieGrabsStore(database)
      : undefined;
    const grabSourceByTmdbId = new Map<number, ManualMovieGrabSourceOrRss>(
      manualMovieGrabs?.listLatestSourceByTmdbId() ?? [],
    );
    // Seeded from grabSourceByTmdbId's own keys rather than a second
    // listGrabbedTmdbIds() query — that method's result was already a
    // strict subset of this one's keys, so it was just a redundant scan.
    const owned = new Set(grabSourceByTmdbId.keys());

    const candidates = repository.listCandidateStates(API_CANDIDATE_LIST_LIMIT);
    const base = buildMovieBreakdowns(candidates);
    const candidateBreakdowns = tmdbMovies
      ? await enrichMovieBreakdowns(base, tmdbMovies)
      : [];
    for (const movie of candidateBreakdowns) {
      const tmdbId = movie.tmdb?.tmdbId;
      // candidate_state's status is one of 'queued' | 'failed' |
      // 'dismissed' | 'skipped_duplicate' (see repository.ts's
      // CandidateStatus) — only 'queued' means the RSS pipeline actually
      // sent this to Transmission. buildMovieBreakdowns/enrichMovieBreakdowns
      // don't filter by outcome (only by pirateClawDisposition), so without
      // this check a movie the pipeline *rejected* — but still
      // title-matched to a TMDB id — would count as owned and get labeled
      // "Queued via RSS feed", a false and more specific claim than the
      // flat "Already grabbed" chip this whole feature replaced.
      if (!tmdbId || movie.status !== 'queued') continue;
      owned.add(tmdbId);
      // A manual/adopted grab is more specific than "came in via the RSS
      // pipeline" when a movie somehow has both — don't overwrite it.
      if (!grabSourceByTmdbId.has(tmdbId))
        grabSourceByTmdbId.set(tmdbId, 'rss');
    }

    const plexStatusByTmdbId = new Map<number, PlexStatus>();

    if (plexMovies) {
      const manualBreakdowns = manualMovieGrabs
        ? manualMovieGrabsAsBreakdowns(manualMovieGrabs)
        : [];
      const withPlex = enrichMovieBreakdownsFromPlexCache(
        [...candidateBreakdowns, ...manualBreakdowns],
        plexMovies,
      );

      // A movie can appear in both breakdown lists (RSS-grabbed, then also
      // manually re-grabbed) with two DIFFERENT Plex cache keys — the
      // candidate one's RSS-derived normalizedTitle vs. the manual one's
      // TMDB-title-derived normalizedTitle — so their plexStatus can
      // disagree. Naively applying each in array order let whichever came
      // last silently win, which could downgrade a Plex-confirmed-owned
      // movie to missing just because its *other* lookup key hadn't been
      // checked yet. Aggregate every status seen for a tmdbId instead: any
      // 'in_library' wins outright (Plex found it somewhere); 'missing'
      // only overrides the ledger when EVERY lookup for that id came back
      // missing (none still 'unknown') — a lone unresolved 'unknown' keeps
      // the ledger's own answer, the same grace period as the
      // single-lookup case.
      const statusesByTmdbId = new Map<number, Set<PlexStatus>>();
      for (const movie of withPlex) {
        const tmdbId = movie.tmdb?.tmdbId;
        if (!tmdbId) continue;
        const statuses = statusesByTmdbId.get(tmdbId) ?? new Set();
        statuses.add(movie.plexStatus);
        statusesByTmdbId.set(tmdbId, statuses);
      }
      for (const [tmdbId, statuses] of statusesByTmdbId) {
        if (statuses.has('in_library')) {
          owned.add(tmdbId);
          plexStatusByTmdbId.set(tmdbId, 'in_library');
        } else if (statuses.has('missing') && !statuses.has('unknown')) {
          owned.delete(tmdbId);
          plexStatusByTmdbId.set(tmdbId, 'missing');
        }
        // Mixed/unresolved (some 'unknown'): leave plexStatusByTmdbId unset
        // for this id — resolves to 'unknown' below — and leave `owned`'s
        // membership exactly as the ledger already had it.
      }
    }

    const allTmdbIds = new Set([
      ...owned,
      ...grabSourceByTmdbId.keys(),
      ...plexStatusByTmdbId.keys(),
    ]);
    const result = new Map<number, MovieOwnershipStatus>();
    for (const tmdbId of allTmdbIds) {
      const grabbed = owned.has(tmdbId);
      result.set(tmdbId, {
        grabbed,
        // Only ever non-null when grabbed — a Plex-confirmed 'missing'
        // clears `owned` above (via owned.delete) but the ledger's source
        // stays recorded in grabSourceByTmdbId regardless, so without this
        // guard a movie Plex has confirmed missing would still report the
        // stale grab source, contradicting MovieOwnershipStatus's own
        // documented invariant.
        grabSource: grabbed ? (grabSourceByTmdbId.get(tmdbId) ?? null) : null,
        plexStatus: plexStatusByTmdbId.get(tmdbId) ?? 'unknown',
      });
    }
    return result;
  }

  // Discovering extra tv/shows directories walks the whole install root —
  // cheap once, wasteful on every single show's reconciliation. A personal
  // NAS's directory layout doesn't change often enough to justify re-walking
  // it more than once per process lifetime; a daemon restart re-discovers.
  let cachedMediaShowsDirs: string[] | undefined;

  async function resolveMediaShowsDirs(): Promise<string[]> {
    if (cachedMediaShowsDirs) return cachedMediaShowsDirs;

    const installRoot = activeConfig.runtime.installRoot;
    const primary = installRootMediaShowsDir(installRoot);
    const normalizedRoot = normalizeInstallRoot(installRoot);
    let discovered: string[] = [];
    if (normalizedRoot) {
      try {
        discovered = await discoverShowDirectories(normalizedRoot);
      } catch {
        // Best-effort — a failed discovery pass still leaves the primary
        // media/shows path usable below.
      }
    }
    cachedMediaShowsDirs = Array.from(
      new Set([primary, ...discovered].filter((dir): dir is string => !!dir)),
    );
    return cachedMediaShowsDirs;
  }

  // Movie sibling of cachedMediaShowsDirs/resolveMediaShowsDirs above —
  // same once-per-process-lifetime rationale.
  let cachedMediaMoviesDirs: string[] | undefined;

  async function resolveMediaMoviesDirs(): Promise<string[]> {
    if (cachedMediaMoviesDirs) return cachedMediaMoviesDirs;

    const installRoot = activeConfig.runtime.installRoot;
    const primary = installRootMediaMoviesDir(installRoot);
    const normalizedRoot = normalizeInstallRoot(installRoot);
    let discovered: string[] = [];
    if (normalizedRoot) {
      try {
        discovered = await discoverMovieDirectories(normalizedRoot);
      } catch {
        // Best-effort — a failed discovery pass still leaves the primary
        // media/movies path usable below.
      }
    }
    cachedMediaMoviesDirs = Array.from(
      new Set([primary, ...discovered].filter((dir): dir is string => !!dir)),
    );
    return cachedMediaMoviesDirs;
  }

  /**
   * "Missing from Transmission" Auto-resolve — see TorrentManagerCard's Auto
   * button. Best-effort, conservative-by-design: a torrent whose media file
   * IS found under the install root's media dirs really did land, so it's
   * safe to mark 'removed' automatically (the torrent finished and was
   * dropped from Transmission — nothing left to resolve). A torrent whose
   * file is NOT found is left untouched — file-not-found never implies
   * "deleted", since a file can be genuinely absent for reasons that don't
   * mean that (the walk itself failing, a media dir not yet configured, a
   * still-incomplete download that was force-removed before the file ever
   * landed). Auto only ever writes 'removed', never 'deleted' — an operator
   * still has to make that call by hand.
   */
  async function autoReconcileMissingTorrents(): Promise<Response> {
    const manualGrabs = database ? new ManualGrabsStore(database) : undefined;
    const manualMovieGrabs = database
      ? new ManualMovieGrabsStore(database)
      : undefined;

    const liveResult = await fetchAllTorrentsForAdoption(
      activeConfig.transmission,
    );
    if (!liveResult.ok) {
      return Response.json({ error: liveResult.message }, { status: 502 });
    }
    const liveHashes = new Set(liveResult.torrents.map((t) => t.hash));

    type ReconcileTarget = {
      hash: string;
      mediaType: 'tv' | 'movie';
      normalizedTitle: string;
      season?: number;
      episode?: number;
      year?: number;
      /** Present only for a candidate_state-backed torrent — its
       * disposition lives on candidate_state, keyed by identityKey rather
       * than hash (see repository.setPirateClawDisposition). */
      identityKey?: string;
    };

    const targets: ReconcileTarget[] = [];

    for (const c of repository.listCandidateStates(API_CANDIDATE_LIST_LIMIT)) {
      if (!c.transmissionTorrentHash) continue;
      if (c.pirateClawDisposition) continue;
      if (liveHashes.has(c.transmissionTorrentHash)) continue;
      if (
        c.mediaType === 'tv' &&
        c.season !== undefined &&
        c.episode !== undefined
      ) {
        targets.push({
          hash: c.transmissionTorrentHash,
          mediaType: 'tv',
          normalizedTitle: c.normalizedTitle,
          season: c.season,
          episode: c.episode,
          identityKey: c.identityKey,
        });
      } else if (c.mediaType === 'movie' && c.year !== undefined) {
        targets.push({
          hash: c.transmissionTorrentHash,
          mediaType: 'movie',
          normalizedTitle: c.normalizedTitle,
          year: c.year,
          identityKey: c.identityKey,
        });
      }
    }

    if (manualGrabs) {
      for (const [hash, info] of manualGrabs.listAllTorrentDisplayInfo()) {
        if (info.disposition) continue;
        if (liveHashes.has(hash)) continue;
        targets.push({
          hash,
          mediaType: 'tv',
          normalizedTitle: info.normalizedTitle,
          season: info.season,
          episode: info.episode,
        });
      }
    }

    if (manualMovieGrabs) {
      for (const [hash, info] of manualMovieGrabs.listAllForReconciliation()) {
        if (info.disposition) continue;
        if (liveHashes.has(hash)) continue;
        if (info.movieYear == null) continue;
        targets.push({
          hash,
          mediaType: 'movie',
          normalizedTitle: info.title,
          year: info.movieYear,
        });
      }
    }

    if (targets.length === 0) {
      return Response.json({ resolved: [], checked: 0 });
    }

    const resolvedHashes = new Set<string>();

    const tvTargets = targets.filter((t) => t.mediaType === 'tv');
    if (tvTargets.length > 0) {
      const mediaShowsDirs = await resolveMediaShowsDirs();
      let filePaths: string[] = [];
      try {
        const walked = await Promise.all(
          mediaShowsDirs.map((dir) => walkVideoFiles(dir)),
        );
        filePaths = walked.flat();
      } catch {
        // Best-effort — see the doc comment above.
      }
      for (const filePath of filePaths) {
        if (resolvedHashes.size === tvTargets.length) break;
        const rawTitle = basename(filePath, extname(filePath));
        const parsed = normalizeFeedItem({ mediaType: 'tv', rawTitle });
        if (parsed.season === undefined || parsed.episode === undefined)
          continue;
        const match = tvTargets.find(
          (t) =>
            !resolvedHashes.has(t.hash) &&
            t.season === parsed.season &&
            t.episode === parsed.episode &&
            titlesMatch(parsed.normalizedTitle, t.normalizedTitle),
        );
        if (match) resolvedHashes.add(match.hash);
      }
    }

    const movieTargets = targets.filter((t) => t.mediaType === 'movie');
    if (movieTargets.length > 0) {
      const mediaMoviesDirs = await resolveMediaMoviesDirs();
      let filePaths: string[] = [];
      try {
        const walked = await Promise.all(
          mediaMoviesDirs.map((dir) => walkVideoFiles(dir)),
        );
        filePaths = walked.flat();
      } catch {
        // Best-effort — see the doc comment above.
      }
      let movieMatchCount = 0;
      for (const filePath of filePaths) {
        if (movieMatchCount === movieTargets.length) break;
        const rawTitle = basename(filePath, extname(filePath));
        const parsed = normalizeFeedItem({ mediaType: 'movie', rawTitle });
        if (parsed.year === undefined) continue;
        const match = movieTargets.find(
          (t) =>
            !resolvedHashes.has(t.hash) &&
            t.year === parsed.year &&
            titlesMatch(parsed.normalizedTitle, t.normalizedTitle),
        );
        if (match) {
          resolvedHashes.add(match.hash);
          movieMatchCount += 1;
        }
      }
    }

    for (const hash of resolvedHashes) {
      const target = targets.find((t) => t.hash === hash)!;
      if (target.identityKey) {
        repository.setPirateClawDisposition(target.identityKey, 'removed');
      } else {
        manualGrabs?.setDisposition(hash, 'removed');
        manualMovieGrabs?.setDisposition(hash, 'removed');
      }
    }

    return Response.json({
      resolved: Array.from(resolvedHashes),
      checked: targets.length,
    });
  }

  // Unlike reconcileShowIfStale's per-show gate, movies have no single
  // tracked entity to key a staleness check off of — every request for the
  // Movie Calendar / Top Movies pages would otherwise trigger its own fresh
  // filesystem walk, so it throttles itself to once per
  // RECONCILE_STALE_AFTER_MS, keyed by year (not one shared timer): years
  // are otherwise-independent candidate sets, so a single process-wide
  // timestamp let any recent movie-calendar activity (the Calendar tab's
  // routine background load, another year's Top Movies view, a rescan)
  // silently starve every other year's sweep for a full 10 minutes.
  // Confirmed live 2026-08-29.
  //
  // The Plex-guid sweep is NOT here — see runFullMoviePlexSync below.
  // Walking Plex's whole catalog (~7000 movies on a real library) took
  // ~19s live and tripped Bun's idle-connection timeout when it ran
  // automatically per-view; moved to a deliberate, occasional Config
  // action instead, per user feedback 2026-08-29 ("pay the price once").
  // Keyed by an explicit throttle key, not bluntly by year: Top Movies of
  // Year passes just the year (one request genuinely covers that whole
  // year's ~100 movies, so year-keying is exactly right there), but
  // Calendar is month-paginated and sends the SAME year on every month's
  // page request within it — keying this by year alone meant only the
  // FIRST month page viewed within any 10-minute window ever got swept;
  // every other month's movies (a completely different ~20 items) were
  // silently skipped even though they'd never been checked. Calendar
  // passes `${year}:${offset}` instead, so each distinct page of movies
  // gets its own throttle slot. Found via user feedback 2026-08-30.
  const lastFilesystemAdoptionSweepAtByKey = new Map<string, number>();
  // Persisted (when database is set) so the cached Plex catalog survives a
  // daemon restart — see PlexMovieCatalogCache's own doc comment for why
  // this cache has no TTL and is never auto-refreshed.
  const plexMovieCatalogCache = new PlexMovieCatalogCache(database);

  // Was previously wired to nothing (adoptMoviesFromFilesystem/
  // adoptMoviesFromPlex both default `log` to a silent no-op when the
  // caller omits it), so every run of these sweeps — including failures —
  // was completely invisible in the daemon logs. Same console.log([prefix])
  // convention already used elsewhere in this file for paths with no
  // dedicated log dep (see e.g. the [plex-auth] lines).
  const adoptionLog = (message: string) =>
    console.log(`[movie-adoption] ${message}`);

  /** Runs the filesystem adoption sweep (adoptMoviesFromFilesystem) against
   * whatever movie list is currently being returned (Top Movies of Year /
   * Movie Calendar), then patches alreadyGrabbed for anything found —
   * best-effort, mirrors reconcileShowIfStale's "never break the page that
   * triggered it" rule. Movies have no single-item page to trigger
   * reconciliation from like TV shows do, so this runs inline against the
   * current response instead of being gated by a per-item staleness check
   * — see lastFilesystemAdoptionSweepAtByKey above for the throttle that
   * keeps this affordable.
   *
   * Takes explicit accessors rather than a fixed item shape because
   * CalendarMovieItem and TopMovieItem don't share one (TopMovieItem's
   * tmdbId can be null; CalendarMovieItem has no imdbId at all). */
  async function adoptMoviesForCurrentView<T>(
    throttleKey: string,
    items: T[],
    toCandidate: (item: T) => MovieAdoptionCandidate | null,
    withOwnership: (item: T, status: MovieOwnershipStatus) => T,
    options: { force?: boolean } = {},
  ): Promise<T[]> {
    if (!database) return items;

    // force: true skips the throttle entirely — used by Top Movies of
    // Year's explicit sweep=true request, which by construction only ever
    // runs once per fresh scrape, so it needs no rate-limiting of its own.
    // The Calendar tab's automatic per-view call never sets this, keeping
    // its existing throttled behavior.
    const filesystemThrottleElapsed =
      Date.now() - (lastFilesystemAdoptionSweepAtByKey.get(throttleKey) ?? 0) >=
      RECONCILE_STALE_AFTER_MS;
    if (!options.force && !filesystemThrottleElapsed) {
      adoptionLog(
        `key=${throttleKey}: filesystem sweep skipped, within its ${RECONCILE_STALE_AFTER_MS / 60_000}m cooldown`,
      );
      return items;
    }

    try {
      const manualMovieGrabs = new ManualMovieGrabsStore(database);
      const candidates = items
        .map(toCandidate)
        .filter((c): c is MovieAdoptionCandidate => c !== null);

      lastFilesystemAdoptionSweepAtByKey.set(throttleKey, Date.now());
      const fsAdopted = await adoptMoviesFromFilesystem(candidates, {
        mediaMoviesDirs: await resolveMediaMoviesDirs(),
        manualMovieGrabs,
        log: adoptionLog,
      });
      adoptionLog(
        `key=${throttleKey} filesystem sweep: ${candidates.length} candidate(s), ${fsAdopted.size} adopted`,
      );
      if (fsAdopted.size === 0) return items;

      return items.map((item) => {
        const candidate = toCandidate(item);
        // A filesystem match only proves a file exists on disk, not that
        // Plex has scanned it yet, so plexStatus stays 'unknown' — the
        // full Plex sync (or the background refresh) resolves that later.
        return candidate && fsAdopted.has(candidate.tmdbId)
          ? withOwnership(item, {
              grabbed: true,
              grabSource: 'adopted-filesystem',
              plexStatus: 'unknown',
            })
          : item;
      });
    } catch (error) {
      // Best-effort — see doc comment above — but still logged, not
      // silently swallowed, for the same reason as adoptionLog's own
      // comment above.
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[movie-adoption] filesystem sweep failed: ${message}`);
      return items;
    }
  }

  /** Checks whatever's currently being returned against the CACHED Plex
   * catalog only (matchCachedPlexCatalog — never fetches from Plex itself;
   * see PlexMovieCatalogCache's doc comment). Runs inline, synchronously,
   * as part of the normal fast response on every view — no throttle, no
   * separate follow-up call needed, because a cache hit is a plain
   * in-memory Map lookup with no network I/O at all. An empty/never-synced
   * cache (nothing manually synced yet, bootstrap hasn't landed) just
   * means this is a no-op, same as if it were never called.
   *
   * Matches EVERY item, not just ones with no prior grab — a movie grabbed
   * via YTS/RSS/filesystem that Plex now also has should show "in
   * library", not keep a stale "Queued via X" label forever (found via
   * live QA 2026-08-30). Its existing grab source is preserved via
   * `getGrabSource` rather than overwritten to 'adopted-plex' — that label
   * is reserved for movies that had NO grab record until Plex found them.
   * Only those genuinely new matches ever get written to
   * manual_movie_grabs; an already-grabbed movie Plex now confirms is
   * purely a display update, no ledger write needed.
   *
   * `canWrite` gates ONLY the persistence (recordPlexMatches) of NEW
   * adoptions, not the match itself — an unauthenticated/no-write-token
   * viewer still sees accurate live-matched status in their response
   * (that's just information, not a mutation), but the actual
   * manual_movie_grabs INSERT only happens for a write-authorized caller.
   * Without this split, this function — reachable on every single page
   * view of both routes, with no auth check anywhere on that path — would
   * silently write to the ledger for anonymous requests, unlike every
   * other mutating action in this file. Found in code review before this
   * ever shipped. */
  function applyCachedPlexStatus<T>(
    items: T[],
    toCandidate: (item: T) => MovieAdoptionCandidate | null,
    getGrabSource: (item: T) => ManualMovieGrabSourceOrRss | null,
    withOwnership: (item: T, status: MovieOwnershipStatus) => T,
    canWrite: boolean,
  ): T[] {
    if (!database) return items;
    try {
      const candidates = items
        .map(toCandidate)
        .filter((c): c is MovieAdoptionCandidate => c !== null);
      const allMatches = matchCachedPlexCatalog(
        candidates,
        plexMovieCatalogCache,
      );
      if (allMatches.size === 0) return items;

      const newCandidates = candidates.filter(
        (c) => !c.alreadyGrabbed && allMatches.has(c.tmdbId),
      );
      const newMatches = new Map(
        newCandidates.map((c) => [c.tmdbId, allMatches.get(c.tmdbId)!]),
      );
      const newlyAdopted = canWrite
        ? recordPlexMatches(
            newCandidates,
            newMatches,
            new ManualMovieGrabsStore(database),
            database,
            adoptionLog,
          )
        : new Set(newMatches.keys());

      return items.map((item) => {
        const candidate = toCandidate(item);
        if (!candidate || !allMatches.has(candidate.tmdbId)) return item;
        return withOwnership(item, {
          grabbed: true,
          grabSource: newlyAdopted.has(candidate.tmdbId)
            ? 'adopted-plex'
            : getGrabSource(item),
          plexStatus: 'in_library',
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[movie-adoption] cached plex check failed: ${message}`);
      return items;
    }
  }

  // Single-flight guard: without this, the fire-and-forget auto-bootstrap
  // sync (unawaited, can take a while on a real library) could run
  // concurrently with a manual Config "Sync Now" click, or with itself
  // across two browser tabs both racing the bootstrap claim. Both runs
  // would build their own ownedMovieStatuses() snapshot before either
  // committed anything, so both could independently record a grab for the
  // same movie — manual_movie_grabs has no uniqueness constraint on
  // tmdb_id (deliberately: multiple legitimate grabs per movie are
  // allowed, see its own schema doc comment), so nothing else would catch
  // this. A concurrent caller just awaits the same in-flight run instead.
  let fullSyncInFlight: Promise<{
    adoptedCount: number;
    checkedCount: number;
  } | null> | null = null;

  /** The deliberate, occasional full Plex movie sweep — walks Plex's whole
   * catalog once (forced fresh, bypassing PlexMovieCatalogCache's TTL: this
   * IS the "pay the price" action) and checks it against every movie ever
   * cached across every year of Top Movies of Year (not just whatever's
   * currently displayed — there's no "current view" to scope to here, since
   * this isn't triggered by a page view). Triggered by the Config "Sync
   * Now" button, or automatically exactly once — see
   * PlexMovieSyncStateStore.claimBootstrap.
   *
   * Best-effort: any failure here must never break whatever triggered it
   * (a page load, for the bootstrap case), so failures are logged and
   * swallowed, matching every other sweep in this file. */
  async function runFullMoviePlexSync(
    onProgress?: (checked: number, total: number) => void,
  ): Promise<{
    adoptedCount: number;
    checkedCount: number;
  } | null> {
    if (!database || !plexMovies || !topMovies) return null;
    // A caller with its own onProgress (the streaming Config route) that
    // lands on an already-in-flight run (e.g. the one-time auto-bootstrap
    // sync) just gets that run's result with no progress events of its
    // own — acceptable on a single-user NAS app where two full syncs
    // overlapping is rare, and still strictly better than starting a
    // second redundant sweep.
    if (fullSyncInFlight) return fullSyncInFlight;

    const promise = runFullMoviePlexSyncUncached(
      database,
      plexMovies,
      topMovies,
      onProgress,
    ).finally(() => (fullSyncInFlight = null));
    fullSyncInFlight = promise;
    return promise;
  }

  async function runFullMoviePlexSyncUncached(
    database: Database,
    plexMovies: PlexMovieEnrichDeps,
    topMovies: TopMoviesDeps,
    onProgress?: (checked: number, total: number) => void,
  ): Promise<{ adoptedCount: number; checkedCount: number } | null> {
    try {
      const manualMovieGrabs = new ManualMovieGrabsStore(database);
      const owned = await ownedMovieStatuses();
      const candidates: MovieAdoptionCandidate[] = topMovies.cache
        .listAllCachedItems()
        .filter(
          (item): item is typeof item & { tmdbId: number } =>
            item.tmdbId !== null,
        )
        .map((item) => ({
          tmdbId: item.tmdbId,
          title: item.title,
          releaseDate: item.releaseDate,
          imdbId: item.imdbId,
          posterUrl: item.posterUrl,
          alreadyGrabbed: owned.get(item.tmdbId)?.grabbed ?? false,
        }));

      plexMovieCatalogCache.invalidate();
      const adopted = await adoptMoviesFromPlex(candidates, {
        plexClient: plexMovies.client,
        manualMovieGrabs,
        database,
        catalogCache: plexMovieCatalogCache,
        log: adoptionLog,
        onProgress,
      });

      const syncedAt = new Date().toISOString();
      new PlexMovieSyncStateStore(database).recordSync(syncedAt);
      adoptionLog(
        `full plex sync: ${candidates.length} candidate(s) checked, ${adopted.size} adopted`,
      );
      return { adoptedCount: adopted.size, checkedCount: candidates.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[movie-adoption] full plex sync failed: ${message}`);
      return null;
    }
  }

  /** NDJSON-streaming sibling of the plain POST /api/movie-calendar/plex-sync
   * response above — same runFullMoviePlexSync underneath, just reporting
   * its coarse checked/total counter (see matchAgainstCatalog's
   * onProgress) as it goes instead of one response at the very end. Backs
   * the Config "Plex Movie Sync" card. */
  function streamMoviePlexSyncProgress(database: Database): Response {
    const encoder = new TextEncoder();
    // Set by cancel() when the client disconnects mid-run. Guards every
    // send/close below — runFullMoviePlexSync's own promise is NOT aborted
    // on disconnect (it's dedup'd via fullSyncInFlight and, per
    // TV_SYNC_RESPONSE_DEADLINE_MS's identical design elsewhere in this
    // file, deliberately keeps running to completion server-side
    // regardless of whether anyone's still listening — a concurrent or
    // follow-up "Sync Now" click should land on that same in-flight run,
    // not start a second redundant sweep). What this flag actually
    // prevents is enqueueing/closing on a controller the client has
    // already torn down, which would otherwise throw. Found in code
    // review before this ever shipped.
    let cancelled = false;
    const send = (
      controller: ReadableStreamDefaultController,
      event: Record<string, unknown>,
    ) => {
      if (cancelled) return;
      try {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      } catch {
        // Controller already closed/errored out from under us — ignore.
      }
    };

    const stream = new ReadableStream({
      async start(controller) {
        const result = await runFullMoviePlexSync((checked, total) => {
          send(controller, { type: 'progress', checked, total });
        });
        if (cancelled) return;

        if (!result) {
          send(controller, {
            type: 'fatal',
            message: 'Plex sync failed — see daemon logs.',
          });
          controller.close();
          return;
        }

        const state = new PlexMovieSyncStateStore(database).get();
        send(controller, {
          type: 'done',
          lastSyncedAt: state.lastSyncedAt,
          adoptedCount: result.adoptedCount,
          checkedCount: result.checkedCount,
        });
        controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });

    return new Response(stream, {
      headers: { 'content-type': 'application/x-ndjson; charset=utf-8' },
    });
  }

  /** Claims the one-time auto-bootstrap slot (best-effort, never blocks the
   * caller) and, if this call actually won it, kicks off the full sync in
   * the background — fire-and-forget, not awaited, so a first-ever Movie
   * Calendar visit doesn't sit waiting on a ~7000-movie Plex walk before
   * rendering anything. */
  function triggerPlexSyncBootstrapIfNeeded(): void {
    if (!database) return;
    try {
      const claimed = new PlexMovieSyncStateStore(database).claimBootstrap();
      if (!claimed) return;
      adoptionLog('full plex sync: auto-triggered (first-ever visit)');
      void runFullMoviePlexSync();
    } catch {
      // Best-effort — see runFullMoviePlexSync's own doc comment.
    }
  }

  // Movie-shaped sibling of fullSyncInFlight — same "one caller wins,
  // concurrent callers await the same run" rationale. Also what lets the
  // POST handler below return early (see SYNC_RESPONSE_DEADLINE_MS) without
  // losing track of an already-started run: a concurrent or follow-up
  // click still awaits this same promise instead of kicking off a second
  // one.
  let fullTvSyncInFlight: Promise<{
    checkedCount: number;
    skippedCount: number;
  } | null> | null = null;

  /** The deliberate, operator-triggered full Plex TV sweep — refreshes
   * every currently tracked show's cached Plex status right now, instead
   * of waiting for the next background-refresh cycle (runPlexBackgroundRefresh,
   * every plexRefreshIntervalMinutes). Backs the Config "Plex TV Sync"
   * card — mirrors runFullMoviePlexSync's shape, but there's no separate
   * "adopt a pre-existing Plex show" concept for TV the way there is for
   * movies (see adoptMoviesFromPlex): tracked shows are already known via
   * trackedShows regardless of Plex, so this is purely a forced refresh of
   * refreshShowLibraryCache — the exact same write path the background
   * refresh already uses, now with the false-negative-on-timeout guard
   * fixed (see refreshShowLibraryCache's own comment), so this is also the
   * one manual action that can immediately repair a show whose cached
   * status got corrupted by a prior run of Plex timeouts, without waiting
   * for a lucky background cycle.
   *
   * Best-effort: any failure here must never break whatever triggered it,
   * matching every other sweep in this file. */
  async function runFullTvPlexSync(): Promise<{
    checkedCount: number;
    skippedCount: number;
  } | null> {
    if (!database || !plexShows) return null;
    if (fullTvSyncInFlight) return fullTvSyncInFlight;

    const promise = runFullTvPlexSyncUncached(database, plexShows).finally(
      () => (fullTvSyncInFlight = null),
    );
    fullTvSyncInFlight = promise;
    return promise;
  }

  async function runFullTvPlexSyncUncached(
    database: Database,
    plexShows: PlexShowEnrichDeps,
  ): Promise<{ checkedCount: number; skippedCount: number } | null> {
    try {
      // Same candidates -> buildShowBreakdowns(trackedNormalizedTitles)
      // pipeline runPlexBackgroundRefresh already uses, so every tracked
      // show is included even with zero candidate_state rows (a show
      // tracked after its season already aired otherwise has nothing here
      // to seed a stub from).
      const candidates = repository.listCandidateStates(
        API_CANDIDATE_LIST_LIMIT,
      );
      const shows = buildShowBreakdowns(candidates, trackedNormalizedTitles());
      const { checked, skipped } = await refreshShowLibraryCache(
        shows,
        plexShows,
      );

      // Nothing was actually verified — Plex was unreachable for every
      // single show this pass (the whole-catalog fetch failed AND every
      // per-show search failed too). Recording a sync here and reporting
      // "N shows checked" would be exactly the kind of dishonest-state bug
      // this whole feature exists to catch, just moved from the cache row
      // to the sync-status card: a user hitting "Sync Now" to recover from
      // a run of Plex timeouts deserves to be told it didn't actually run,
      // not a fresh "last synced: just now" that implies it did.
      if (checked === 0 && shows.length > 0) {
        console.log(
          `[plex] full tv sync: Plex unreachable, 0/${shows.length} show(s) actually checked`,
        );
        return null;
      }

      const syncedAt = new Date().toISOString();
      new PlexTvSyncStateStore(database).recordSync(syncedAt);
      console.log(
        `[plex] full tv sync: ${checked} show(s) checked, ${skipped} skipped (no Plex answer)`,
      );
      return { checkedCount: checked, skippedCount: skipped };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[plex] full tv sync failed: ${message}`);
      return null;
    }
  }

  /** Refreshes at most once per RECONCILE_STALE_AFTER_MS per show, triggered
   * by viewing that show's episode grid — see grill-me: on-demand per show,
   * not a global background job, since this is a single-user NAS app and a
   * periodic sweep over every tracked show's Transmission list + media tree
   * would be wasted work most of the time. Best-effort: any failure here
   * must never break the page that triggered it. */
  async function reconcileShowIfStale(normalizedTitle: string): Promise<void> {
    if (!trackedShows || !database) return;
    const tracked = trackedShows.get(normalizedTitle);
    if (!tracked) return;

    const lastReconciledAt = tracked.lastReconciledAt
      ? Date.parse(tracked.lastReconciledAt)
      : Number.NaN;
    if (
      !Number.isNaN(lastReconciledAt) &&
      Date.now() - lastReconciledAt < RECONCILE_STALE_AFTER_MS
    ) {
      return;
    }

    try {
      await reconcileShowLibrary(tracked, {
        transmission: activeConfig.transmission,
        manualGrabs: new ManualGrabsStore(database),
        mediaShowsDirs: await resolveMediaShowsDirs(),
      });
    } catch {
      // Best-effort — see doc comment above.
    } finally {
      trackedShows.markReconciled(normalizedTitle, new Date().toISOString());
    }
  }

  /** Strips any config.tv.shows entry whose normalized name matches, so the
   * RSS pipeline stops matching new episodes for an untracked show — without
   * this, the next call to syncTrackedShowsFromConfig (daemon restart, or
   * any other config PUT) would just re-create the ledger row this DELETE
   * just removed. Returns `{ ok: false }` on a genuine structural problem
   * (legacy non-compact tv config — the only format every config-writing
   * feature in this codebase, including PUT /api/config, already requires —
   * or an unexpected write failure) so the caller can fail loudly instead of
   * reporting "untracked" while the watchlist silently still matches it.
   * Nothing to remove (the show wasn't in tv.shows at all — e.g. a
   * candidate-only leftover show with no real config entry) is a legitimate
   * no-op, not a failure. */
  async function removeShowFromWatchlist(
    normalizedTitle: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const baseOnDisk = await readConfigFileRecord(configPath);
      const tvDisk = baseOnDisk.tv;
      if (!isRecord(tvDisk) || !Array.isArray(tvDisk.shows)) {
        return {
          ok: false,
          error:
            'config tv is not in the expected compact format; edit the config file directly to remove this show from the watchlist',
        };
      }

      const remainingShows = tvDisk.shows.filter((entry) => {
        const name = configShowEntryName(entry);
        return (
          name === undefined || normalizeShowName(name) !== normalizedTitle
        );
      });
      if (remainingShows.length === tvDisk.shows.length) return { ok: true };

      const merged = {
        ...baseOnDisk,
        tv: { ...tvDisk, shows: remainingShows },
      };
      const validated = validateConfig(
        merged,
        'config',
        await loadConfigEnv(configPath),
      );
      writeConfigAtomically(configPath, merged);
      activeConfig = validated;
      if (configHolder) {
        configHolder.current = validated;
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'failed to update the watchlist',
      };
    }
  }

  return async (request: Request) => {
    const path = new URL(request.url).pathname;

    if (path === '/api/health') {
      const uptimeMs = Date.now() - new Date(health.startedAt).getTime();
      return Response.json({
        uptime: uptimeMs,
        startedAt: health.startedAt,
        lastRunCycle: health.lastRunCycle,
        lastReconcileCycle: health.lastReconcileCycle,
      });
    }

    if (path === '/api/setup/state' && request.method === 'GET') {
      try {
        const state = await getSetupState(configPath);
        return Response.json({ state });
      } catch {
        return json500();
      }
    }

    if (path === '/api/setup/readiness' && request.method === 'GET') {
      try {
        const configState = await getSetupState(configPath);
        const daemonLive = true;
        let transmissionReachable = false;
        if (configState === 'ready') {
          const pingResult = await fetchSessionInfo(activeConfig.transmission);
          transmissionReachable = pingResult.ok === true;
        }
        let state: 'not_ready' | 'ready_pending_restart' | 'ready';
        if (configState !== 'ready') {
          state = 'not_ready';
        } else if (!daemonLive || !transmissionReachable) {
          state = 'ready_pending_restart';
        } else {
          state = 'ready';
        }
        return Response.json({
          state,
          configState,
          transmissionReachable,
          daemonLive,
        });
      } catch {
        return json500();
      }
    }

    if (path === '/api/setup/install-health' && request.method === 'GET') {
      try {
        return Response.json(await getInstallHealth(activeConfig));
      } catch (err) {
        console.error('[api] /api/setup/install-health failed:', err);
        return json500();
      }
    }

    if (path === '/api/daemon/restart-status' && request.method === 'GET') {
      try {
        const status = await readRestartStatus(
          activeConfig.runtime.artifactDir,
          health.startedAt,
        );
        return Response.json(status);
      } catch {
        return json500();
      }
    }

    if (path === '/api/client-error' && request.method === 'POST') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'invalid json body' }, { status: 400 });
      }

      if (!isRecord(body)) {
        return Response.json(
          { error: 'request body must be an object' },
          { status: 400 },
        );
      }
      if (typeof body.message !== 'string' || body.message.length === 0) {
        return Response.json(
          { error: 'request body message must be a non-empty string' },
          { status: 400 },
        );
      }

      // This endpoint takes an arbitrary browser-reported error, and the
      // browser-facing hop (web/src/routes/api/client-error/+server.ts)
      // requires no auth from the caller — so, unlike every other field in
      // this codebase's HTTP log, these values are untrusted input, not
      // something this process itself constructed. Truncate before they
      // ever reach logClientError/rotateIfNeeded, which sizes the rotating
      // log file by checking *before* a write, not after: an unbounded
      // stack trace could blow well past the intended 10MB rotation cap in
      // a single POST.
      logClientError({
        message: body.message.slice(0, 2_000),
        stack: truncateClientErrorField(body.stack, 8_000),
        url: truncateClientErrorField(body.url, 2_000),
        label: truncateClientErrorField(body.label, 200),
      });
      return Response.json({ ok: true });
    }

    if (path === '/api/setup/transmission/status' && request.method === 'GET') {
      try {
        const url = activeConfig.transmission.url;
        const pingResult = await fetchSessionInfo(activeConfig.transmission);
        const reachable = pingResult.ok === true;
        const compatibility = classifyTransmissionUrl(url, reachable);
        const advisory =
          compatibility === 'compatible_custom'
            ? 'Non-standard Transmission configuration detected. Setup will proceed but verify your URL and port.'
            : undefined;
        return Response.json({ compatibility, url, reachable, advisory });
      } catch {
        return json500();
      }
    }

    if (path === '/api/auth/state' && request.method === 'GET') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;
      try {
        return Response.json(await readAuthState(dirname(configPath)));
      } catch {
        return json500();
      }
    }

    if (path === '/api/auth/setup-owner' && request.method === 'POST') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'invalid json body' }, { status: 400 });
      }

      const parsed = body as Record<string, unknown>;
      if (typeof parsed?.username !== 'string' || !parsed.username.trim()) {
        return Response.json(
          { error: 'username is required' },
          { status: 400 },
        );
      }
      if (typeof parsed?.password !== 'string' || !parsed.password) {
        return Response.json(
          { error: 'password is required' },
          { status: 400 },
        );
      }

      try {
        const origin = request.headers.get('origin');
        const result = await setupOwner(
          dirname(configPath),
          parsed.username.trim(),
          parsed.password,
          origin,
        );
        if (!result.ok) {
          return Response.json(
            { error: 'owner already exists' },
            { status: 409 },
          );
        }
        return Response.json({ ok: true });
      } catch {
        return json500();
      }
    }

    if (path === '/api/auth/verify-login' && request.method === 'POST') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'invalid json body' }, { status: 400 });
      }

      const parsed = body as Record<string, unknown>;
      if (typeof parsed?.username !== 'string' || !parsed.username.trim()) {
        return Response.json(
          { error: 'username is required' },
          { status: 400 },
        );
      }
      if (typeof parsed?.password !== 'string') {
        return Response.json(
          { error: 'password is required' },
          { status: 400 },
        );
      }

      try {
        const result = await verifyLogin(
          dirname(configPath),
          parsed.username.trim(),
          parsed.password,
        );
        return Response.json(result);
      } catch {
        return json500();
      }
    }

    if (path === '/api/auth/trust-origin' && request.method === 'POST') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'invalid json body' }, { status: 400 });
      }

      const parsed = body as Record<string, unknown>;
      if (typeof parsed?.origin !== 'string' || !parsed.origin.trim()) {
        return Response.json({ error: 'origin is required' }, { status: 400 });
      }

      try {
        await trustOrigin(dirname(configPath), parsed.origin.trim());
        return Response.json({ ok: true });
      } catch {
        return json500();
      }
    }

    if (
      path === '/api/auth/acknowledge-network-posture' &&
      request.method === 'POST'
    ) {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'invalid json body' }, { status: 400 });
      }

      const parsed = body as Record<string, unknown>;
      const validStates = [
        'direct_acknowledged',
        'already_secured_externally',
        'vpn_bridge_pending',
      ] as const;
      if (
        typeof parsed?.state !== 'string' ||
        !validStates.includes(parsed.state as (typeof validStates)[number])
      ) {
        return Response.json(
          {
            error:
              'state must be one of: direct_acknowledged, already_secured_externally, vpn_bridge_pending',
          },
          { status: 400 },
        );
      }

      try {
        await acknowledgeNetworkPosture(
          dirname(configPath),
          parsed.state as
            | 'direct_acknowledged'
            | 'already_secured_externally'
            | 'vpn_bridge_pending',
        );
        return Response.json({ ok: true });
      } catch {
        return json500();
      }
    }

    if (path === '/api/plex/auth/start' && request.method === 'POST') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;
      if (!database) {
        return json500();
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'invalid json body' }, { status: 400 });
      }

      try {
        const parsed = expectRecord(body, 'request body');
        const forwardUrl = requireNonEmptyString(
          parsed.forwardUrl,
          'request body forwardUrl',
        );
        const returnTo =
          parsed.returnTo === undefined
            ? undefined
            : requireNonEmptyString(parsed.returnTo, 'request body returnTo');

        const store = new PlexAuthStore(database);
        const identity = store.ensureIdentity();
        const started = await startPlexPinAuth({
          clientIdentifier: identity.clientIdentifier,
          productName: identity.clientName,
          forwardUrl,
          jwk: identity.publicJwk,
        });
        const created = store.createSession({
          oauthState: started.pinCode,
          codeVerifier: String(started.pinId),
          pinId: started.pinId,
          pinCode: started.pinCode,
          redirectUri: forwardUrl,
          returnTo,
          expiresAt: started.expiresAt,
        });

        const redirectUrl = appendSessionToForwardUrl(
          started.authUrl,
          created.session.id,
        );
        return Response.json({
          sessionId: created.session.id,
          redirectUrl,
          expiresAt: created.session.expiresAt,
        });
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error ? error.message : 'plex auth start failed',
          },
          { status: 400 },
        );
      }
    }

    if (path === '/api/plex/auth/finalize' && request.method === 'POST') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;
      if (!database) {
        return json500();
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'invalid json body' }, { status: 400 });
      }

      // Hoisted so the catch block below can still report returnTo/expiresAt
      // for a PlexRateLimitError, which is thrown after this is set.
      let pendingReturnTo: string | null = null;
      let pendingExpiresAt: string | null = null;

      try {
        const parsed = expectRecord(body, 'request body');
        const sessionId = requireNonEmptyString(
          parsed.sessionId,
          'request body sessionId',
        );
        const store = new PlexAuthStore(database);
        const snapshot = store.getSnapshot();
        pendingReturnTo = snapshot.pendingSession?.returnTo ?? null;
        pendingExpiresAt = snapshot.pendingSession?.expiresAt ?? null;

        if (
          !snapshot.pendingSession ||
          snapshot.pendingSession.id !== sessionId ||
          snapshot.pendingSession.pinId == null
        ) {
          return Response.json(
            { error: 'plex auth session is missing or expired' },
            { status: 409 },
          );
        }

        const identity = store.ensureIdentity();
        const authToken = await exchangePlexPinForAuthToken({
          clientIdentifier: identity.clientIdentifier,
          pinId: snapshot.pendingSession.pinId,
        });

        if (!authToken) {
          // Plex hasn't bound the PIN to a user yet. Surface as soft-pending so
          // the callback page retries instead of cancelling the session.
          return Response.json(
            {
              pending: true,
              error: 'Plex sign-in is still completing at Plex.',
              returnTo: snapshot.pendingSession.returnTo,
              expiresAt: snapshot.pendingSession.expiresAt,
            },
            { status: 409 },
          );
        }

        activeConfig = await writePlexTokenToConfig({
          authToken,
          configPath,
          currentConfig: activeConfig,
          configHolder,
        });
        store.finalizeSession(sessionId, {
          refreshToken: authToken,
        });

        return Response.json({
          ok: true,
          returnTo: snapshot.pendingSession.returnTo,
        });
      } catch (error) {
        if (error instanceof PlexRateLimitError) {
          // Surface as soft-pending (like the not-yet-linked case) rather than
          // a hard failure, and tell the callback page how long to back off —
          // otherwise it keeps reloading on its normal cadence and re-triggers
          // the same rate limit.
          console.warn(
            `[plex-auth] finalize rate limited; retryAfterMs=${error.retryAfterMs}`,
          );
          return Response.json(
            {
              pending: true,
              error:
                'Plex rate limited the sign-in check; retrying automatically.',
              returnTo: pendingReturnTo,
              expiresAt: pendingExpiresAt,
              retryAfterMs: error.retryAfterMs,
            },
            { status: 409 },
          );
        }
        console.error(
          '[plex-auth] finalize failed:',
          error instanceof Error ? error.message : error,
        );
        return Response.json(
          {
            error:
              error instanceof Error
                ? error.message
                : 'plex auth finalize failed',
          },
          { status: 400 },
        );
      }
    }

    if (path === '/api/plex/auth/status' && request.method === 'GET') {
      if (!database) {
        return json500();
      }

      const store = new PlexAuthStore(database);
      const snapshot = store.getSnapshot();
      const plexUrl = activeConfig.plex?.url ?? 'http://localhost:32400';
      const configToken = activeConfig.plex?.token?.trim() ?? '';
      const identityToken = snapshot.identity?.refreshToken?.trim() ?? '';
      const token = configToken || identityToken;
      const envToken = process.env.PIRATE_CLAW_PLEX_TOKEN?.trim();
      const tokenSource: PlexAuthStatusResponse['tokenSource'] =
        configToken.length === 0
          ? 'none'
          : envToken && envToken.length > 0
            ? 'env'
            : 'config';
      const plexServerVersion =
        snapshot.state === 'connected'
          ? await fetchPlexServerVersion(plexUrl, token)
          : null;
      const plexVersionCompatible =
        plexServerVersion === null
          ? null
          : isVersionAtLeast(plexServerVersion, MIN_SUPPORTED_PLEX_VERSION);
      return Response.json({
        state: snapshot.state,
        plexUrl,
        hasToken: Boolean(activeConfig.plex?.token),
        tokenSource,
        returnTo: snapshot.pendingSession?.returnTo ?? null,
        plexServerVersion,
        plexVersionCompatible,
      } satisfies PlexAuthStatusResponse);
    }

    if (path === '/api/status') {
      return safeJson(() => ({ runs: repository.listRecentRunSummaries() }));
    }

    if (path === '/api/candidates') {
      try {
        const list = repository.listCandidateStates(API_CANDIDATE_LIST_LIMIT);
        const enriched = tmdbCache
          ? enrichCandidatesFromCache(
              list,
              tmdbCache,
              onCandidateTmdbCacheError,
            )
          : list;
        const candidates = enriched.filter(isCandidateVisible);
        return Response.json({ candidates });
      } catch {
        return json500();
      }
    }

    const requeueMatch = path.match(/^\/api\/candidates\/([^/]+)\/requeue$/);
    if (requeueMatch && request.method === 'POST') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      if (!downloader) {
        return Response.json(
          { ok: false, error: 'requeue is not available' },
          { status: 503 },
        );
      }

      const identityKey = decodeURIComponent(requeueMatch[1]);
      const candidate = repository.getCandidateState(identityKey);
      if (!candidate) {
        return Response.json(
          { ok: false, error: 'candidate not found' },
          { status: 404 },
        );
      }
      if (candidate.status !== 'failed') {
        return Response.json(
          {
            ok: false,
            error: `candidate is not eligible for requeue: ${candidate.status}`,
          },
          { status: 400 },
        );
      }

      const result = await downloader.submit({
        downloadUrl: candidate.downloadUrl,
      });
      if (!result.ok) {
        return Response.json(
          { ok: false, error: result.message },
          { status: 500 },
        );
      }

      repository.requeueCandidate(identityKey, {
        torrentId: result.torrentId,
        torrentHash: result.torrentHash,
        torrentName: result.torrentName,
      });

      return Response.json({
        ok: true,
        torrentHash: result.torrentHash ?? null,
        torrentId: result.torrentId ?? null,
        torrentName: result.torrentName ?? null,
      });
    }

    if (path === '/api/shows') {
      try {
        const candidates = repository.listCandidateStates(
          API_CANDIDATE_LIST_LIMIT,
        );
        const base = buildShowBreakdowns(candidates, trackedNormalizedTitles());
        const withPlex = plexShows
          ? enrichShowBreakdownsFromPlexCache(base, plexShows)
          : base;
        const shows = tmdbShows
          ? await enrichShowBreakdowns(withPlex, tmdbShows)
          : withPlex;
        return Response.json({ shows });
      } catch {
        return json500();
      }
    }

    if (path === '/api/calendar/tv') {
      if (!calendarTv) {
        return Response.json(
          { error: 'tmdb is not configured' },
          { status: 409 },
        );
      }

      try {
        const params = new URL(request.url).searchParams;
        const currentYear = new Date().getFullYear();
        const year = clampNonNegativeInt(
          params.get('year'),
          currentYear,
          1900,
          currentYear + 5,
        );
        const trackedNames = activeConfig.tv.map((rule) => rule.name);
        // No default here: omitted means "let getTvCalendar auto-anchor"
        // (lands on today for the current year, or the natural first/last
        // page when rolling into an adjacent year — see anchorOffsetForToday).
        const offsetParam = params.get('offset');
        const offset =
          offsetParam === null
            ? undefined
            : clampNonNegativeInt(offsetParam, 0);
        const limit = clampNonNegativeInt(params.get('limit'), 20, 1, 50);
        const page = await getTvCalendar(calendarTv, year, trackedNames, {
          offset,
          limit,
        });
        return Response.json({
          year,
          items: page.items,
          total: page.total,
          offset: page.offset,
          limit,
        });
      } catch {
        return json500();
      }
    }

    if (path === '/api/movie-calendar') {
      if (!calendarMovie) {
        return Response.json(
          { error: 'tmdb is not configured' },
          { status: 409 },
        );
      }
      // No triggerPlexSyncBootstrapIfNeeded() here — this route never
      // populates topMovies.cache (that's Top Movies of Year's job), so
      // bootstrapping from here had nothing to actually sync yet and would
      // burn the one-time claim for good. See the Top Movies handler below.

      try {
        const params = new URL(request.url).searchParams;
        const currentYear = new Date().getFullYear();
        const year = clampNonNegativeInt(
          params.get('year'),
          currentYear,
          1900,
          currentYear + 5,
        );
        // Same "omitted means let it auto-anchor" rationale as
        // /api/calendar/tv — see getMovieCalendar's anchorOffsetForToday.
        const offsetParam = params.get('offset');
        const offset =
          offsetParam === null
            ? undefined
            : clampNonNegativeInt(offsetParam, 0);
        const limit = clampNonNegativeInt(params.get('limit'), 20, 1, 50);
        const owned = await ownedMovieStatuses();
        const page = await getMovieCalendar(calendarMovie, year, owned, {
          offset,
          limit,
        });
        const toCalendarCandidate = (item: (typeof page.items)[number]) => ({
          tmdbId: item.tmdbId,
          title: item.title,
          releaseDate: item.releaseDate,
          imdbId: null,
          posterUrl: item.posterUrl,
          alreadyGrabbed: item.alreadyGrabbed,
        });
        const withCalendarOwnership = (
          item: (typeof page.items)[number],
          status: MovieOwnershipStatus,
        ) => ({
          ...item,
          alreadyGrabbed: status.grabbed,
          grabSource: status.grabSource,
          plexStatus: status.plexStatus,
        });
        const afterFilesystemSweep = await adoptMoviesForCurrentView(
          // Calendar is month-paginated but sends the same `year` on every
          // page within it — a bare year key would only ever sweep the
          // first month page viewed each 10-minute window (see
          // lastFilesystemAdoptionSweepAtByKey's own comment). page.offset
          // (the actually-resolved offset, not the possibly-omitted
          // request param) makes each distinct page of movies its own key.
          `${year}:${page.offset}`,
          page.items,
          toCalendarCandidate,
          withCalendarOwnership,
        );
        // Cheap (cached-catalog-only, no network) — safe to run inline on
        // every view. See applyCachedPlexStatus's own doc comment for why
        // the write itself (not the match/display) is gated on write auth.
        const items = applyCachedPlexStatus(
          afterFilesystemSweep,
          toCalendarCandidate,
          (item) => item.grabSource,
          withCalendarOwnership,
          checkWriteAuth(request, activeConfig) === null,
        );
        return Response.json({
          year,
          items,
          total: page.total,
          offset: page.offset,
          limit,
        });
      } catch {
        return json500();
      }
    }

    if (path === '/api/movie-calendar/top') {
      if (request.method !== 'GET') {
        return jsonMethodNotAllowed('GET');
      }
      if (!topMovies) {
        return Response.json(
          { error: 'tmdb is not configured' },
          { status: 409 },
        );
      }

      const params = new URL(request.url).searchParams;
      const currentYear = new Date().getFullYear();
      // No future years: TMDB has no reliable "top movies" ranking for a
      // year that hasn't released yet, and even released titles don't have
      // torrents worth scraping until well after their theatrical run.
      const year = clampNonNegativeInt(
        params.get('year'),
        currentYear,
        1900,
        currentYear,
      );
      // Rescanning re-hits a third-party site and (on a cold cache) makes
      // up to 100 TMDB calls — a deliberate operator action, gated like any
      // other outbound-call-triggering write, not a free read. Same for
      // sweep=true (see below): it writes adopted movies to
      // manual_movie_grabs. (The Plex catalog sweep is a separate,
      // deliberate Config action — see runFullMoviePlexSync — not part of
      // this endpoint at all anymore.)
      const rescan = params.get('rescan') === 'true';
      const sweep = params.get('sweep') === 'true';
      if (rescan || sweep) {
        const authError = checkWriteAuth(request, activeConfig);
        if (authError) return authError;
      }

      try {
        const owned = await ownedMovieStatuses();
        const result = await getTopMovies(topMovies, year, owned, rescan);

        const toTopMovieCandidate = (item: (typeof result.items)[number]) =>
          item.tmdbId === null
            ? null
            : {
                tmdbId: item.tmdbId,
                title: item.title,
                releaseDate: item.releaseDate,
                imdbId: item.imdbId,
                posterUrl: item.posterUrl,
                alreadyGrabbed: item.alreadyGrabbed,
              };
        const withTopMovieOwnership = (
          item: (typeof result.items)[number],
          status: MovieOwnershipStatus,
        ) => ({
          ...item,
          alreadyGrabbed: status.grabbed,
          grabSource: status.grabSource,
          plexStatus: status.plexStatus,
        });

        // Only after a real result — Plex configured AND there's actually
        // at least one movie now cached to check. Triggering this
        // unconditionally on route entry (the original version of this
        // fix) burned the one-time claim on installs where Plex wasn't
        // configured yet, or on a request that landed before any year had
        // ever been cached, permanently losing the "run once ever"
        // catch-up. Found in code review before this ever shipped.
        if (plexMovies && result.items.length > 0) {
          triggerPlexSyncBootstrapIfNeeded();
        }

        // Cheap (cached-catalog-only, no network) — safe to run inline on
        // every view, cache hit or not. See applyCachedPlexStatus's own
        // doc comment for why the write itself (not the match/display) is
        // gated on write auth. Real Plex fetches only ever happen via the
        // deliberate Config "Sync Now" action / the one-time bootstrap.
        const withCachedPlexStatus = applyCachedPlexStatus(
          result.items,
          toTopMovieCandidate,
          (item) => item.grabSource,
          withTopMovieOwnership,
          checkWriteAuth(request, activeConfig) === null,
        );

        if (!sweep) {
          // The plain (non-sweep) response never runs the filesystem
          // adoption sweep — that used to happen inline here on every
          // request, cache hit or not, which meant a routine cache-hit page
          // view could quietly trigger real work, and a second
          // near-simultaneous request could land mid-sweep and see stale
          // data (confirmed live 2026-08-29 while monitoring logs during
          // QA — see git history for the throttle-only fix that preceded
          // this one, which narrowed but didn't close that race). Now it
          // only ever runs via the dedicated sweep=true call below, which
          // the client fires itself right after any response with
          // fromCache: false (first-ever view or an explicit Rescan) —
          // never on a plain cache hit, and never racing itself, since it's
          // a single deliberate follow-up call, not an automatic per-view
          // one. See movie-calendar/+page.svelte's loadTopMovies.
          return Response.json({ ...result, items: withCachedPlexStatus });
        }

        // sweep=true: the client already has result.items from a prior
        // fast call (this call's own getTopMovies is a cache hit, since
        // that prior call — cold cache or rescan — already populated it).
        // Runs the filesystem sweep unconditionally (force: true) — this
        // endpoint IS the explicit trigger, so there's nothing to throttle
        // against. The full (network) Plex sweep is NOT run here — see
        // runFullMoviePlexSync; only the cached-catalog check above, which
        // already ran regardless of sweep=true.
        const items = await adoptMoviesForCurrentView(
          String(year),
          withCachedPlexStatus,
          toTopMovieCandidate,
          withTopMovieOwnership,
          { force: true },
        );
        return Response.json({ ...result, items });
      } catch {
        return json500();
      }
    }

    // NDJSON-streaming sibling of the plain /api/movie-calendar/top rescan
    // above — backs the movie-calendar page's Rescan button (both the "Top
    // Movies of Year" tab and the "Yearly Movies" calendar tab, which share
    // this one action). Reports live per-title progress as getTopMovies
    // works through TMDB lookups (see its onProgress param) instead of one
    // opaque spinner for however long ~100 TMDB calls takes. Deliberately
    // does NOT return the final item list itself — once `done` arrives the
    // client re-fetches /api/movie-calendar/top normally (now a cache hit,
    // so fast), the same "stream is only for progress, reload for data"
    // shape shows/refresh-missing established. Same write-auth gating as
    // the plain rescan=true path.
    if (path === '/api/movie-calendar/top-rescan') {
      if (request.method !== 'POST') {
        return jsonMethodNotAllowed('POST');
      }
      if (!topMovies) {
        return Response.json(
          { error: 'tmdb is not configured' },
          { status: 409 },
        );
      }
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      const params = new URL(request.url).searchParams;
      const currentYear = new Date().getFullYear();
      const year = clampNonNegativeInt(
        params.get('year'),
        currentYear,
        1900,
        currentYear,
      );

      const topMoviesDeps = topMovies;
      const encoder = new TextEncoder();
      // Set by cancel() when the client disconnects mid-run. There's no
      // AbortSignal plumbed into TmdbHttpClient, so the one TMDB lookup
      // already in flight when this fires can't itself be aborted — but
      // throwing from the onProgress callback below (called once per
      // completed lookup, between iterations) stops the loop from firing
      // any FURTHER lookups, and — just as importantly — makes getTopMovies
      // reject instead of "successfully" returning a partial year, so
      // TopMoviesCache never caches (and corrupts) an incomplete result;
      // see its fetchOnce, which only writes on a resolved promise. Found
      // in code review before this ever shipped (previously this stream
      // had no cancel() at all — nothing stopped ~100 outbound TMDB calls
      // from continuing after a disconnect).
      let cancelled = false;
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: Record<string, unknown>) => {
            if (cancelled) return;
            try {
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            } catch {
              // Controller already closed/errored out from under us — ignore.
            }
          };
          try {
            const owned = await ownedMovieStatuses();
            const result = await getTopMovies(
              topMoviesDeps,
              year,
              owned,
              true,
              (checked, total, title) => {
                if (cancelled) throw new Error('rescan cancelled');
                send({ type: 'progress', index: checked, total, title });
              },
            );
            if (result.scrapeError) {
              send({ type: 'fatal', message: result.scrapeError });
            } else {
              send({ type: 'done' });
            }
          } catch (error) {
            if (!cancelled) {
              const message =
                error instanceof Error ? error.message : String(error);
              send({ type: 'fatal', message });
            }
          }
          if (!cancelled) controller.close();
        },
        cancel() {
          cancelled = true;
        },
      });

      return new Response(stream, {
        headers: { 'content-type': 'application/x-ndjson; charset=utf-8' },
      });
    }

    // Backs the Config page's "Plex Movie Sync" card: GET reads the last
    // sync time for display (never touches Plex); POST actually runs it
    // (walks the whole catalog, write-auth gated like every other
    // outbound-call-triggering action). This is the ONLY way the full Plex
    // sweep runs now, aside from the one-time auto-bootstrap — see
    // triggerPlexSyncBootstrapIfNeeded and runFullMoviePlexSync's own doc
    // comments for why it moved out of the per-view flow entirely.
    if (path === '/api/movie-calendar/plex-sync') {
      if (!database) {
        return Response.json(
          { error: 'database is not configured' },
          {
            status: 409,
          },
        );
      }

      if (request.method === 'GET') {
        const state = new PlexMovieSyncStateStore(database).get();
        return Response.json({ lastSyncedAt: state.lastSyncedAt });
      }

      if (request.method === 'POST') {
        if (!plexMovies) {
          return Response.json(
            { error: 'Plex is not configured' },
            { status: 409 },
          );
        }
        const authError = checkWriteAuth(request, activeConfig);
        if (authError) return authError;

        // Config's "Plex Movie Sync" card streams a live checked/total
        // counter instead of sitting behind one opaque spinner for
        // however long ~7000 movies takes. Unlike TV sync/shows refresh,
        // this work has no per-item network call to make "gentle" —
        // adoptMoviesFromPlex fetches Plex's whole catalog ONCE, then
        // matches every candidate in-memory (see matchAgainstCatalog) — so
        // this is a coarse, honest "how far along is it" counter, not the
        // same sequential/paced pattern. See ?stream's opt-in: the plain
        // POST below (no stream param) keeps the single-JSON-response
        // shape for any other caller.
        if (new URL(request.url).searchParams.get('stream') === 'true') {
          return streamMoviePlexSyncProgress(database);
        }

        const result = await runFullMoviePlexSync();
        if (!result) {
          return Response.json(
            { error: 'Plex sync failed — see daemon logs.' },
            { status: 502 },
          );
        }
        const state = new PlexMovieSyncStateStore(database).get();
        return Response.json({
          lastSyncedAt: state.lastSyncedAt,
          adoptedCount: result.adoptedCount,
          checkedCount: result.checkedCount,
        });
      }

      return jsonMethodNotAllowed('GET, POST');
    }

    // Backs the Config page's "Plex TV Sync" card — see runFullTvPlexSync's
    // doc comment. Same GET-reads/POST-runs, write-auth-gated shape as
    // /api/movie-calendar/plex-sync above.
    if (path === '/api/shows/plex-sync') {
      if (!database) {
        return Response.json(
          { error: 'database is not configured' },
          {
            status: 409,
          },
        );
      }

      if (request.method === 'GET') {
        const state = new PlexTvSyncStateStore(database).get();
        return Response.json({ lastSyncedAt: state.lastSyncedAt });
      }

      if (request.method === 'POST') {
        if (!plexShows) {
          return Response.json(
            { error: 'Plex is not configured' },
            { status: 409 },
          );
        }
        const authError = checkWriteAuth(request, activeConfig);
        if (authError) return authError;

        // Config's "Plex TV Sync" card now drives the actual per-show
        // checking itself, streamed via web/src/routes/config/plex-tv-sync
        // (one /api/shows/:slug/plex/refresh call per tracked show — see
        // that route's doc comment for why this is a legitimate
        // replacement for the loop below, not just a UI wrapper around it).
        // That route calls back here with recordOnly=true purely to stamp
        // the same last-synced-at row this endpoint has always owned,
        // without re-running the sweep a second time. The plain POST below
        // (no recordOnly) is kept for any other caller that still wants the
        // single-request, non-streamed sweep.
        if (new URL(request.url).searchParams.get('recordOnly') === 'true') {
          const syncedAt = new Date().toISOString();
          new PlexTvSyncStateStore(database).recordSync(syncedAt);
          return Response.json({ lastSyncedAt: syncedAt });
        }

        // See TV_SYNC_RESPONSE_DEADLINE_MS's doc comment for why this
        // races against a timeout rather than a plain await: the sync
        // itself keeps running in the background regardless (held by
        // fullTvSyncInFlight) — this only bounds how long the HTTP
        // response waits on it.
        const syncPromise = runFullTvPlexSync();
        const raceResult = await Promise.race([
          syncPromise.then((result) => ({ timedOut: false as const, result })),
          new Promise<{ timedOut: true }>((resolve) =>
            setTimeout(
              () => resolve({ timedOut: true }),
              TV_SYNC_RESPONSE_DEADLINE_MS,
            ),
          ),
        ]);

        if (raceResult.timedOut) {
          return Response.json({ started: true, timedOut: true });
        }
        if (!raceResult.result) {
          return Response.json(
            { error: 'Plex sync failed — see daemon logs.' },
            { status: 502 },
          );
        }
        const state = new PlexTvSyncStateStore(database).get();
        return Response.json({
          lastSyncedAt: state.lastSyncedAt,
          checkedCount: raceResult.result.checkedCount,
          skippedCount: raceResult.result.skippedCount,
        });
      }

      return jsonMethodNotAllowed('GET, POST');
    }

    const movieApibayMatch = path.match(/^\/api\/movies\/(\d+)\/apibay$/);
    if (movieApibayMatch) {
      if (request.method !== 'GET') {
        return jsonMethodNotAllowed('GET');
      }
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      const params = new URL(request.url).searchParams;
      const title = params.get('title');
      const yearRaw = params.get('year');
      if (!title) {
        return Response.json(
          { error: 'title query param is required' },
          { status: 400 },
        );
      }

      try {
        const query = yearRaw ? `${title} ${yearRaw}` : title;
        const thePirateBay = new ThePirateBayHttpClient((msg) =>
          console.warn(msg),
        );
        const outcome = await thePirateBay.search(query, 'movie');
        if (!outcome.ok) {
          return Response.json(
            { error: thePirateBayErrorMessage(outcome.reason) },
            { status: 502 },
          );
        }
        const { torrents } = outcome;
        torrents.sort((a, b) => b.seeds - a.seeds);
        const withQuality = torrents.map((t) => ({
          ...t,
          resolution: extractResolution(t.title)?.value,
          codec: extractCodec(t.title)?.value,
        }));
        return Response.json({ torrents: withQuality });
      } catch {
        return json500();
      }
    }

    const movieYtsMatch = path.match(/^\/api\/movies\/(\d+)\/yts$/);
    if (movieYtsMatch) {
      if (request.method !== 'GET') {
        return jsonMethodNotAllowed('GET');
      }
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      if (!tmdbMovies) {
        return Response.json(
          { error: 'tmdb is not configured' },
          { status: 409 },
        );
      }

      try {
        const tmdbId = Number(movieYtsMatch[1]);
        const movie = await tmdbMovies.client.getMovie(tmdbId);
        if (!movie) {
          return Response.json(
            { error: 'movie not found on tmdb' },
            { status: 404 },
          );
        }
        if (!movie.imdb_id) {
          return Response.json(
            { error: 'no IMDB id found for this movie on TMDB' },
            { status: 404 },
          );
        }

        const yts = new YtsHttpClient((msg) => console.warn(msg));
        const torrents = await yts.search(movie.imdb_id);
        if (torrents === null) {
          return Response.json(
            { error: 'YTS lookup failed; try again' },
            { status: 502 },
          );
        }
        torrents.sort((a, b) => b.seeds - a.seeds);
        return Response.json({ torrents });
      } catch {
        return json500();
      }
    }

    const movieManualGrabMatch = path.match(
      /^\/api\/movies\/(\d+)\/manual-grab$/,
    );
    if (movieManualGrabMatch) {
      if (request.method !== 'POST') {
        return jsonMethodNotAllowed('POST');
      }
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      if (!downloader) {
        return Response.json(
          { error: 'manual grab is not available' },
          { status: 503 },
        );
      }
      if (!database) {
        return json500();
      }

      let magnetUrl: string;
      let rawTitle: string;
      let source: ManualMovieGrabSource;
      let imdbId: string | null;
      try {
        const body: unknown = await request.json();
        const parsed = expectRecord(body, 'request body');
        magnetUrl = requireNonEmptyString(
          parsed.magnetUrl,
          'request body magnetUrl',
        );
        rawTitle = requireNonEmptyString(
          parsed.rawTitle,
          'request body rawTitle',
        );
        source = requireManualMovieGrabSource(
          parsed.source,
          'request body source',
        );
        imdbId =
          parsed.imdbId === undefined || parsed.imdbId === null
            ? null
            : requireNonEmptyString(parsed.imdbId, 'request body imdbId');
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error ? error.message : 'invalid request body',
          },
          { status: 400 },
        );
      }

      try {
        const tmdbId = Number(movieManualGrabMatch[1]);
        let moviePosterUrl: string | null = null;
        let movieDisplayTitle: string | null = null;
        let movieYear: number | null = null;
        if (tmdbMovies) {
          const movie = await tmdbMovies.client.getMovie(tmdbId);
          if (movie) {
            moviePosterUrl = movie.poster_path
              ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
              : null;
            movieDisplayTitle = movie.title;
            movieYear = movie.release_date
              ? Number(movie.release_date.slice(0, 4))
              : null;
          }
        }

        // Straight to Transmission, no RSS-pipeline policy filtering — same
        // rationale as the TV manual-grab handler: the operator already
        // picked the exact variant they want by eye.
        const result = await downloader.submit({
          downloadUrl: magnetUrl,
          downloadDir:
            activeConfig.transmission.downloadDirs?.movie ??
            activeConfig.transmission.downloadDir ??
            DEFAULT_TRANSMISSION_DOWNLOAD_DIR_MOVIE,
        });
        if (!result.ok) {
          return Response.json({ error: result.message }, { status: 502 });
        }

        const recorded = new ManualMovieGrabsStore(database).record({
          tmdbId,
          imdbId,
          source,
          rawTitle,
          transmissionTorrentHash: result.torrentHash ?? null,
          transmissionTorrentId: result.torrentId ?? null,
          moviePosterUrl,
          movieDisplayTitle,
          movieYear,
        });

        return Response.json({ ok: true, grab: recorded });
      } catch {
        return json500();
      }
    }

    const showDeleteMatch = path.match(/^\/api\/shows\/([^/]+)$/);
    if (showDeleteMatch && request.method === 'DELETE') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      if (!trackedShows) {
        return Response.json(
          { error: 'show tracking is not available' },
          { status: 503 },
        );
      }

      try {
        const slug = decodeURIComponent(showDeleteMatch[1]);
        const existing = trackedShows.getByNormalizedTitleCaseInsensitive(slug);
        if (!existing) {
          return Response.json({ error: 'show not found' }, { status: 404 });
        }
        // Untrack removes the ledger row *and* stops the RSS pipeline from
        // matching new episodes for it — otherwise the next feed poll would
        // just re-create the ledger row via syncTrackedShowsFromConfig.
        // candidate_state/manual_grabs history is left alone either way (see
        // TrackedShowsStore.remove) — this doesn't undo past downloads. If
        // the watchlist can't actually be updated, fail loudly instead of
        // reporting success while the RSS pipeline keeps matching it.
        if (database) {
          const watchlistResult = await removeShowFromWatchlist(
            existing.normalizedTitle,
          );
          if (!watchlistResult.ok) {
            return Response.json(
              { error: watchlistResult.error },
              { status: 500 },
            );
          }
        }
        trackedShows.remove(existing.normalizedTitle);
        return Response.json({ ok: true });
      } catch {
        return json500();
      }
    }

    const showRefreshMatch = path.match(
      /^\/api\/shows\/([^/]+)\/tmdb\/refresh$/,
    );
    if (showRefreshMatch) {
      if (request.method !== 'POST') {
        return jsonMethodNotAllowed('POST');
      }

      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      if (!tmdbShows) {
        return Response.json(
          { error: 'tmdb refresh is not configured' },
          { status: 409 },
        );
      }

      try {
        const slug = decodeURIComponent(showRefreshMatch[1]);
        const candidates = repository.listCandidateStates(
          API_CANDIDATE_LIST_LIMIT,
        );
        const base = buildShowBreakdowns(candidates, trackedNormalizedTitles());
        const withPlex = plexShows
          ? enrichShowBreakdownsFromPlexCache(base, plexShows)
          : base;
        const show =
          withPlex.find(
            (entry) =>
              entry.normalizedTitle.toLowerCase() === slug.toLowerCase(),
          ) ?? null;

        if (!show) {
          return Response.json({ error: 'show not found' }, { status: 404 });
        }

        const refreshed = await refreshShowBreakdown(show, tmdbShows);
        return Response.json({ ok: true, show: refreshed });
      } catch {
        return json500();
      }
    }

    const showPlexRefreshMatch = path.match(
      /^\/api\/shows\/([^/]+)\/plex\/refresh$/,
    );
    if (showPlexRefreshMatch) {
      if (request.method !== 'POST') {
        return jsonMethodNotAllowed('POST');
      }

      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      if (!plexShows) {
        return Response.json(
          { error: 'plex refresh is not configured' },
          { status: 409 },
        );
      }

      try {
        const slug = decodeURIComponent(showPlexRefreshMatch[1]);
        const candidates = repository.listCandidateStates(
          API_CANDIDATE_LIST_LIMIT,
        );
        const base = buildShowBreakdowns(candidates, trackedNormalizedTitles());
        const show =
          base.find(
            (entry) =>
              entry.normalizedTitle.toLowerCase() === slug.toLowerCase(),
          ) ?? null;

        if (!show) {
          return Response.json({ error: 'show not found' }, { status: 404 });
        }

        const refreshed = await refreshPlexShowBreakdown(show, plexShows);

        // Also refresh the deeper per-season completion counts, not just the
        // whole-show flag above — this is the one explicit action that
        // should bring everything up to date, per the operator's own
        // expectation ("as long as when I manually refresh it updates").
        // Best-effort: TMDB not being configured, or this specific walk
        // failing, must not fail the whole-show refresh that already
        // succeeded.
        if (database && tmdbShows) {
          try {
            // buildShowEpisodeStatus needs show.tmdb populated (season
            // count, per-episode air dates) — refreshPlexShowBreakdown only
            // touches the whole-show Plex flag above, so this show has no
            // TMDB data attached yet.
            const [withTmdb] = await enrichShowBreakdowns(
              [refreshed],
              tmdbShows,
            );
            const status = await buildShowEpisodeStatus(withTmdb, {
              tmdb: tmdbShows,
              plex: { client: plexShows.client, cache: plexShows.cache },
              manualGrabs: new ManualGrabsStore(database),
            });
            if (status) {
              persistSeasonCompletions(
                plexShows.cache,
                refreshed.normalizedTitle,
                status,
              );
            }
          } catch {
            // Best-effort — see doc comment above.
          }
        }

        return Response.json({ ok: true, show: refreshed });
      } catch {
        return json500();
      }
    }

    const showEpisodesMatch = path.match(/^\/api\/shows\/([^/]+)\/episodes$/);
    if (showEpisodesMatch) {
      if (request.method !== 'GET') {
        return jsonMethodNotAllowed('GET');
      }

      if (!tmdbShows) {
        return Response.json(
          { error: 'tmdb is not configured' },
          { status: 409 },
        );
      }
      if (!database) {
        return json500();
      }

      try {
        const slug = decodeURIComponent(showEpisodesMatch[1]);
        const show = await findEnrichedShowBySlug(slug);
        if (!show) {
          return Response.json({ error: 'show not found' }, { status: 404 });
        }

        await reconcileShowIfStale(show.normalizedTitle);

        // `?season=` scopes the live Plex+TMDB walk to just that one season
        // (see buildShowEpisodeStatus's doc comment) — the passive per-page-
        // view load path this route serves must stay O(1) regardless of how
        // many seasons a show has. Default to the most recent season when
        // omitted: that's the one an operator opening this page is almost
        // always here to check, and it needs no extra data to compute (just
        // TMDB's already-known numberOfSeasons).
        const seasonParam = new URL(request.url).searchParams.get('season');
        const parsedSeason = seasonParam === null ? NaN : Number(seasonParam);
        const season = Number.isInteger(parsedSeason)
          ? parsedSeason
          : show.tmdb?.numberOfSeasons;

        const status = await buildShowEpisodeStatus(
          show,
          {
            tmdb: tmdbShows,
            plex: plexShows
              ? { client: plexShows.client, cache: plexShows.cache }
              : undefined,
            manualGrabs: new ManualGrabsStore(database),
          },
          { season },
        );
        if (!status) {
          return Response.json(
            { error: 'no tmdb match for this show yet' },
            { status: 409 },
          );
        }
        if (plexShows) {
          persistSeasonCompletions(
            plexShows.cache,
            show.normalizedTitle,
            status,
          );
        }
        return Response.json(status);
      } catch {
        return json500();
      }
    }

    const showEztvMatch = path.match(/^\/api\/shows\/([^/]+)\/eztv$/);
    if (showEztvMatch) {
      if (request.method !== 'GET') {
        return jsonMethodNotAllowed('GET');
      }
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      if (!tmdbShows) {
        return Response.json(
          { error: 'tmdb is not configured' },
          { status: 409 },
        );
      }

      const params = new URL(request.url).searchParams;
      const seasonRaw = params.get('season');
      const episodeRaw = params.get('episode');
      // Number(null) and Number('') both coerce to 0, not NaN — a missing
      // or blank param must not silently pass validation as "season 0".
      const season = !seasonRaw ? Number.NaN : Number(seasonRaw);
      const episode = !episodeRaw ? Number.NaN : Number(episodeRaw);
      if (
        !Number.isInteger(season) ||
        season < 0 ||
        !Number.isInteger(episode) ||
        episode < 0
      ) {
        return Response.json(
          { error: 'season and episode query params are required' },
          { status: 400 },
        );
      }

      try {
        const slug = decodeURIComponent(showEztvMatch[1]);
        const show = await findEnrichedShowBySlug(slug);
        if (!show) {
          return Response.json({ error: 'show not found' }, { status: 404 });
        }
        if (!show.tmdb?.tmdbId) {
          return Response.json(
            { error: 'no tmdb match for this show yet' },
            { status: 409 },
          );
        }

        const externalIds = await tmdbShows.client.getTvExternalIds(
          show.tmdb.tmdbId,
        );
        if (!externalIds) {
          return Response.json(
            { error: 'no IMDB id found for this show on TMDB' },
            { status: 404 },
          );
        }

        const eztv = new EztvHttpClient((msg) => console.warn(msg));
        const torrents = await eztv.getTorrents(externalIds.imdbId, {
          season,
          episode,
        });
        if (torrents === null) {
          return Response.json(
            { error: 'EZTV lookup failed; try again' },
            { status: 502 },
          );
        }

        // Practical downloadability signal, not resolution — a 0-seed 1080p
        // release is worse than a 5-seed 720p one (see grill-me Q5).
        torrents.sort((a, b) => b.seeds - a.seeds);
        const withQuality = torrents.map((t) => ({
          ...t,
          resolution: extractResolution(t.title)?.value,
          codec: extractCodec(t.title)?.value,
        }));
        return Response.json({ torrents: withQuality });
      } catch {
        return json500();
      }
    }

    const showThePirateBayMatch = path.match(
      /^\/api\/shows\/([^/]+)\/thepiratebay$/,
    );
    if (showThePirateBayMatch) {
      if (request.method !== 'GET') {
        return jsonMethodNotAllowed('GET');
      }
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      const params = new URL(request.url).searchParams;
      const seasonRaw = params.get('season');
      const episodeRaw = params.get('episode');
      const season = !seasonRaw ? Number.NaN : Number(seasonRaw);
      const episode = !episodeRaw ? Number.NaN : Number(episodeRaw);
      if (
        !Number.isInteger(season) ||
        season < 0 ||
        !Number.isInteger(episode) ||
        episode < 0
      ) {
        return Response.json(
          { error: 'season and episode query params are required' },
          { status: 400 },
        );
      }

      try {
        const slug = decodeURIComponent(showThePirateBayMatch[1]);
        const show = await findEnrichedShowBySlug(slug);
        if (!show) {
          return Response.json({ error: 'show not found' }, { status: 404 });
        }

        // No TMDB/IMDB dependency, unlike EZTV — apibay is a plain text
        // search, so this works even for a show TMDB hasn't matched yet.
        const displayName = show.tmdb?.name ?? show.normalizedTitle;
        const query = `${displayName} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
        const thePirateBay = new ThePirateBayHttpClient((msg) =>
          console.warn(msg),
        );
        const outcome = await thePirateBay.search(query);
        if (!outcome.ok) {
          return Response.json(
            { error: thePirateBayErrorMessage(outcome.reason) },
            { status: 502 },
          );
        }
        const { torrents } = outcome;

        // Same practical-downloadability ranking as the EZTV route.
        torrents.sort((a, b) => b.seeds - a.seeds);
        const withQuality = torrents.map((t) => ({
          ...t,
          resolution: extractResolution(t.title)?.value,
          codec: extractCodec(t.title)?.value,
        }));
        return Response.json({ torrents: withQuality });
      } catch {
        return json500();
      }
    }

    const showManualGrabMatch = path.match(
      /^\/api\/shows\/([^/]+)\/manual-grab$/,
    );
    if (showManualGrabMatch) {
      if (request.method !== 'POST') {
        return jsonMethodNotAllowed('POST');
      }
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      if (!downloader) {
        return Response.json(
          { error: 'manual grab is not available' },
          { status: 503 },
        );
      }
      if (!database) {
        return json500();
      }

      let season: number;
      let episode: number;
      let magnetUrl: string;
      let rawTitle: string;
      let source: ManualGrabSource;
      try {
        const body: unknown = await request.json();
        const parsed = expectRecord(body, 'request body');
        season = requireInt(parsed.season, 'request body season');
        episode = requireInt(parsed.episode, 'request body episode');
        magnetUrl = requireNonEmptyString(
          parsed.magnetUrl,
          'request body magnetUrl',
        );
        rawTitle = requireNonEmptyString(
          parsed.rawTitle,
          'request body rawTitle',
        );
        // Only the two operator-facing search sources are accepted here —
        // 'adopted-transmission'/'adopted-filesystem' are the reconciler's
        // own internal provenance, never something a grab request chooses.
        // Omitted defaults to 'eztv' for back-compat with callers predating
        // this field.
        source =
          parsed.source === undefined
            ? 'eztv'
            : requireManualGrabSource(parsed.source, 'request body source');
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error ? error.message : 'invalid request body',
          },
          { status: 400 },
        );
      }

      try {
        const slug = decodeURIComponent(showManualGrabMatch[1]);
        const show = await findEnrichedShowBySlug(slug);
        if (!show) {
          return Response.json({ error: 'show not found' }, { status: 404 });
        }

        // Straight to Transmission, no RSS-pipeline policy filtering — the
        // whole point of this path is the operator already picked the
        // variant they want by eye (see grill-me: this bypasses
        // candidate_state/rule matching by design).
        const result = await downloader.submit({
          downloadUrl: magnetUrl,
          downloadDir:
            activeConfig.transmission.downloadDirs?.tv ??
            activeConfig.transmission.downloadDir ??
            DEFAULT_TRANSMISSION_DOWNLOAD_DIR_TV,
        });
        if (!result.ok) {
          return Response.json({ error: result.message }, { status: 502 });
        }

        const recorded = new ManualGrabsStore(database).record({
          normalizedTitle: show.normalizedTitle,
          season,
          episode,
          source,
          rawTitle,
          transmissionTorrentHash: result.torrentHash ?? null,
          transmissionTorrentId: result.torrentId ?? null,
          showPosterUrl: show.tmdb?.posterUrl ?? null,
          showDisplayTitle: show.tmdb?.name ?? show.normalizedTitle,
        });

        return Response.json({ ok: true, grab: recorded });
      } catch {
        return json500();
      }
    }

    if (path === '/api/movies') {
      try {
        const candidates = repository.listCandidateStates();
        const base = buildMovieBreakdowns(candidates);
        const withPlex = plexMovies
          ? enrichMovieBreakdownsFromPlexCache(base, plexMovies)
          : base;
        const movies = tmdbMovies
          ? await enrichMovieBreakdowns(withPlex, tmdbMovies)
          : withPlex;
        return Response.json({ movies });
      } catch {
        return json500();
      }
    }

    if (path === '/api/feeds' && request.method === 'GET') {
      return safeJson(() => {
        const pollState = loadPollState(pollStatePath);
        return {
          feeds: buildFeedStatuses(
            activeConfig.feeds,
            pollState,
            activeConfig.runtime,
          ),
        };
      });
    }

    if (path === '/api/config' && request.method === 'GET') {
      try {
        const redacted = redactConfig(activeConfig);
        return Response.json(redacted, {
          headers: {
            ETag: buildConfigEtag(redacted),
          },
        });
      } catch {
        return json500();
      }
    }

    if (path === '/api/config' && request.method === 'PUT') {
      const writeToken = activeConfig.runtime.apiWriteToken;
      if (!writeToken) {
        return Response.json(
          { error: 'config writes are disabled' },
          { status: 403 },
        );
      }

      const bearer = parseBearerToken(request.headers.get('authorization'));
      if (!bearer) {
        return Response.json(
          { error: 'missing bearer token' },
          { status: 401 },
        );
      }
      if (bearer !== writeToken) {
        return Response.json({ error: 'forbidden' }, { status: 403 });
      }

      const currentEtag = buildConfigEtag(redactConfig(activeConfig));
      const ifMatch = request.headers.get('if-match');
      if (!ifMatch) {
        return Response.json(
          { error: 'if-match header is required' },
          { status: 428, headers: { ETag: currentEtag } },
        );
      }
      if (!ifMatchMatches(ifMatch, currentEtag)) {
        return Response.json(
          { error: 'config revision conflict' },
          { status: 409, headers: { ETag: currentEtag } },
        );
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'invalid json body' }, { status: 400 });
      }

      try {
        const patch = expectRecord(body, 'request body');

        for (const key of Object.keys(patch)) {
          if (key !== 'runtime' && key !== 'tv') {
            throw new ConfigError(
              `Config file "request body ${key}" is not writable; only "runtime" and "tv" are supported.`,
            );
          }
        }
        if (!('runtime' in patch)) {
          throw new ConfigError(
            'Config file "request body" must include "runtime".',
          );
        }
        if (!('tv' in patch)) {
          throw new ConfigError(
            'Config file "request body" must include "tv".',
          );
        }

        const runtimePatch = requireRecord(patch, 'runtime', 'request body');
        const tvPatch = requireRecord(patch, 'tv', 'request body');

        for (const key of Object.keys(tvPatch)) {
          if (key !== 'shows') {
            throw new ConfigError(
              `Config file "request body tv" only allows "shows"; "${key}" is not writable via the API.`,
            );
          }
        }

        const rawShows = tvPatch.shows;
        if (!Array.isArray(rawShows)) {
          throw new ConfigError(
            'Config file "request body tv shows" must be an array of string show names.',
          );
        }
        if (rawShows.length < 1) {
          throw new ConfigError(
            'Config file "request body tv shows" must include at least one show.',
          );
        }

        const showsStrings: string[] = [];
        for (let i = 0; i < rawShows.length; i++) {
          const entry = rawShows[i];
          if (typeof entry !== 'string') {
            throw new ConfigError(
              `Config file "request body tv shows[${i}]" must be a string show name.`,
            );
          }
          const trimmed = entry.trim();
          if (!trimmed) {
            throw new ConfigError(
              `Config file "request body tv shows[${i}]" must be a non-empty show name.`,
            );
          }
          showsStrings.push(trimmed);
        }

        const baseOnDisk = await readConfigFileRecord(configPath);
        const tvDisk = baseOnDisk.tv;
        if (!isRecord(tvDisk)) {
          throw new ConfigError(
            'Config file "config tv" must be an object with "defaults" and "shows".',
          );
        }
        const defaultsOnDisk = tvDisk.defaults;
        if (!isRecord(defaultsOnDisk)) {
          throw new ConfigError(
            'Config file "config tv defaults" must be an object; edit the config file to change defaults.',
          );
        }

        const oldShows = tvDisk.shows;
        if (!Array.isArray(oldShows)) {
          throw new ConfigError(
            'Config file "config tv shows" must be an array.',
          );
        }

        const mergedShows = mergeTvShowsPreservingDiskEntries(
          showsStrings,
          oldShows,
        );

        const merged = {
          ...baseOnDisk,
          runtime: {
            ...(isRecord(baseOnDisk.runtime) ? baseOnDisk.runtime : {}),
            ...runtimePatch,
          },
          tv: {
            defaults: defaultsOnDisk,
            shows: mergedShows,
          },
        };

        const validated = validateConfig(
          merged,
          'config',
          await loadConfigEnv(configPath),
        );
        writeConfigAtomically(configPath, merged);
        activeConfig = validated;
        if (configHolder) {
          configHolder.current = validated;
        }
        // Keep the tracked-show ledger in sync so a show added here (e.g.
        // calendar's "Add show") shows up on /shows immediately, without
        // waiting on an RSS match or a daemon restart.
        if (database && trackedShows) {
          syncTrackedShowsFromConfig(database, validated.tv);
        }

        const redacted = redactConfig(activeConfig);
        return Response.json(redacted, {
          headers: { ETag: buildConfigEtag(redacted) },
        });
      } catch (error) {
        if (error instanceof ConfigError) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        if (error instanceof ConfigWriteError) {
          return jsonConfigWriteFailure();
        }
        return json500();
      }
    }

    if (path === '/api/config/tv/defaults' && request.method === 'PUT') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      const etagError = checkEtag(request, activeConfig);
      if (etagError) return etagError;

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'invalid json body' }, { status: 400 });
      }

      try {
        const defaults: CompactTvDefaults = validateCompactTvDefaults(
          body,
          'request body',
        );

        const baseOnDisk = await readConfigFileRecord(configPath);
        const tvDisk = baseOnDisk.tv;
        if (!isRecord(tvDisk)) {
          throw new ConfigError(
            'Config file "config tv" must be an object with "defaults" and "shows".',
          );
        }

        const merged = {
          ...baseOnDisk,
          tv: {
            ...tvDisk,
            defaults: {
              resolutions: defaults.resolutions,
              codecs: defaults.codecs,
            },
          },
        };

        const validated = validateConfig(
          merged,
          'config',
          await loadConfigEnv(configPath),
        );
        writeConfigAtomically(configPath, merged);
        activeConfig = validated;
        if (configHolder) {
          configHolder.current = validated;
        }

        const redacted = redactConfig(activeConfig);
        return Response.json(redacted, {
          headers: { ETag: buildConfigEtag(redacted) },
        });
      } catch (error) {
        if (error instanceof ConfigError) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        if (error instanceof ConfigWriteError) {
          return jsonConfigWriteFailure();
        }
        return json500();
      }
    }

    if (path === '/api/config/plex' && request.method === 'PUT') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;
      const etagError = checkEtag(request, activeConfig);
      if (etagError) return etagError;

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'invalid json body' }, { status: 400 });
      }

      try {
        const parsed = expectRecord(body, 'request body');
        const plexUrl = requireNonEmptyString(parsed.url, 'request body url');
        activeConfig = await writePlexConfigToDisk({
          configPath,
          configHolder,
          currentConfig: activeConfig,
          patch: { url: plexUrl },
        });

        const redacted = redactConfig(activeConfig);
        return Response.json(redacted, {
          headers: { ETag: buildConfigEtag(redacted) },
        });
      } catch (error) {
        if (error instanceof ConfigError) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        if (error instanceof ConfigWriteError) {
          return jsonConfigWriteFailure();
        }
        return json500();
      }
    }

    if (path === '/api/plex/auth/disconnect' && request.method === 'POST') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;
      const etagError = checkEtag(request, activeConfig);
      if (etagError) return etagError;
      const envToken = process.env.PIRATE_CLAW_PLEX_TOKEN?.trim();
      if (envToken && envToken.length > 0) {
        return Response.json(
          {
            error:
              'Disconnect is blocked because PIRATE_CLAW_PLEX_TOKEN is set in the daemon environment. Remove it to manage Plex auth from the UI.',
          },
          { status: 409 },
        );
      }

      try {
        if (database) {
          new PlexAuthStore(database).disconnect();
        }

        activeConfig = await writePlexConfigToDisk({
          configPath,
          configHolder,
          currentConfig: activeConfig,
          patch: { token: '' },
        });

        const redacted = redactConfig(activeConfig);
        return Response.json(redacted, {
          headers: { ETag: buildConfigEtag(redacted) },
        });
      } catch (error) {
        if (error instanceof ConfigError) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        if (error instanceof ConfigWriteError) {
          return jsonConfigWriteFailure();
        }
        return json500();
      }
    }

    if (path === '/api/plex/auth/manual-token' && request.method === 'POST') {
      // Fallback for when the in-browser/background renewal path (PIN sign-in,
      // silent JWT-based renewal) is unavailable or misbehaving: lets an
      // operator paste a token straight from Plex Web instead. Unlike the
      // OAuth paths, this token is used exactly as given — it must already be
      // a legacy PMS-compatible token, not a JWT (see the /api/v2/devices
      // exchange in refreshPlexAuthToken/exchangePlexPinForAuthToken for why
      // that distinction matters). It's validated against the live PMS before
      // being saved, so a bad paste never silently overwrites a working token.
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;
      const etagError = checkEtag(request, activeConfig);
      if (etagError) return etagError;

      let token: string;
      try {
        const body: unknown = await request.json();
        const parsed = expectRecord(body, 'request body');
        // requireNonEmptyString only rejects an empty string, so a
        // whitespace-only value ("   ") passes it and only becomes empty
        // after trim() — check again post-trim rather than trusting that.
        token = requireNonEmptyString(
          parsed.token,
          'request body token',
        ).trim();
        if (!token) {
          return Response.json(
            { error: 'Plex token is required.' },
            { status: 400 },
          );
        }
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error ? error.message : 'invalid request body',
          },
          { status: 400 },
        );
      }

      if ((token.match(/\./g) ?? []).length >= 2) {
        return Response.json(
          {
            error:
              'That looks like a JWT (three dot-separated segments), not a Plex Media Server token. ' +
              'Copy the short ~20-character X-Plex-Token from Plex Web (Get Info → View XML), not an ' +
              'app.plex.tv browser session token.',
          },
          { status: 400 },
        );
      }

      const plexUrl = activeConfig.plex?.url ?? 'http://localhost:32400';
      console.log(`[plex-auth] manual token probe starting against ${plexUrl}`);
      try {
        const probeResponse = await loggedFetch(
          `${plexUrl.replace(/\/$/, '')}/identity`,
          { headers: { 'X-Plex-Token': token, Accept: 'application/json' } },
          { source: 'plex', label: 'manual-token-probe' },
        );

        if (probeResponse.status === 401) {
          console.warn(
            `[plex-auth] manual token probe rejected (401) by ${plexUrl}`,
          );
          return Response.json(
            {
              error: `Plex Media Server rejected this token (401) at ${plexUrl}. Confirm the token and the Plex Media Server URL are both correct.`,
            },
            { status: 400 },
          );
        }
        if (!probeResponse.ok) {
          console.warn(
            `[plex-auth] manual token probe failed status=${probeResponse.status} url=${plexUrl}`,
          );
          return Response.json(
            {
              error: `Could not validate the token against ${plexUrl} (HTTP ${probeResponse.status}).`,
            },
            { status: 400 },
          );
        }
        console.log(
          `[plex-auth] manual token probe succeeded against ${plexUrl}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `[plex-auth] manual token probe could not reach ${plexUrl}: ${message}`,
        );
        return Response.json(
          {
            error: `Could not reach Plex Media Server at ${plexUrl} to validate the token: ${message}`,
          },
          { status: 400 },
        );
      }

      try {
        activeConfig = await writePlexTokenToConfig({
          authToken: token,
          configPath,
          currentConfig: activeConfig,
          configHolder,
        });

        if (database) {
          // completeRenewal (not clearRenewalState) — this token was just
          // verified against the live PMS, i.e. exactly what a successful
          // OAuth renewal represents, so it should update
          // last_authenticated_at the same way and not leave it stale.
          new PlexAuthStore(database).completeRenewal(token, {
            authenticatedAt: new Date().toISOString(),
          });
        }

        console.log('[plex-auth] manual token saved and marked connected');
        const redacted = redactConfig(activeConfig);
        return Response.json(redacted, {
          headers: { ETag: buildConfigEtag(redacted) },
        });
      } catch (error) {
        if (error instanceof ConfigError) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        if (error instanceof ConfigWriteError) {
          return jsonConfigWriteFailure();
        }
        return json500();
      }
    }

    if (path === '/api/plex/auth/cancel' && request.method === 'POST') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;
      if (!database) {
        return json500();
      }

      try {
        // Cancelling an in-flight browser sign-in must not disturb the stored
        // credential: only the pending session row is retired. Wiping the
        // config token here (as /disconnect does) would destroy a working
        // connection just because the operator backed out of a new sign-in.
        const store = new PlexAuthStore(database);
        const snapshot = store.getSnapshot();
        if (snapshot.pendingSession) {
          store.cancelSession(snapshot.pendingSession.id);
        }

        const redacted = redactConfig(activeConfig);
        return Response.json(redacted, {
          headers: { ETag: buildConfigEtag(redacted) },
        });
      } catch {
        return json500();
      }
    }

    if (path === '/api/config/movies' && request.method === 'PUT') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      const etagError = checkEtag(request, activeConfig);
      if (etagError) return etagError;

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'invalid json body' }, { status: 400 });
      }

      try {
        if (!isRecord(body)) {
          throw new ConfigError(
            'Config file "request body" must be an object.',
          );
        }
        if (!('codecPolicy' in body)) {
          throw new ConfigError(
            'Config file "request body movies" codecPolicy is required.',
          );
        }

        const movies = validateMoviePolicy(body, 'request body');

        const baseOnDisk = await readConfigFileRecord(configPath);
        const merged = {
          ...baseOnDisk,
          movies: {
            years: movies.years,
            resolutions: movies.resolutions,
            codecs: movies.codecs,
            codecPolicy: movies.codecPolicy,
          },
        };

        const validated = validateConfig(
          merged,
          'config',
          await loadConfigEnv(configPath),
        );
        writeConfigAtomically(configPath, merged);
        activeConfig = validated;
        if (configHolder) {
          configHolder.current = validated;
        }

        const redacted = redactConfig(activeConfig);
        return Response.json(redacted, {
          headers: { ETag: buildConfigEtag(redacted) },
        });
      } catch (error) {
        if (error instanceof ConfigError) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        if (error instanceof ConfigWriteError) {
          return jsonConfigWriteFailure();
        }
        return json500();
      }
    }

    if (path === '/api/config/tmdb' && request.method === 'PUT') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      const etagError = checkEtag(request, activeConfig);
      if (etagError) return etagError;

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'invalid json body' }, { status: 400 });
      }

      try {
        const patch = expectRecord(body, 'request body');
        const baseOnDisk = await readConfigFileRecord(configPath);
        const currentTmdb = isRecord(baseOnDisk.tmdb) ? baseOnDisk.tmdb : {};
        const apiKey =
          typeof patch.apiKey === 'string' && patch.apiKey.trim().length > 0
            ? patch.apiKey.trim()
            : currentTmdb.apiKey;
        const nextTmdbInput = {
          ...currentTmdb,
          ...patch,
          ...(apiKey === undefined ? {} : { apiKey }),
        };
        const tmdbPatch = validateTmdbConfig(nextTmdbInput, 'request body');

        const merged = {
          ...baseOnDisk,
          tmdb: {
            ...currentTmdb,
            ...(tmdbPatch.apiKey === undefined
              ? {}
              : { apiKey: tmdbPatch.apiKey }),
            ...(tmdbPatch.cacheTtlDays === undefined
              ? {}
              : { cacheTtlDays: tmdbPatch.cacheTtlDays }),
            ...(tmdbPatch.negativeCacheTtlDays === undefined
              ? {}
              : { negativeCacheTtlDays: tmdbPatch.negativeCacheTtlDays }),
          },
        };

        const validated = validateConfig(
          merged,
          'config',
          await loadConfigEnv(configPath),
        );
        writeConfigAtomically(configPath, merged);
        activeConfig = validated;
        if (configHolder) {
          configHolder.current = validated;
        }

        const redacted = redactConfig(activeConfig);
        return Response.json(redacted, {
          headers: { ETag: buildConfigEtag(redacted) },
        });
      } catch (error) {
        if (error instanceof ConfigError) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        if (error instanceof ConfigWriteError) {
          return jsonConfigWriteFailure();
        }
        return json500();
      }
    }

    if (
      path === '/api/config/transmission/download-dirs' &&
      request.method === 'PUT'
    ) {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      const etagError = checkEtag(request, activeConfig);
      if (etagError) return etagError;

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'invalid json body' }, { status: 400 });
      }

      try {
        if (!isRecord(body)) {
          throw new ConfigError(
            'Config file "request body" must be an object.',
          );
        }

        const allowed = new Set(['tv', 'movie']);
        for (const key of Object.keys(body)) {
          if (!allowed.has(key)) {
            throw new ConfigError(
              `Config file "request body downloadDirs" has unknown key "${key}"; expected only "movie" and/or "tv".`,
            );
          }
        }

        const tvDir =
          body.tv === undefined
            ? undefined
            : typeof body.tv === 'string'
              ? body.tv
              : (() => {
                  throw new ConfigError(
                    'Config file "request body downloadDirs tv" must be a string.',
                  );
                })();
        const movieDir =
          body.movie === undefined
            ? undefined
            : typeof body.movie === 'string'
              ? body.movie
              : (() => {
                  throw new ConfigError(
                    'Config file "request body downloadDirs movie" must be a string.',
                  );
                })();

        const baseOnDisk = await readConfigFileRecord(configPath);
        const existingTransmission = isRecord(baseOnDisk.transmission)
          ? baseOnDisk.transmission
          : {};
        const downloadDirs: Record<string, string> = {};
        if (tvDir !== undefined) downloadDirs.tv = tvDir;
        if (movieDir !== undefined) downloadDirs.movie = movieDir;

        const nextTransmission = {
          ...existingTransmission,
          ...(Object.keys(downloadDirs).length > 0
            ? { downloadDirs }
            : { downloadDirs: undefined }),
        };
        if (nextTransmission.downloadDirs === undefined) {
          delete nextTransmission.downloadDirs;
        }

        const merged = {
          ...baseOnDisk,
          transmission: nextTransmission,
        };

        const validated = validateConfig(
          merged,
          'config',
          await loadConfigEnv(configPath),
        );
        writeConfigAtomically(configPath, merged);
        activeConfig = validated;
        if (configHolder) {
          configHolder.current = validated;
        }

        const redacted = redactConfig(activeConfig);
        return Response.json(redacted, {
          headers: { ETag: buildConfigEtag(redacted) },
        });
      } catch (error) {
        if (error instanceof ConfigError) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        if (error instanceof ConfigWriteError) {
          return jsonConfigWriteFailure();
        }
        return json500();
      }
    }

    if (path === '/api/config/feeds' && request.method === 'PUT') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      const etagError = checkEtag(request, activeConfig);
      if (etagError) return etagError;

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'invalid json body' }, { status: 400 });
      }

      try {
        if (!Array.isArray(body)) {
          throw new ConfigError(
            'Config file "request body feeds" must be an array.',
          );
        }

        const feeds = body.map((entry, index) =>
          validateFeed(entry, 'request body', index),
        );

        const baseOnDisk = await readConfigFileRecord(configPath);
        const feedsOnDisk = Array.isArray(baseOnDisk.feeds)
          ? (baseOnDisk.feeds as Array<{ url?: unknown }>)
          : [];
        const existingUrls = new Set(
          feedsOnDisk.map((f) => (typeof f.url === 'string' ? f.url : '')),
        );

        for (const feed of feeds) {
          if (existingUrls.has(feed.url)) continue;
          let fetchOk = false;
          try {
            const res = await loggedFetch(
              feed.url,
              {
                signal: AbortSignal.timeout(10_000),
              },
              { source: 'feed', label: `${feed.name} (validate)` },
            );
            fetchOk = res.ok;
          } catch {
            fetchOk = false;
          }
          if (!fetchOk) {
            return Response.json(
              {
                error: `feed URL did not return a successful response: ${feed.url}`,
              },
              { status: 400 },
            );
          }
        }

        const merged = {
          ...baseOnDisk,
          feeds: feeds.map((f) => {
            const entry: Record<string, unknown> = {
              name: f.name,
              url: f.url,
              mediaType: f.mediaType,
            };
            if (f.parserHints !== undefined) entry.parserHints = f.parserHints;
            if (f.pollIntervalMinutes !== undefined)
              entry.pollIntervalMinutes = f.pollIntervalMinutes;
            return entry;
          }),
        };

        const validated = validateConfig(
          merged,
          'config',
          await loadConfigEnv(configPath),
        );
        writeConfigAtomically(configPath, merged);
        activeConfig = validated;
        if (configHolder) {
          configHolder.current = validated;
        }

        const redacted = redactConfig(activeConfig);
        return Response.json(redacted, {
          headers: { ETag: buildConfigEtag(redacted) },
        });
      } catch (error) {
        if (error instanceof ConfigError) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        if (error instanceof ConfigWriteError) {
          return jsonConfigWriteFailure();
        }
        return json500();
      }
    }

    if (path === '/api/outcomes' && request.method === 'GET') {
      const status = new URL(request.url).searchParams.get('status');
      // Preferred: failed_enqueue. Legacy: skipped_no_match (Phase 15 query-param name).
      // Payload: deduped Transmission enqueue failures for matched candidates still in `failed` state.
      if (status !== 'failed_enqueue' && status !== 'skipped_no_match') {
        return Response.json(
          { error: 'unsupported status filter' },
          { status: 400 },
        );
      }
      const outcomes = repository.listRecentFeedItemOutcomesForReview(30);
      return safeJson(() => ({ outcomes }));
    }

    if (path === '/api/transmission/torrents' && request.method === 'GET') {
      const candidates = repository.listCandidateStates(
        API_CANDIDATE_LIST_LIMIT,
      );
      const candidateHashes = candidates
        .filter(
          (c) =>
            c.transmissionTorrentHash !== undefined &&
            c.pirateClawDisposition === undefined,
        )
        .map((c) => c.transmissionTorrentHash as string);
      // Manual grabs deliberately never write to candidate_state (see
      // manual-grabs/schema.ts), so without this they'd download for real
      // in Transmission but never show up here — surfacing as "the Grab
      // button did nothing" even on a genuine success.
      const manualGrabsStore = database ? new ManualGrabsStore(database) : null;
      const manualGrabDisplayInfoAll =
        manualGrabsStore?.listAllTorrentDisplayInfo() ?? new Map();
      // Same rationale, movie-shaped: manual_movie_grabs never writes to
      // candidate_state either (see manual-movie-grabs/schema.ts).
      const manualMovieGrabsStore = database
        ? new ManualMovieGrabsStore(database)
        : null;
      const manualMovieGrabDisplayInfoAll =
        manualMovieGrabsStore?.listAllTorrentDisplayInfo() ?? new Map();
      // A disposed (removed/deleted) manual grab shouldn't stay in the
      // live-lookup hash set — mirrors candidateHashes excluding disposed
      // candidates above. Its torrent is already gone from Transmission
      // either way; this just stops querying for it forever.
      const manualGrabDisplayInfo = new Map(
        Array.from(manualGrabDisplayInfoAll).filter(
          ([, info]) => info.disposition === null,
        ),
      );
      const manualMovieGrabDisplayInfo = new Map(
        Array.from(manualMovieGrabDisplayInfoAll).filter(
          ([, info]) => info.disposition === null,
        ),
      );
      const hashes = Array.from(
        new Set([
          ...candidateHashes,
          ...manualGrabDisplayInfo.keys(),
          ...manualMovieGrabDisplayInfo.keys(),
        ]),
      );

      if (hashes.length === 0) {
        return Response.json({ torrents: [] });
      }

      const result = await fetchTorrentStats(activeConfig.transmission, hashes);

      if (!result.ok) {
        return Response.json(
          { error: 'transmission unavailable', detail: result.message },
          { status: 502 },
        );
      }

      // First-observed-completion bookkeeping for manual grabs — see
      // done_at's schema comment. Transmission's own doneDate is the source
      // of truth when present (a torrent added already-complete never sets
      // it, so this falls back to "now": the first moment pirate-claw itself
      // observed 100%, which is the best available estimate). Fire-and-check
      // per response is fine: markDone is a no-op once done_at is set.
      for (const t of result.torrents) {
        if (t.percentDone !== 1) continue;
        if (manualGrabDisplayInfo.has(t.hash)) {
          manualGrabsStore!.markDone(
            t.hash,
            t.doneDate ?? new Date().toISOString(),
          );
        } else if (manualMovieGrabDisplayInfo.has(t.hash)) {
          manualMovieGrabsStore!.markDone(
            t.hash,
            t.doneDate ?? new Date().toISOString(),
          );
        }
      }

      const hashSet = new Set(hashes);
      // Also has no candidate_state row, so no poster/title from the usual
      // lookup — attach what was captured at grab time instead (see
      // manual-grabs/schema.ts). mediaType/season/episode ride along too —
      // the dashboard uses these for a manually-grabbed row's meta chips,
      // the same way it would for a candidate_state-backed row.
      // normalizedTitle deliberately isn't attached here — Your Haul's
      // manual-grab link is built from GET /api/manual-grabs/completed
      // instead (see +page.svelte), which is where that's actually used.
      const torrents = result.torrents
        .filter((t) => hashSet.has(t.hash))
        .map((t) => {
          const showGrabInfo = manualGrabDisplayInfo.get(t.hash);
          if (showGrabInfo) {
            return {
              ...t,
              posterUrl: showGrabInfo.posterUrl,
              displayTitle: showGrabInfo.displayTitle,
              mediaType: 'tv' as const,
              season: showGrabInfo.season,
              episode: showGrabInfo.episode,
              // How this torrent got here — see TorrentManagerCard's origin
              // icon. Absent entirely for a candidate_state (RSS) torrent;
              // the frontend infers "RSS" from having a matching candidate
              // instead, so no separate marker is needed for that case.
              source: showGrabInfo.source,
            };
          }
          const movieGrabInfo = manualMovieGrabDisplayInfo.get(t.hash);
          if (movieGrabInfo) {
            return {
              ...t,
              posterUrl: movieGrabInfo.posterUrl,
              displayTitle: movieGrabInfo.displayTitle,
              mediaType: 'movie' as const,
              source: movieGrabInfo.source,
            };
          }
          return t;
        });
      return Response.json({ torrents });
    }

    if (path === '/api/manual-grabs/completed' && request.method === 'GET') {
      // The manual-grab-sourced half of Your Haul (see +page.svelte) — does
      // NOT depend on Transmission or the torrent still being present there,
      // unlike /api/transmission/torrents above. Sourced entirely from
      // done_at, written once by that endpoint the first time it observes a
      // manual grab's torrent at 100% (see done_at's schema comment).
      const showItems = database
        ? Array.from(
            new ManualGrabsStore(database).listCompleted(),
            ([hash, info]) => ({
              hash,
              mediaType: 'tv' as const,
              posterUrl: info.posterUrl,
              displayTitle: info.displayTitle,
              normalizedTitle: info.normalizedTitle,
              season: info.season,
              episode: info.episode,
              doneAt: info.doneAt,
            }),
          )
        : [];
      const movieItems = database
        ? Array.from(
            new ManualMovieGrabsStore(database).listCompleted(),
            ([hash, info]) => ({
              hash,
              mediaType: 'movie' as const,
              posterUrl: info.posterUrl,
              displayTitle: info.displayTitle,
              doneAt: info.doneAt,
            }),
          )
        : [];
      return Response.json({ items: [...showItems, ...movieItems] });
    }

    if (path === '/api/manual-grabs/tracked' && request.method === 'GET') {
      // The manual-grab equivalent of GET /api/candidates: every manual grab
      // that still has a hash, regardless of whether Transmission currently
      // has it — unlike /api/transmission/torrents (which only returns
      // torrents Transmission actually answered for), this is sourced
      // straight from the DB. The dashboard diffs this against the live
      // hash set from /api/transmission/torrents to detect a manual grab
      // gone missing, the same way it already does for candidate_state rows
      // (see torrentDisplayState/missingCandidates in +page.svelte).
      const showItems = database
        ? Array.from(
            new ManualGrabsStore(database).listAllTorrentDisplayInfo(),
            ([hash, info]) => ({
              hash,
              mediaType: 'tv' as const,
              posterUrl: info.posterUrl,
              displayTitle: info.displayTitle,
              normalizedTitle: info.normalizedTitle,
              season: info.season,
              episode: info.episode,
              source: info.source,
              disposition: info.disposition,
            }),
          )
        : [];
      const movieItems = database
        ? Array.from(
            new ManualMovieGrabsStore(database).listAllTorrentDisplayInfo(),
            ([hash, info]) => ({
              hash,
              mediaType: 'movie' as const,
              posterUrl: info.posterUrl,
              displayTitle: info.displayTitle,
              source: info.source,
              disposition: info.disposition,
            }),
          )
        : [];
      return Response.json({ items: [...showItems, ...movieItems] });
    }

    if (path === '/api/transmission/session' && request.method === 'GET') {
      const result = await fetchSessionInfo(activeConfig.transmission);

      if (!result.ok) {
        return Response.json(
          { error: 'transmission unavailable', detail: result.message },
          { status: 502 },
        );
      }

      return Response.json(result.session);
    }

    if (
      path === '/api/transmission/queue-settings' &&
      request.method === 'PUT'
    ) {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      let parsed: unknown;
      try {
        parsed = await request.json();
      } catch {
        return Response.json(
          { error: 'request body must be valid JSON' },
          { status: 400 },
        );
      }
      if (!parsed || typeof parsed !== 'object') {
        return Response.json(
          { error: 'request body must be a JSON object' },
          { status: 400 },
        );
      }
      const record = parsed as Record<string, unknown>;
      const input: {
        downloadQueueEnabled?: boolean;
        downloadQueueSize?: number;
        seedQueueEnabled?: boolean;
        seedQueueSize?: number;
      } = {};
      for (const [key, sizeKey] of [
        ['downloadQueueEnabled', 'downloadQueueSize'],
        ['seedQueueEnabled', 'seedQueueSize'],
      ] as const) {
        if (record[key] !== undefined) {
          if (typeof record[key] !== 'boolean') {
            return Response.json(
              { error: `"${key}" must be a boolean` },
              { status: 400 },
            );
          }
          input[key] = record[key] as boolean;
        }
        if (record[sizeKey] !== undefined) {
          const size = record[sizeKey];
          if (typeof size !== 'number' || !Number.isInteger(size) || size < 0) {
            return Response.json(
              { error: `"${sizeKey}" must be a non-negative integer` },
              { status: 400 },
            );
          }
          input[sizeKey] = size;
        }
      }

      const rpc = await setTransmissionQueueSettings(
        activeConfig.transmission,
        input,
      );
      if (!rpc.ok) {
        return Response.json({ error: rpc.message }, { status: 502 });
      }
      return Response.json({ ok: true });
    }

    if (
      path === '/api/transmission/torrent/pause' &&
      request.method === 'POST'
    ) {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      const body = await parseJsonTorrentHash(request);
      if (!body.ok) return body.response;

      const ctx = await resolveManagedTorrentAction(
        repository,
        activeConfig.transmission,
        body.hash,
        database ? new ManualGrabsStore(database) : undefined,
        database ? new ManualMovieGrabsStore(database) : undefined,
      );
      if (!ctx.ok) return ctx.response;
      if (ctx.rowState !== 'downloading' && ctx.rowState !== 'seeding') {
        return Response.json(
          { error: 'torrent is not in a state that can be paused' },
          { status: 400 },
        );
      }

      const rpc = await pauseTorrent(activeConfig.transmission, body.hash);
      if (!rpc.ok) {
        return Response.json({ error: rpc.message }, { status: 502 });
      }
      return Response.json({ ok: true });
    }

    if (
      path === '/api/transmission/torrent/resume' &&
      request.method === 'POST'
    ) {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      const body = await parseJsonTorrentHash(request);
      if (!body.ok) return body.response;

      const ctx = await resolveManagedTorrentAction(
        repository,
        activeConfig.transmission,
        body.hash,
        database ? new ManualGrabsStore(database) : undefined,
        database ? new ManualMovieGrabsStore(database) : undefined,
      );
      if (!ctx.ok) return ctx.response;
      if (ctx.rowState !== 'paused') {
        return Response.json(
          { error: 'torrent is not in a state that can be resumed' },
          { status: 400 },
        );
      }

      const rpc = await resumeTorrent(activeConfig.transmission, body.hash);
      if (!rpc.ok) {
        return Response.json({ error: rpc.message }, { status: 502 });
      }
      return Response.json({ ok: true });
    }

    if (
      path === '/api/transmission/torrent/resume-now' &&
      request.method === 'POST'
    ) {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      const body = await parseJsonTorrentHash(request);
      if (!body.ok) return body.response;

      const ctx = await resolveManagedTorrentAction(
        repository,
        activeConfig.transmission,
        body.hash,
        database ? new ManualGrabsStore(database) : undefined,
        database ? new ManualMovieGrabsStore(database) : undefined,
      );
      if (!ctx.ok) return ctx.response;
      // Unlike plain resume, this also applies to 'queued' — the whole
      // point is bypassing the queue cap that's holding it there.
      if (ctx.rowState !== 'paused' && ctx.rowState !== 'queued') {
        return Response.json(
          { error: 'torrent is not in a state that can be resumed' },
          { status: 400 },
        );
      }

      const rpc = await resumeTorrentNow(activeConfig.transmission, body.hash);
      if (!rpc.ok) {
        return Response.json({ error: rpc.message }, { status: 502 });
      }
      return Response.json({ ok: true });
    }

    if (
      path === '/api/transmission/torrent/remove' &&
      request.method === 'POST'
    ) {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      const body = await parseJsonTorrentHash(request);
      if (!body.ok) return body.response;

      const manualGrabs = database ? new ManualGrabsStore(database) : undefined;
      const manualMovieGrabs = database
        ? new ManualMovieGrabsStore(database)
        : undefined;
      const ctx = await resolveManagedTorrentAction(
        repository,
        activeConfig.transmission,
        body.hash,
        manualGrabs,
        manualMovieGrabs,
      );
      if (!ctx.ok) return ctx.response;
      if (ctx.rowState === 'missing') {
        return Response.json(
          {
            error: 'torrent is missing from Transmission; use dispose instead',
          },
          { status: 400 },
        );
      }

      const rpc = await removeTorrent(
        activeConfig.transmission,
        body.hash,
        false,
      );
      if (!rpc.ok) {
        return Response.json({ error: rpc.message }, { status: 502 });
      }

      if (
        ctx.candidate &&
        (ctx.rowState === 'downloading' ||
          ctx.rowState === 'seeding' ||
          ctx.rowState === 'queued' ||
          ctx.rowState === 'paused' ||
          ctx.rowState === 'completed')
      ) {
        repository.setPirateClawDisposition(
          ctx.candidate.identityKey,
          'removed',
        );
      } else if (!ctx.candidate) {
        // No candidate_state row — this is a manual-grab-only torrent (see
        // resolveManagedTorrentAction). It has its own disposition column
        // now (manual_grabs/manual_movie_grabs.disposition) instead of being
        // left an unresolvable zombie row once Transmission no longer has
        // it.
        manualGrabs?.setDisposition(body.hash, 'removed');
        manualMovieGrabs?.setDisposition(body.hash, 'removed');
      }

      return Response.json({ ok: true });
    }

    if (
      path === '/api/transmission/torrent/remove-and-delete' &&
      request.method === 'POST'
    ) {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      const body = await parseJsonTorrentHash(request);
      if (!body.ok) return body.response;

      const manualGrabs = database ? new ManualGrabsStore(database) : undefined;
      const manualMovieGrabs = database
        ? new ManualMovieGrabsStore(database)
        : undefined;
      const ctx = await resolveManagedTorrentAction(
        repository,
        activeConfig.transmission,
        body.hash,
        manualGrabs,
        manualMovieGrabs,
      );
      if (!ctx.ok) return ctx.response;
      if (ctx.rowState === 'missing') {
        return Response.json(
          {
            error: 'torrent is missing from Transmission; use dispose instead',
          },
          { status: 400 },
        );
      }

      const rpc = await removeTorrent(
        activeConfig.transmission,
        body.hash,
        true,
      );
      if (!rpc.ok) {
        return Response.json({ error: rpc.message }, { status: 502 });
      }

      if (ctx.candidate) {
        repository.setPirateClawDisposition(
          ctx.candidate.identityKey,
          'deleted',
        );
      } else {
        // See the remove handler's comment above — manual grabs get the
        // same disposition tracking now instead of a permanent zombie row.
        manualGrabs?.setDisposition(body.hash, 'deleted');
        manualMovieGrabs?.setDisposition(body.hash, 'deleted');
      }

      return Response.json({ ok: true });
    }

    if (
      path === '/api/transmission/torrent/dispose' &&
      request.method === 'POST'
    ) {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      const body = await parseJsonDisposeBody(request);
      if (!body.ok) return body.response;

      // Manual grabs now have the same "missing from Transmission, needs a
      // human to resolve it" concept candidate_state has (disposition
      // column added alongside candidate_state.pirate_claw_disposition —
      // see manual-grabs/schema.ts), so they get the same fallback pause/
      // resume/remove already use.
      const manualGrabs = database ? new ManualGrabsStore(database) : undefined;
      const manualMovieGrabs = database
        ? new ManualMovieGrabsStore(database)
        : undefined;
      const ctx = await resolveManagedTorrentAction(
        repository,
        activeConfig.transmission,
        body.hash,
        manualGrabs,
        manualMovieGrabs,
      );
      if (!ctx.ok) return ctx.response;
      if (ctx.rowState !== 'missing') {
        return Response.json(
          {
            error:
              'dispose is only valid when the torrent is missing from Transmission',
          },
          { status: 400 },
        );
      }

      if (ctx.candidate) {
        repository.setPirateClawDisposition(
          ctx.candidate.identityKey,
          body.disposition,
        );
      } else if (
        manualGrabs?.hasTorrentHash(body.hash) ||
        manualMovieGrabs?.hasTorrentHash(body.hash)
      ) {
        manualGrabs?.setDisposition(body.hash, body.disposition);
        manualMovieGrabs?.setDisposition(body.hash, body.disposition);
      } else {
        return json500();
      }
      return Response.json({ ok: true });
    }

    if (
      path === '/api/transmission/torrents/auto-reconcile' &&
      request.method === 'POST'
    ) {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      return autoReconcileMissingTorrents();
    }

    if (path === '/api/transmission/ping' && request.method === 'POST') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      const result = await fetchSessionInfo(activeConfig.transmission);
      if (!result.ok) {
        return Response.json(
          { ok: false, error: result.message },
          { status: 502 },
        );
      }
      return Response.json({ ok: true, version: result.session.version });
    }

    if (path === '/api/daemon/restart' && request.method === 'POST') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      let restartStatus;
      try {
        restartStatus = await recordRestartRequested(
          activeConfig.runtime.artifactDir,
          health.startedAt,
        );
      } catch {
        return json500();
      }

      // This endpoint only requests a SIGTERM exit. The reviewed Synology
      // Docker restart policy is responsible for bringing the daemon back.
      queueMicrotask(() => process.kill(process.pid, 'SIGTERM'));
      return Response.json({ ok: true, restartStatus });
    }

    return Response.json({ error: 'not found' }, { status: 404 });
  };
}

// --- Candidate visibility ---

// A candidate is visible when it has no disposition, or when it was removed
// after being queued (history rows remain visible even if reconcile later drops
// completion telemetry like percentDone/doneDate).
function isCandidateVisible(c: CandidateStateRecord): boolean {
  const isCompleted =
    c.transmissionPercentDone === 1 || c.transmissionDoneDate !== undefined;
  if (!c.pirateClawDisposition) return true;
  if (
    c.pirateClawDisposition === 'removed' &&
    (isCompleted || c.queuedAt !== undefined)
  )
    return true;
  return false;
}

// --- Show breakdowns ---

export function buildShowBreakdowns(
  candidates: CandidateStateRecord[],
  /**
   * `undefined` means "no tracked-show ledger available" — every candidate-
   * derived show is shown, unfiltered (back-compat for callers/tests without
   * a TrackedShowsStore). A defined array (including an empty one) means the
   * ledger IS the authority: every tracked show is seeded even with zero
   * candidates, and any candidate-derived show NOT in this list is dropped —
   * otherwise "Untrack show" would be a no-op for any show that ever had a
   * real RSS match, since its candidate_state history would keep rebuilding
   * a showMap entry for it regardless of ledger membership.
   */
  trackedNormalizedTitles?: string[],
): ShowBreakdown[] {
  const tvCandidates = candidates
    .filter(isCandidateVisible)
    .filter((c) => c.mediaType === 'tv');

  const showMap = new Map<string, Map<number, ShowEpisode[]>>();

  for (const c of tvCandidates) {
    if (c.season === undefined || c.episode === undefined) {
      continue;
    }

    const title = c.normalizedTitle;
    if (!showMap.has(title)) {
      showMap.set(title, new Map());
    }
    const seasonMap = showMap.get(title)!;
    const season = c.season;
    if (!seasonMap.has(season)) {
      seasonMap.set(season, []);
    }
    seasonMap.get(season)!.push({
      episode: c.episode,
      identityKey: c.identityKey,
      status: c.status,
      pirateClawDisposition: c.pirateClawDisposition,
      queuedAt: c.queuedAt,
      resolution: c.resolution,
      codec: c.codec,
      transmissionPercentDone: c.transmissionPercentDone,
      transmissionStatusCode: c.transmissionStatusCode,
      transmissionTorrentHash: c.transmissionTorrentHash,
    });
  }

  // Seed every tracked show, even with zero candidates — a show that's
  // tracked but hasn't had an RSS match yet (e.g. added after its season
  // already aired) must still show up so TMDB enrichment and manual grab
  // work on it, not just shows the RSS pipeline happened to match. A
  // candidate's normalizedTitle comes from an actual feed item's raw title,
  // not from config — its casing can differ from the tracked ledger's
  // (derived from the configured show name). Re-key to the ledger's casing
  // whenever a case-insensitive match already exists, so a tracked show
  // never splits into two entries and every downstream lookup keyed by
  // `show.normalizedTitle` (manual grabs, reconciliation, the ledger itself)
  // agrees on one canonical casing.
  if (trackedNormalizedTitles !== undefined) {
    for (const title of trackedNormalizedTitles) {
      const existingKey = Array.from(showMap.keys()).find(
        (key) => key.toLowerCase() === title.toLowerCase(),
      );
      if (existingKey !== undefined) {
        if (existingKey !== title) {
          const seasons = showMap.get(existingKey)!;
          showMap.delete(existingKey);
          showMap.set(title, seasons);
        }
        continue;
      }
      showMap.set(title, new Map());
    }

    // The ledger is authoritative once it exists: drop any candidate-derived
    // show that isn't (or is no longer) tracked, so untracking a show that
    // already has RSS history actually removes it from view instead of it
    // reappearing from candidate_state alone.
    const trackedLower = new Set(
      trackedNormalizedTitles.map((t) => t.toLowerCase()),
    );
    for (const key of Array.from(showMap.keys())) {
      if (!trackedLower.has(key.toLowerCase())) {
        showMap.delete(key);
      }
    }
  }

  const shows: ShowBreakdown[] = [];
  for (const [title, seasonMap] of showMap) {
    const seasons: ShowSeason[] = [];
    for (const [season, episodes] of seasonMap) {
      episodes.sort((a, b) => a.episode - b.episode);
      seasons.push({ season, episodes });
    }
    seasons.sort((a, b) => a.season - b.season);
    shows.push({
      normalizedTitle: title,
      seasons,
      plexStatus: 'unknown',
      watchCount: null,
      lastWatchedAt: null,
    });
  }

  return shows.sort((a, b) =>
    a.normalizedTitle.localeCompare(b.normalizedTitle),
  );
}

// --- Movie breakdowns ---

export function buildMovieBreakdowns(
  candidates: CandidateStateRecord[],
): MovieBreakdown[] {
  return candidates
    .filter(isCandidateVisible)
    .filter((c) => c.mediaType === 'movie')
    .map((c) => ({
      normalizedTitle: c.normalizedTitle,
      year: c.year,
      resolution: c.resolution,
      codec: c.codec,
      identityKey: c.identityKey,
      status: c.status,
      pirateClawDisposition: c.pirateClawDisposition,
      queuedAt: c.queuedAt,
      transmissionPercentDone: c.transmissionPercentDone,
      transmissionStatusCode: c.transmissionStatusCode,
      transmissionTorrentHash: c.transmissionTorrentHash,
      plexStatus: 'unknown' as const,
      watchCount: null,
      lastWatchedAt: null,
    }))
    .sort((a, b) => a.normalizedTitle.localeCompare(b.normalizedTitle));
}

// --- Feed statuses ---

export type FeedStatus = {
  name: string;
  url: string;
  mediaType: 'tv' | 'movie';
  pollIntervalMinutes: number;
  lastPolledAt: string | null;
  isDue: boolean;
};

export type PlexAuthStatusResponse = {
  state:
    | 'not_connected'
    | 'connecting'
    | 'connected'
    | 'reconnect_required'
    | 'renewing'
    | 'expired_reconnect_required'
    | 'error_reconnect_required';
  plexUrl: string;
  hasToken: boolean;
  tokenSource: 'config' | 'env' | 'none';
  returnTo: string | null;
  plexServerVersion: string | null;
  plexVersionCompatible: boolean | null;
};

export function buildFeedStatuses(
  feeds: FeedConfig[],
  pollState: PollState,
  runtime: RuntimeConfig,
  now: number = Date.now(),
): FeedStatus[] {
  return feeds.map((feed) => {
    const record = pollState.feeds[feed.name];
    const intervalMinutes =
      feed.pollIntervalMinutes ?? runtime.runIntervalMinutes;
    const lastPolledAt = record?.lastPolledAt ?? null;

    return {
      name: feed.name,
      url: feed.url,
      mediaType: feed.mediaType,
      pollIntervalMinutes: intervalMinutes,
      lastPolledAt,
      isDue: isDueFeed(feed, pollState, runtime, now),
    };
  });
}

// --- Config redaction ---

export function redactConfig(config: AppConfig): AppConfig {
  const next: AppConfig = {
    ...config,
    runtime: {
      ...config.runtime,
      ...(config.runtime.apiWriteToken ? { apiWriteToken: '[redacted]' } : {}),
    },
    transmission: {
      ...config.transmission,
      username: '[redacted]',
      password: '[redacted]',
    },
  };

  if (next.tmdb?.apiKey) {
    next.tmdb = { ...next.tmdb, apiKey: '[redacted]' };
  }

  if (next.plex?.token) {
    next.plex = { ...next.plex, token: '[redacted]' };
  }

  return next;
}

/**
 * Checks bearer token auth for write endpoints. Returns an error Response if
 * the request is unauthorized or writes are disabled; null on success.
 */
function checkWriteAuth(request: Request, config: AppConfig): Response | null {
  const writeToken = config.runtime.apiWriteToken;
  if (!writeToken) {
    return Response.json(
      { error: 'config writes are disabled' },
      { status: 403 },
    );
  }
  const bearer = parseBearerToken(request.headers.get('authorization'));
  if (!bearer) {
    return Response.json({ error: 'missing bearer token' }, { status: 401 });
  }
  if (bearer !== writeToken) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  return null;
}

/**
 * Checks If-Match header for optimistic concurrency. Returns an error Response
 * if the header is missing or stale; null on success.
 */
function checkEtag(request: Request, config: AppConfig): Response | null {
  const currentEtag = buildConfigEtag(redactConfig(config));
  const ifMatch = request.headers.get('if-match');
  if (!ifMatch) {
    return Response.json(
      { error: 'if-match header is required' },
      { status: 428, headers: { ETag: currentEtag } },
    );
  }
  if (!ifMatchMatches(ifMatch, currentEtag)) {
    return Response.json(
      { error: 'config revision conflict' },
      { status: 409, headers: { ETag: currentEtag } },
    );
  }
  return null;
}

function buildConfigEtag(config: AppConfig): string {
  const serialized = JSON.stringify(config);
  const digest = createHash('sha256').update(serialized).digest('hex');
  return `"${digest}"`;
}

function parseBearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function ifMatchMatches(ifMatch: string, currentEtag: string): boolean {
  const parts = ifMatch
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.includes('*') || parts.includes(currentEtag);
}

async function readConfigFileRecord(
  path: string,
): Promise<Record<string, unknown>> {
  const file = Bun.file(path);
  const parsed = await file.json();
  return expectRecord(parsed, 'config');
}

class ConfigWriteError extends Error {}

function writeConfigAtomically(
  path: string,
  config: Record<string, unknown>,
): void {
  const withoutStarter = Object.fromEntries(
    Object.entries(config).filter(([k]) => k !== '_starter'),
  );
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tempPath, `${JSON.stringify(withoutStarter, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    renameSync(tempPath, path);
  } catch (error) {
    throw new ConfigWriteError(
      error instanceof Error ? error.message : 'config write failed',
    );
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

/** A config.tv.shows entry is either a plain string name or an object with a
 * "name" field (see CompactTvShowEntry in config.ts) — extracts it either
 * way, for removeShowFromWatchlist above. */
function configShowEntryName(entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry;
  if (isRecord(entry) && typeof entry.name === 'string') return entry.name;
  return undefined;
}

/** Bounds an optional untrusted string field before it reaches the http.log
 * writer — see the /api/client-error handler for why this matters there. */
function truncateClientErrorField(
  input: unknown,
  maxLength: number,
): string | undefined {
  if (typeof input !== 'string' || input.length === 0) {
    return undefined;
  }
  return input.length > maxLength ? input.slice(0, maxLength) : input;
}

/**
 * Build on-disk `tv.shows` from API name strings. When the previous file had a
 * matching show name, keep the existing entry (string or object) so per-show
 * fields edited only on disk are not dropped.
 */
function mergeTvShowsPreservingDiskEntries(
  namesInOrder: string[],
  oldShows: unknown[],
): unknown[] {
  const byName = new Map<string, unknown>();
  for (const entry of oldShows) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed) {
        byName.set(trimmed, entry);
      }
    } else if (isRecord(entry) && typeof entry.name === 'string') {
      const trimmed = entry.name.trim();
      if (trimmed) {
        byName.set(trimmed, entry);
      }
    }
  }

  const next: unknown[] = [];
  for (const name of namesInOrder) {
    const prev = byName.get(name);
    if (prev === undefined) {
      next.push(name);
    } else if (typeof prev === 'string') {
      next.push(name);
    } else if (isRecord(prev)) {
      next.push({ ...prev, name });
    } else {
      next.push(name);
    }
  }
  return next;
}

async function writePlexTokenToConfig(input: {
  authToken: string;
  configPath: string;
  currentConfig: AppConfig;
  configHolder?: { current: AppConfig };
}): Promise<AppConfig> {
  return writePlexConfigToDisk({
    configPath: input.configPath,
    currentConfig: input.currentConfig,
    configHolder: input.configHolder,
    patch: { token: input.authToken },
  });
}

async function writePlexConfigToDisk(input: {
  configPath: string;
  currentConfig: AppConfig;
  configHolder?: { current: AppConfig };
  patch: {
    url?: string;
    token?: string;
    refreshIntervalMinutes?: number;
  };
}): Promise<AppConfig> {
  const baseOnDisk = await readConfigFileRecord(input.configPath);
  const diskPlex = isRecord(baseOnDisk.plex) ? baseOnDisk.plex : {};
  const hasTokenPatch = Object.prototype.hasOwnProperty.call(
    input.patch,
    'token',
  );
  const merged = {
    ...baseOnDisk,
    plex: {
      ...diskPlex,
      url:
        input.patch.url ??
        optionalStringValue(diskPlex.url) ??
        input.currentConfig.plex?.url ??
        'http://localhost:32400',
      token: hasTokenPatch
        ? (input.patch.token ?? '')
        : (optionalStringValue(diskPlex.token) ??
          input.currentConfig.plex?.token ??
          ''),
      refreshIntervalMinutes:
        input.patch.refreshIntervalMinutes ??
        optionalNonNegativeNumber(diskPlex.refreshIntervalMinutes) ??
        input.currentConfig.plex?.refreshIntervalMinutes ??
        30,
    },
  };

  const validated = validateConfig(
    merged,
    'config',
    await loadConfigEnv(input.configPath),
  );
  writeConfigAtomically(input.configPath, merged);
  if (input.configHolder) {
    input.configHolder.current = validated;
  }
  return validated;
}

function appendSessionToForwardUrl(url: string, sessionId: string): string {
  const marker = 'forwardUrl=';
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) {
    return url;
  }

  const encodedForwardUrl = url.slice(markerIndex + marker.length);
  const forwardUrl = new URL(decodeURIComponent(encodedForwardUrl));
  forwardUrl.searchParams.set('session', sessionId);

  return `${url.slice(0, markerIndex + marker.length)}${encodeURIComponent(forwardUrl.toString())}`;
}

function expectRecord(input: unknown, label: string): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new ConfigError(`Config file "${label}" must be an object.`);
  }
  return input;
}

function requireNonEmptyString(input: unknown, label: string): string {
  if (typeof input !== 'string' || input.length === 0) {
    throw new ConfigError(`Config file "${label}" must be a non-empty string.`);
  }
  return input;
}

function requireInt(input: unknown, label: string): number {
  if (typeof input !== 'number' || !Number.isInteger(input) || input < 0) {
    throw new ConfigError(
      `Config file "${label}" must be a non-negative integer.`,
    );
  }
  return input;
}

/**
 * Persists per-season aired-vs-owned episode counts from an already-computed
 * ShowEpisodeStatus (the show detail page's episode grid, or "Refresh Plex")
 * into PlexCache — see PlexCache.upsertSeasonCompletion's doc comment. This
 * never does its own Plex/TMDB work; it only records what buildShowEpisodeStatus
 * already computed, so it's free wherever that's already running.
 *
 * Skips entirely when Plex wasn't reachable for this computation — writing
 * "0 owned" while every episode reads 'unknown' would cache a false
 * "everything missing" signal that outlives the transient failure that
 * produced it.
 *
 * That same failure mode can also happen one season at a time: the show
 * itself resolves fine (plexReachable: true) but this one season's own
 * per-episode Plex walk timed out, leaving its episodes 'unknown' rather
 * than a real 'in_library'/'missing' verdict. ownedCount below can't tell
 * "confirmed missing" apart from "never confirmed" — both are just "not
 * in_library" — so a season with any 'unknown' episode is skipped too,
 * for the same reason as the whole-show guard above: better to leave
 * whatever completion count is already cached than overwrite it with a
 * false "0 owned" born from a transient timeout. Confirmed live 2026-08-31:
 * a Plex request storm during a heavy background sweep timed out several
 * shows' per-season episode calls, and this same function (missing this
 * guard) wrote owned:0 for seasons that were actually fully owned.
 */
function persistSeasonCompletions(
  cache: PlexCache,
  normalizedTitle: string,
  status: ShowEpisodeStatus,
): void {
  if (!status.plexReachable) return;

  const cachedAt = new Date().toISOString();
  for (const season of status.seasons) {
    const hasUnknownEpisode = season.episodes.some(
      (episode) => episode.plexStatus === 'unknown',
    );
    if (hasUnknownEpisode) continue;

    const ownedCount = season.episodes.filter(
      (episode) => episode.plexStatus === 'in_library',
    ).length;
    cache.upsertSeasonCompletion({
      normalizedTitle,
      season: season.season,
      airedCount: season.airedEpisodeCount,
      ownedCount,
      cachedAt,
    });
  }
}

/** Only the two operator-facing search sources — see the manual-grab
 * handler's call site for why 'adopted-*' values are rejected here. */
function requireManualGrabSource(
  input: unknown,
  label: string,
): 'eztv' | 'thepiratebay' {
  if (input === 'eztv' || input === 'thepiratebay') {
    return input;
  }
  throw new ConfigError(
    `Config file "${label}" must be one of "eztv", "thepiratebay".`,
  );
}

/** Movie-equivalent of requireManualGrabSource — the two movie search
 * sources only (see ManualMovieGrabSource). */
function requireManualMovieGrabSource(
  input: unknown,
  label: string,
): ManualMovieGrabSource {
  if (input === 'thepiratebay' || input === 'yts') {
    return input;
  }
  throw new ConfigError(
    `Config file "${label}" must be one of "thepiratebay", "yts".`,
  );
}

function optionalStringValue(input: unknown): string | undefined {
  if (typeof input !== 'string') {
    return undefined;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalNonNegativeNumber(input: unknown): number | undefined {
  if (typeof input !== 'number' || !Number.isFinite(input) || input < 0) {
    return undefined;
  }
  return input;
}

/** Parses a query-param integer, clamping to [min, max] and falling back to
 * `fallback` for anything missing or invalid. Used for GET /api/calendar/tv
 * pagination so a malformed offset/limit can't return a negative slice or an
 * oversized one. */
function clampNonNegativeInt(
  raw: string | null,
  fallback: number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const parsed = raw === null ? Number.NaN : Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function requireRecord(
  input: Record<string, unknown>,
  key: string,
  label: string,
): Record<string, unknown> {
  return expectRecord(input[key], `${label} ${key}`);
}

const BUNDLED_TRANSMISSION_URL = 'http://localhost:9091/transmission/rpc';
const STANDARD_TRANSMISSION_PORT = '9091';
const STANDARD_TRANSMISSION_PATH = '/transmission/rpc';

export function classifyTransmissionUrl(
  url: string,
  reachable: boolean,
): 'recommended' | 'compatible' | 'compatible_custom' | 'not_reachable' {
  if (!reachable) return 'not_reachable';
  if (url === BUNDLED_TRANSMISSION_URL) return 'recommended';
  try {
    const parsed = new URL(url);
    if (
      parsed.port === STANDARD_TRANSMISSION_PORT &&
      parsed.pathname === STANDARD_TRANSMISSION_PATH
    ) {
      return 'compatible';
    }
  } catch {
    return 'compatible_custom';
  }
  return 'compatible_custom';
}
