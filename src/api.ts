import type { AppConfig, FeedConfig, RuntimeConfig } from './config';
import type { MovieBreakdown } from './movie-api-types';
export type { MovieBreakdown, TmdbMoviePublic } from './movie-api-types';
import { isDueFeed } from './poll-state';
import type { PollState } from './poll-state';
import type { CandidateStateRecord, Repository } from './repository';
import type { CycleResult } from './runtime-artifacts';
import type { MovieEnrichDeps } from './tmdb/movie-enrichment';
import { enrichMovieBreakdowns } from './tmdb/movie-enrichment';

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
  pollStatePath: string;
  loadPollState: (path: string) => PollState;
  /** When set (TMDB configured), GET /api/movies lazily enriches from cache + TMDB. */
  tmdbMovies?: MovieEnrichDeps;
};

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
    pollStatePath,
    loadPollState,
    tmdbMovies,
  } = deps;

  return async (request: Request) => {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      const uptimeMs = Date.now() - new Date(health.startedAt).getTime();
      return Response.json({
        uptime: uptimeMs,
        startedAt: health.startedAt,
        lastRunCycle: health.lastRunCycle,
        lastReconcileCycle: health.lastReconcileCycle,
      });
    }

    if (url.pathname === '/api/status') {
      try {
        return Response.json({
          runs: repository.listRecentRunSummaries(),
        });
      } catch {
        return Response.json(
          { error: 'internal server error' },
          { status: 500 },
        );
      }
    }

    if (url.pathname === '/api/candidates') {
      try {
        return Response.json({
          candidates: repository.listCandidateStates(),
        });
      } catch {
        return Response.json(
          { error: 'internal server error' },
          { status: 500 },
        );
      }
    }

    if (url.pathname === '/api/shows') {
      try {
        const candidates = repository.listCandidateStates();
        return Response.json({ shows: buildShowBreakdowns(candidates) });
      } catch {
        return Response.json(
          { error: 'internal server error' },
          { status: 500 },
        );
      }
    }

    if (url.pathname === '/api/movies') {
      try {
        const candidates = repository.listCandidateStates();
        const base = buildMovieBreakdowns(candidates);
        const movies = tmdbMovies
          ? await enrichMovieBreakdowns(base, tmdbMovies)
          : base;
        return Response.json({ movies });
      } catch {
        return Response.json(
          { error: 'internal server error' },
          { status: 500 },
        );
      }
    }

    if (url.pathname === '/api/feeds') {
      try {
        const pollState = loadPollState(pollStatePath);
        return Response.json({
          feeds: buildFeedStatuses(config.feeds, pollState, config.runtime),
        });
      } catch {
        return Response.json(
          { error: 'internal server error' },
          { status: 500 },
        );
      }
    }

    if (url.pathname === '/api/config') {
      try {
        return Response.json(redactConfig(config));
      } catch {
        return Response.json(
          { error: 'internal server error' },
          { status: 500 },
        );
      }
    }

    return Response.json({ error: 'not found' }, { status: 404 });
  };
}

// --- Show breakdowns ---

export type ShowEpisode = {
  episode: number;
  identityKey: string;
  status: string;
  lifecycleStatus?: string;
  queuedAt?: string;
};

export type ShowSeason = {
  season: number;
  episodes: ShowEpisode[];
};

export type ShowBreakdown = {
  normalizedTitle: string;
  seasons: ShowSeason[];
};

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
