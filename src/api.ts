import { createHash, randomUUID } from 'node:crypto';
import { renameSync, writeFileSync } from 'node:fs';
import type { AppConfig, FeedConfig, RuntimeConfig } from './config';
import { ConfigError, validateConfig } from './config';
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
import { enrichShowBreakdowns } from './tmdb/tv-enrichment';

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
  configPath: string;
  pollStatePath: string;
  loadPollState: (path: string) => PollState;
  /** When set (TMDB configured), GET /api/movies lazily enriches from cache + TMDB. */
  tmdbMovies?: MovieEnrichDeps;
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
    configPath,
    pollStatePath,
    loadPollState,
    tmdbMovies,
    tmdbShows,
    tmdbCache,
    onCandidateTmdbCacheError,
  } = deps;
  let activeConfig = config;

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
        const shows = tmdbShows
          ? await enrichShowBreakdowns(base, tmdbShows)
          : base;
        return Response.json({ shows });
      } catch {
        return json500();
      }
    }

    if (path === '/api/movies') {
      try {
        const candidates = repository.listCandidateStates();
        const base = buildMovieBreakdowns(candidates);
        const movies = tmdbMovies
          ? await enrichMovieBreakdowns(base, tmdbMovies)
          : base;
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
        const runtimePatch = requireRecord(patch, 'runtime', 'request body');

        // Runtime-only updates for now; non-runtime updates are out-of-scope in this phase.
        for (const key of Object.keys(patch)) {
          if (key !== 'runtime') {
            throw new ConfigError(
              `Config file "request body ${key}" is not writable; only "runtime" is supported.`,
            );
          }
        }

        const baseOnDisk = await readConfigFileRecord(configPath);
        const merged = {
          ...baseOnDisk,
          runtime: {
            ...(isRecord(baseOnDisk.runtime) ? baseOnDisk.runtime : {}),
            ...runtimePatch,
          },
        };

        const validated = validateConfig(merged, 'config');
        writeConfigAtomically(configPath, merged);
        activeConfig = validated;

        const redacted = redactConfig(activeConfig);
        return Response.json(redacted, {
          headers: { ETag: buildConfigEtag(redacted) },
        });
      } catch (error) {
        if (error instanceof ConfigError) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        return json500();
      }
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
      lifecycleStatus: c.lifecycleStatus,
      queuedAt: c.queuedAt,
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
    shows.push({ normalizedTitle: title, seasons });
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
      lifecycleStatus: c.lifecycleStatus,
      queuedAt: c.queuedAt,
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

  return next;
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

function writeConfigAtomically(
  path: string,
  config: Record<string, unknown>,
): void {
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  renameSync(tempPath, path);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
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
