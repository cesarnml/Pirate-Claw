import { createHash, randomUUID } from 'node:crypto';
import { renameSync, writeFileSync } from 'node:fs';
import {
  fetchSessionInfo,
  fetchTorrentStats,
  pauseTorrent,
  removeTorrent,
  resumeTorrent,
} from './transmission';
import type {
  AppConfig,
  CompactTvDefaults,
  FeedConfig,
  RuntimeConfig,
} from './config';
import {
  ConfigError,
  validateCompactTvDefaults,
  validateConfig,
  validateFeed,
  validateMoviePolicy,
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
import type { CandidateStateRecord, Repository } from './repository';
import type { CycleResult } from './runtime-artifacts';
import type { TmdbCache } from './tmdb/cache';
import { enrichCandidatesFromCache } from './tmdb/candidate-cache-enrich';
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
import { enrichShowBreakdownsFromPlexCache } from './plex/shows';

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
  } = deps;
  let activeConfig = configHolder?.current ?? config;

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

    if (path === '/api/status') {
      return safeJson(() => ({ runs: repository.listRecentRunSummaries() }));
    }

    if (path === '/api/candidates') {
      try {
        const list = repository.listCandidateStates();
        const candidates = tmdbCache
          ? enrichCandidatesFromCache(
              list,
              tmdbCache,
              onCandidateTmdbCacheError,
            )
          : list;
        return Response.json({ candidates });
      } catch {
        return json500();
      }
    }

    if (path === '/api/shows') {
      try {
        const candidates = repository.listCandidateStates();
        const base = buildShowBreakdowns(candidates);
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
        const candidates = repository.listCandidateStates();
        const base = buildShowBreakdowns(candidates);
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
            const res = await fetch(feed.url, {
              signal: AbortSignal.timeout(10_000),
            });
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
      if (status !== 'skipped_no_match') {
        return Response.json(
          { error: 'unsupported status filter' },
          { status: 400 },
        );
      }
      const outcomes = repository.listSkippedNoMatchOutcomes(30);
      return safeJson(() => ({ outcomes }));
    }

    if (path === '/api/transmission/torrents' && request.method === 'GET') {
      const candidates = repository.listCandidateStates();
      const hashes = candidates
        .map((c) => c.transmissionTorrentHash)
        .filter((h): h is string => h !== undefined);

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
      const torrents = result.torrents.filter((t) => hashSet.has(t.hash));
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

    if (
      path === '/api/transmission/torrent/pause' &&
      request.method === 'POST'
    ) {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json(
          { ok: false, error: 'invalid json body' },
          { status: 400 },
        );
      }

      if (
        !body ||
        typeof body !== 'object' ||
        !('hash' in body) ||
        typeof (body as Record<string, unknown>).hash !== 'string'
      ) {
        return Response.json(
          { ok: false, error: 'hash is required' },
          { status: 400 },
        );
      }

      const hash = (body as Record<string, string>).hash;
      const candidates = repository.listCandidateStates();
      const candidate = candidates.find(
        (c) => c.transmissionTorrentHash === hash,
      );

      if (!candidate) {
        return Response.json(
          { ok: false, error: 'candidate not found' },
          { status: 400 },
        );
      }

      const displayState = deriveTorrentDisplayState(candidate);
      if (displayState !== 'downloading') {
        return Response.json(
          {
            ok: false,
            error: `torrent is not in a pauseable state: ${displayState}`,
          },
          { status: 400 },
        );
      }

      const result = await pauseTorrent(activeConfig.transmission, hash);
      if (!result.ok) {
        return Response.json(
          { ok: false, error: result.message },
          { status: 500 },
        );
      }
      return Response.json({ ok: true });
    }

    if (
      path === '/api/transmission/torrent/resume' &&
      request.method === 'POST'
    ) {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json(
          { ok: false, error: 'invalid json body' },
          { status: 400 },
        );
      }

      if (
        !body ||
        typeof body !== 'object' ||
        !('hash' in body) ||
        typeof (body as Record<string, unknown>).hash !== 'string'
      ) {
        return Response.json(
          { ok: false, error: 'hash is required' },
          { status: 400 },
        );
      }

      const hash = (body as Record<string, string>).hash;
      const candidates = repository.listCandidateStates();
      const candidate = candidates.find(
        (c) => c.transmissionTorrentHash === hash,
      );

      if (!candidate) {
        return Response.json(
          { ok: false, error: 'candidate not found' },
          { status: 400 },
        );
      }

      const displayState = deriveTorrentDisplayState(candidate);
      if (displayState !== 'paused') {
        return Response.json(
          {
            ok: false,
            error: `torrent is not in a resumable state: ${displayState}`,
          },
          { status: 400 },
        );
      }

      const result = await resumeTorrent(activeConfig.transmission, hash);
      if (!result.ok) {
        return Response.json(
          { ok: false, error: result.message },
          { status: 500 },
        );
      }
      return Response.json({ ok: true });
    }

    if (
      path === '/api/transmission/torrent/remove' &&
      request.method === 'POST'
    ) {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json(
          { ok: false, error: 'invalid json body' },
          { status: 400 },
        );
      }

      if (
        !body ||
        typeof body !== 'object' ||
        !('hash' in body) ||
        typeof (body as Record<string, unknown>).hash !== 'string'
      ) {
        return Response.json(
          { ok: false, error: 'hash is required' },
          { status: 400 },
        );
      }

      const hash = (body as Record<string, string>).hash;
      const candidates = repository.listCandidateStates();
      const candidate = candidates.find(
        (c) => c.transmissionTorrentHash === hash,
      );

      if (!candidate) {
        return Response.json(
          { ok: false, error: 'candidate not found' },
          { status: 400 },
        );
      }

      const displayState = deriveTorrentDisplayState(candidate);
      if (displayState === 'removed' || displayState === 'deleted') {
        return Response.json(
          {
            ok: false,
            error: `torrent cannot be removed in state: ${displayState}`,
          },
          { status: 400 },
        );
      }

      const result = await removeTorrent(
        activeConfig.transmission,
        hash,
        false,
      );
      if (!result.ok) {
        return Response.json(
          { ok: false, error: result.message },
          { status: 500 },
        );
      }

      if (displayState === 'downloading' || displayState === 'paused') {
        repository.setPirateClawDisposition(candidate.identityKey, 'removed');
      }

      return Response.json({ ok: true });
    }

    if (
      path === '/api/transmission/torrent/remove-and-delete' &&
      request.method === 'POST'
    ) {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json(
          { ok: false, error: 'invalid json body' },
          { status: 400 },
        );
      }

      if (
        !body ||
        typeof body !== 'object' ||
        !('hash' in body) ||
        typeof (body as Record<string, unknown>).hash !== 'string'
      ) {
        return Response.json(
          { ok: false, error: 'hash is required' },
          { status: 400 },
        );
      }

      const hash = (body as Record<string, string>).hash;
      const candidates = repository.listCandidateStates();
      const candidate = candidates.find(
        (c) => c.transmissionTorrentHash === hash,
      );

      if (!candidate) {
        return Response.json(
          { ok: false, error: 'candidate not found' },
          { status: 400 },
        );
      }

      const displayState = deriveTorrentDisplayState(candidate);
      if (displayState === 'removed' || displayState === 'deleted') {
        return Response.json(
          {
            ok: false,
            error: `torrent cannot be removed in state: ${displayState}`,
          },
          { status: 400 },
        );
      }

      const result = await removeTorrent(activeConfig.transmission, hash, true);
      if (!result.ok) {
        return Response.json(
          { ok: false, error: result.message },
          { status: 500 },
        );
      }

      repository.setPirateClawDisposition(candidate.identityKey, 'deleted');
      return Response.json({ ok: true });
    }

    if (path === '/api/daemon/restart' && request.method === 'POST') {
      const authError = checkWriteAuth(request, activeConfig);
      if (authError) return authError;

      // This endpoint trusts the supervisor to restart. Run the daemon under
      // Synology Task Scheduler or systemd with auto-restart on exit.
      queueMicrotask(() => process.kill(process.pid, 'SIGTERM'));
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'not found' }, { status: 404 });
  };
}

// --- Show breakdowns ---

export function buildShowBreakdowns(
  candidates: CandidateStateRecord[],
): ShowBreakdown[] {
  const tvCandidates = candidates.filter((c) => c.mediaType === 'tv');

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
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`, {
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

function deriveTorrentDisplayState(
  candidate: CandidateStateRecord,
): 'queued' | 'paused' | 'downloading' | 'completed' | 'removed' | 'deleted' {
  if (candidate.pirateClawDisposition) return candidate.pirateClawDisposition;
  if (!candidate.transmissionTorrentHash) return 'queued';
  if (candidate.transmissionPercentDone === 1) return 'completed';
  if (candidate.transmissionStatusCode === 0) return 'paused';
  return 'downloading';
}

function expectRecord(input: unknown, label: string): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new ConfigError(`Config file "${label}" must be an object.`);
  }
  return input;
}

function requireRecord(
  input: Record<string, unknown>,
  key: string,
  label: string,
): Record<string, unknown> {
  return expectRecord(input[key], `${label} ${key}`);
}
