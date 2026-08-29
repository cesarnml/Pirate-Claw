import type { Database } from 'bun:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
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
  fetchSessionInfo,
  fetchTorrentStats,
  pauseTorrent,
  removeTorrent,
  resumeTorrent,
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
import { ThePirateBayHttpClient } from './thepiratebay/client';
import { YtsHttpClient } from './yts/client';
import { ManualGrabsStore } from './manual-grabs/store';
import type { ManualGrabSource } from './manual-grabs/store';
import { ManualMovieGrabsStore } from './manual-movie-grabs/store';
import type { ManualMovieGrabSource } from './manual-movie-grabs/store';
import { buildShowEpisodeStatus } from './shows/episode-status';
import type { ShowEpisodeStatus } from './shows/episode-status';
import type { PlexCache } from './plex/cache';
import { TrackedShowsStore } from './tracked-shows/store';
import {
  normalizeShowName,
  syncTrackedShowsFromConfig,
} from './tracked-shows/sync';
import { reconcileShowLibrary } from './adoption/reconciler';
import {
  installRootMediaShowsDir,
  normalizeInstallRoot,
} from './install-bootstrap';
import { discoverShowDirectories } from './adoption/discover-media-dirs';
import { extractCodec, extractResolution } from './normalize';
import {
  ConfigError,
  validateCompactTvDefaults,
  validateConfig,
  validateFeed,
  validateMoviePolicy,
  validateTmdbConfig,
  loadConfigEnv,
} from './config';
import type { MovieBreakdown } from './movie-api-types';
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
} from './plex/shows';
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

/** How long a show's library-reconciliation result is trusted before the
 * next episode-grid view re-runs it (see reconcileShowIfStale). */
const RECONCILE_STALE_AFTER_MS = 10 * 60 * 1000;

type ManagedTorrentRowState =
  | 'missing'
  | 'downloading'
  | 'seeding'
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
 * pause/resume/remove/remove-and-delete. Tries candidate_state first (the
 * RSS-pipeline case, which also carries an identityKey the caller can set a
 * pirateClawDisposition on); if that's not this hash's origin, falls back to
 * manual_grabs (see manual-grabs/schema.ts) — a hash that only exists there
 * is still a real, manageable Transmission torrent, it just has no
 * candidate_state disposition concept to update. `dispose` intentionally
 * does not use this fallback: it's specifically for RSS-tracked torrents the
 * reconcile loop lost track of, a concept manual grabs don't have.
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

  if (
    manualGrabs?.hasTorrentHash(hash) ||
    manualMovieGrabs?.hasTorrentHash(hash)
  ) {
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
   * confirmed by candidate_state) or manually grabbed via the movie
   * calendar — backs CalendarMovieItem.alreadyGrabbed and
   * TopMovieItem.alreadyGrabbed. Reuses the exact same
   * candidates -> buildMovieBreakdowns -> enrichMovieBreakdowns pipeline
   * /api/movies already runs, so this costs nothing beyond what that
   * endpoint already pays (TMDB enrichment is cache-first — see
   * tmdb/movie-enrichment.ts). */
  async function ownedMovieTmdbIds(): Promise<Set<number>> {
    const grabbed = database
      ? new ManualMovieGrabsStore(database).listGrabbedTmdbIds()
      : new Set<number>();
    if (!tmdbMovies) return grabbed;

    const candidates = repository.listCandidateStates(API_CANDIDATE_LIST_LIMIT);
    const base = buildMovieBreakdowns(candidates);
    const enriched = await enrichMovieBreakdowns(base, tmdbMovies);
    for (const movie of enriched) {
      if (movie.tmdb?.tmdbId) grabbed.add(movie.tmdb.tmdbId);
    }
    return grabbed;
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
        const owned = await ownedMovieTmdbIds();
        const page = await getMovieCalendar(calendarMovie, year, owned, {
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
      const year = clampNonNegativeInt(
        params.get('year'),
        currentYear,
        1900,
        currentYear + 5,
      );
      // Rescanning re-hits a third-party site and (on a cold cache) makes
      // up to 100 TMDB calls — a deliberate operator action, gated like any
      // other outbound-call-triggering write, not a free read.
      const rescan = params.get('rescan') === 'true';
      if (rescan) {
        const authError = checkWriteAuth(request, activeConfig);
        if (authError) return authError;
      }

      try {
        const owned = await ownedMovieTmdbIds();
        const result = await getTopMovies(topMovies, year, owned, rescan);
        return Response.json(result);
      } catch {
        return json500();
      }
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
        const torrents = await thePirateBay.search(query, 'movie');
        if (torrents === null) {
          return Response.json(
            { error: 'The Pirate Bay lookup failed; try again' },
            { status: 502 },
          );
        }
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
        if (tmdbMovies) {
          const movie = await tmdbMovies.client.getMovie(tmdbId);
          if (movie) {
            moviePosterUrl = movie.poster_path
              ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
              : null;
            movieDisplayTitle = movie.title;
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
        const torrents = await thePirateBay.search(query);
        if (torrents === null) {
          return Response.json(
            { error: 'The Pirate Bay lookup failed; try again' },
            { status: 502 },
          );
        }

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
      const manualGrabDisplayInfo = database
        ? new ManualGrabsStore(database).listAllTorrentDisplayInfo()
        : new Map();
      // Same rationale, movie-shaped: manual_movie_grabs never writes to
      // candidate_state either (see manual-movie-grabs/schema.ts).
      const manualMovieGrabDisplayInfo = database
        ? new ManualMovieGrabsStore(database).listAllTorrentDisplayInfo()
        : new Map();
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

      const hashSet = new Set(hashes);
      // Also has no candidate_state row, so no poster/title from the usual
      // lookup — attach what was captured at grab time instead (see
      // manual-grabs/schema.ts).
      const torrents = result.torrents
        .filter((t) => hashSet.has(t.hash))
        .map((t) => {
          const grabInfo =
            manualGrabDisplayInfo.get(t.hash) ??
            manualMovieGrabDisplayInfo.get(t.hash);
          return grabInfo
            ? {
                ...t,
                posterUrl: grabInfo.posterUrl,
                displayTitle: grabInfo.displayTitle,
              }
            : t;
        });
      return Response.json({ torrents });
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
      path === '/api/transmission/torrent/remove' &&
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

      // No candidate_state row for a manual-grab-only torrent — nothing to
      // set a disposition on (see resolveManagedTorrentAction).
      if (
        ctx.candidate &&
        (ctx.rowState === 'downloading' ||
          ctx.rowState === 'seeding' ||
          ctx.rowState === 'paused' ||
          ctx.rowState === 'completed')
      ) {
        repository.setPirateClawDisposition(
          ctx.candidate.identityKey,
          'removed',
        );
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

      const ctx = await resolveManagedTorrentAction(
        repository,
        activeConfig.transmission,
        body.hash,
        database ? new ManualGrabsStore(database) : undefined,
        database ? new ManualMovieGrabsStore(database) : undefined,
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

      // No manualGrabs fallback here on purpose — dispose is specifically
      // for an RSS-tracked torrent the reconcile loop lost track of, a
      // concept manual grabs don't have (see resolveManagedTorrentAction).
      const ctx = await resolveManagedTorrentAction(
        repository,
        activeConfig.transmission,
        body.hash,
        undefined,
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
      if (!ctx.candidate) {
        return json500();
      }

      repository.setPirateClawDisposition(
        ctx.candidate.identityKey,
        body.disposition,
      );
      return Response.json({ ok: true });
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
 */
function persistSeasonCompletions(
  cache: PlexCache,
  normalizedTitle: string,
  status: ShowEpisodeStatus,
): void {
  if (!status.plexReachable) return;

  const cachedAt = new Date().toISOString();
  for (const season of status.seasons) {
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
