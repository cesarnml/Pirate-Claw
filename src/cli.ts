import { existsSync } from 'node:fs';

import { join } from 'node:path';

import type { Database } from 'bun:sqlite';

import { createApiFetch, createHealthState, recordCycleInHealth } from './api';
import { ensureStarterConfig } from './bootstrap';
import {
  type AppConfig,
  ConfigError,
  loadConfig,
  resolveConfigPath,
} from './config';
import { daemonOptionsFromConfig, runDaemonLoop } from './daemon';
import { ensureFirstStartupBootstrap } from './install-bootstrap';
import {
  reconcileCandidates,
  retryFailedCandidates,
  runPipeline,
} from './pipeline';
import { runPlexBackgroundRefresh } from './plex/background-refresh';
import { PlexCache } from './plex/cache';
import { PlexHttpClient } from './plex/client';
import {
  PlexCredentialManager,
  RenewingPlexHttpClient,
} from './plex/credential-manager';
import type { PlexMovieEnrichDeps } from './plex/movies';
import type { PlexShowEnrichDeps } from './plex/shows';
import {
  filterDueFeeds,
  loadPollState,
  recordFeedPolled,
  savePollState,
} from './poll-state';
import { pruneArtifacts, writeCycleArtifact } from './runtime-artifacts';
import {
  createRepository,
  ensureSchema,
  hasStatusSchema,
  openDatabase,
  openDatabaseReadOnly,
  DEFAULT_DATABASE_PATH,
  type CandidateStateRecord,
  type RunSummaryRecord,
} from './repository';
import { runTmdbBackgroundRefresh } from './tmdb/background-refresh';
import { TmdbCache } from './tmdb/cache';
import { TmdbHttpClient } from './tmdb/client';
import type { MovieEnrichDeps } from './tmdb/movie-enrichment';
import type { TvEnrichDeps } from './tmdb/tv-enrichment';
import { resolveTmdbSettings } from './tmdb/settings';
import { createTransmissionDownloader } from './transmission';

function plexMovieEnrichDeps(
  database: Database,
  configHolder: { current: AppConfig },
  log: (message: string) => void,
  credentialManager?: PlexCredentialManager,
): PlexMovieEnrichDeps | undefined {
  const config = configHolder.current;
  if (!config.plex) {
    return undefined;
  }

  return {
    cache: new PlexCache(database),
    client:
      credentialManager === undefined
        ? new PlexHttpClient(config.plex.url, config.plex.token, (m: string) =>
            log(`[plex] ${m}`),
          )
        : new RenewingPlexHttpClient({
            baseUrl: config.plex.url,
            manager: credentialManager,
            log: (m: string) => log(`[plex] ${m}`),
          }),
    refreshIntervalMinutes: config.plex.refreshIntervalMinutes,
    log: (m: string) => log(`[plex] ${m}`),
  };
}

function plexShowEnrichDeps(
  database: Database,
  configHolder: { current: AppConfig },
  log: (message: string) => void,
  credentialManager?: PlexCredentialManager,
): PlexShowEnrichDeps | undefined {
  const config = configHolder.current;
  if (!config.plex) {
    return undefined;
  }

  return {
    cache: new PlexCache(database),
    client:
      credentialManager === undefined
        ? new PlexHttpClient(config.plex.url, config.plex.token, (m: string) =>
            log(`[plex] ${m}`),
          )
        : new RenewingPlexHttpClient({
            baseUrl: config.plex.url,
            manager: credentialManager,
            log: (m: string) => log(`[plex] ${m}`),
          }),
    refreshIntervalMinutes: config.plex.refreshIntervalMinutes,
    log: (m: string) => log(`[plex] ${m}`),
  };
}

function tmdbMovieEnrichDeps(
  database: Database,
  config: AppConfig,
  log: (message: string) => void,
): MovieEnrichDeps | undefined {
  const tmdbResolved = resolveTmdbSettings(config);
  if (!tmdbResolved) {
    return undefined;
  }
  return {
    cache: new TmdbCache(database),
    client: new TmdbHttpClient(tmdbResolved.apiKey, (m: string) =>
      log(`[tmdb] ${m}`),
    ),
    cacheTtlMs: tmdbResolved.cacheTtlMs,
    negativeCacheTtlMs: tmdbResolved.negativeCacheTtlMs,
    log: (m: string) => log(`[tmdb] ${m}`),
  };
}

function tmdbShowsEnrichDeps(
  database: Database,
  config: AppConfig,
  log: (message: string) => void,
): TvEnrichDeps | undefined {
  const tmdbResolved = resolveTmdbSettings(config);
  if (!tmdbResolved) {
    return undefined;
  }
  return {
    cache: new TmdbCache(database),
    client: new TmdbHttpClient(tmdbResolved.apiKey, (m: string) =>
      log(`[tmdb] ${m}`),
    ),
    cacheTtlMs: tmdbResolved.cacheTtlMs,
    negativeCacheTtlMs: tmdbResolved.negativeCacheTtlMs,
    log: (m: string) => log(`[tmdb] ${m}`),
  };
}

export async function runCli(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  try {
    if (command === 'config') {
      const [subcommand, ...configArgs] = rest;

      if (subcommand === 'show') {
        const configPath = parseConfigPath(configArgs);
        const resolvedConfigPath = resolveConfigPath(configPath);
        const config = await loadConfig(resolvedConfigPath);

        console.log(JSON.stringify(config, null, 2));
        return 0;
      }

      console.error('Unknown config command. Available commands: "show".');
      return 1;
    }

    if (command === 'run') {
      const configPath = parseConfigPath(rest);
      const resolvedConfigPath = resolveConfigPath(configPath);
      const config = await loadConfig(resolvedConfigPath);
      const database = openDatabase();

      try {
        ensureSchema(database);
        const result = await runPipeline({
          config,
          repository: createRepository(database),
          downloader: createTransmissionDownloader(config.transmission),
        });

        console.log(formatRunSummary(result));
      } finally {
        database.close();
      }

      return 0;
    }

    if (command === 'retry-failed') {
      const configPath = parseConfigPath(rest);
      const resolvedConfigPath = resolveConfigPath(configPath);
      const config = await loadConfig(resolvedConfigPath);
      const database = openInitializedWritableDatabase();

      try {
        const result = await retryFailedCandidates({
          repository: createRepository(database),
          downloader: createTransmissionDownloader(config.transmission),
          transmissionConfig: config.transmission,
        });

        console.log(formatRunSummary(result));
      } finally {
        database.close();
      }

      return 0;
    }

    if (command === 'reconcile') {
      const configPath = parseConfigPath(rest);
      const resolvedConfigPath = resolveConfigPath(configPath);
      const config = await loadConfig(resolvedConfigPath);
      const database = openInitializedWritableDatabase();

      try {
        const result = await reconcileCandidates({
          repository: createRepository(database),
          downloader: createTransmissionDownloader(config.transmission),
        });

        console.log(formatReconcileSummary(result));
      } finally {
        database.close();
      }

      return 0;
    }

    if (command === 'plex-refresh') {
      const configPath = parseConfigPath(rest);
      const resolvedConfigPath = resolveConfigPath(configPath);
      const config = await loadConfig(resolvedConfigPath);

      if (!config.plex) {
        console.error(
          'Plex is not configured; add a "plex" block with url and token to your config.',
        );
        return 1;
      }

      const database = openInitializedWritableDatabase();
      const log = console.log;

      try {
        const repository = createRepository(database);
        const configHolder = { current: config };
        const plexMovies = plexMovieEnrichDeps(database, configHolder, log);
        const plexShows = plexShowEnrichDeps(database, configHolder, log);
        await runPlexBackgroundRefresh({
          repository,
          plexMovies,
          plexShows,
          log,
        });
      } finally {
        database.close();
      }

      return 0;
    }

    if (command === 'plex-audit') {
      const configPath = parseConfigPath(rest);
      const resolvedConfigPath = resolveConfigPath(configPath);
      const config = await loadConfig(resolvedConfigPath);

      if (!config.plex) {
        console.error(
          'Plex is not configured; add a "plex" block with url and token to your config.',
        );
        return 1;
      }

      const client = new PlexHttpClient(
        config.plex.url,
        config.plex.token,
        (message: string) => {
          console.log(`[plex] ${message}`);
        },
      );

      console.log('== Plex API (from config) ==');
      console.log('plex.url:', config.plex.url);

      const sections = await client.listLibrarySections();
      console.log('library sections:', JSON.stringify(sections, null, 2));

      const tvCatalog = await client.listAllTvShowsForMatching();
      console.log(`TV catalog entries: ${String(tvCatalog.length)}`);
      if (tvCatalog.length > 0) {
        console.log('TV titles:', tvCatalog.map((row) => row.title).join(', '));
      }

      const movieCatalog = await client.listAllMoviesForMatching();
      console.log(`Movie catalog entries: ${String(movieCatalog.length)}`);
      if (movieCatalog.length > 0) {
        console.log(
          'Movie titles:',
          movieCatalog.map((row) => row.title).join(', '),
        );
      }

      console.log('\n== SQLite Plex cache ==');
      const dbPath = DEFAULT_DATABASE_PATH;
      if (!existsSync(dbPath)) {
        console.log(`(no database file at ${dbPath})`);
        return 0;
      }

      const database = openDatabaseReadOnly();
      try {
        if (!hasStatusSchema(database)) {
          console.log(
            '(database present but not initialized; run `run` first)',
          );
          return 0;
        }

        try {
          const tvAgg = database
            .query(
              `SELECT COUNT(*) AS rows, COALESCE(SUM(in_library), 0) AS in_library_sum
               FROM plex_tv_cache`,
            )
            .get() as { rows: number; in_library_sum: number };
          console.log('plex_tv_cache:', JSON.stringify(tvAgg));
          const tvSample = database
            .query(
              `SELECT normalized_title, in_library, substr(plex_rating_key, 1, 12) AS rk_prefix, cached_at
               FROM plex_tv_cache ORDER BY normalized_title LIMIT 40`,
            )
            .all();
          console.log(JSON.stringify(tvSample, null, 2));

          const mvAgg = database
            .query(
              `SELECT COUNT(*) AS rows, COALESCE(SUM(in_library), 0) AS in_library_sum
               FROM plex_movie_cache`,
            )
            .get() as { rows: number; in_library_sum: number };
          console.log('plex_movie_cache:', JSON.stringify(mvAgg));
          const mvSample = database
            .query(
              `SELECT title, year, in_library, substr(plex_rating_key, 1, 12) AS rk_prefix, cached_at
               FROM plex_movie_cache ORDER BY title LIMIT 40`,
            )
            .all();
          console.log(JSON.stringify(mvSample, null, 2));
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.log(`(SQLite Plex tables unreadable: ${message})`);
        }
      } finally {
        database.close();
      }

      console.log(
        '\nTip: after fixing `plex.url` or token, run `plex-refresh` to rewrite cache.',
      );
      return 0;
    }

    if (command === 'daemon') {
      const configPath = parseConfigPath(rest);
      const resolvedConfigPath = resolveConfigPath(configPath);
      const bootstrap = await ensureFirstStartupBootstrap({
        installRoot: process.env.PIRATE_CLAW_INSTALL_ROOT,
        configPath: resolvedConfigPath,
      });
      if (bootstrap && !process.env.PIRATE_CLAW_API_WRITE_TOKEN) {
        const token = await Bun.file(bootstrap.daemonApiWriteTokenPath).text();
        process.env.PIRATE_CLAW_API_WRITE_TOKEN = token.trim();
      }
      await ensureStarterConfig(resolvedConfigPath);
      let config = await loadConfig(resolvedConfigPath);
      const configuredInstallRoot = config.runtime.installRoot;

      if (
        configuredInstallRoot &&
        configuredInstallRoot !== process.env.PIRATE_CLAW_INSTALL_ROOT
      ) {
        await ensureFirstStartupBootstrap({
          installRoot: configuredInstallRoot,
          configPath: resolvedConfigPath,
        });
        config = await loadConfig(resolvedConfigPath);
      }

      const database = openDatabase();
      const log = console.log;

      try {
        ensureSchema(database);
        const repository = createRepository(database);
        const downloader = createTransmissionDownloader(config.transmission, {
          warn: log,
        });

        const controller = new AbortController();
        const onSignal = () => controller.abort();
        process.once('SIGINT', onSignal);
        process.once('SIGTERM', onSignal);

        const pollStatePath = join(
          config.runtime.artifactDir,
          'poll-state.json',
        );

        const { artifactDir, artifactRetentionDays } = config.runtime;

        const health = createHealthState();
        const configHolder = { current: config };
        const plexCredentialManager = config.plex
          ? new PlexCredentialManager({
              database,
              configPath: resolvedConfigPath,
              configHolder,
              log,
            })
          : undefined;

        const tmdbMovies = tmdbMovieEnrichDeps(database, config, log);
        const tmdbShows = tmdbShowsEnrichDeps(database, config, log);
        const plexMovies = plexMovieEnrichDeps(
          database,
          configHolder,
          log,
          plexCredentialManager,
        );
        const plexShows = plexShowEnrichDeps(
          database,
          configHolder,
          log,
          plexCredentialManager,
        );
        const tmdbRefreshIntervalMinutes =
          config.runtime.tmdbRefreshIntervalMinutes!;
        const scheduleTmdbRefresh =
          (tmdbMovies || tmdbShows) && tmdbRefreshIntervalMinutes > 0;
        const plexRefreshIntervalMinutes =
          config.plex?.refreshIntervalMinutes ?? 0;
        const schedulePlexRefresh = plexRefreshIntervalMinutes > 0;

        if (plexCredentialManager) {
          await plexCredentialManager.startupRenew();
        }

        await runDaemonLoop({
          runCycle: async () => {
            const active = configHolder.current;
            let pollState = loadPollState(pollStatePath);
            const now = Date.now();
            const dueFeeds = filterDueFeeds(
              active.feeds,
              pollState,
              active.runtime,
              now,
            );

            if (dueFeeds.length === 0) {
              console.log('run cycle: no feeds due');
              return;
            }

            const result = await runPipeline({
              config: { ...active, feeds: dueFeeds },
              repository,
              downloader,
            });

            const polledAt = new Date(now).toISOString();
            for (const feed of dueFeeds) {
              pollState = recordFeedPolled(pollState, feed.name, polledAt);
            }
            savePollState(pollStatePath, pollState);

            console.log(formatRunSummary(result));
          },
          reconcileCycle: async () => {
            const result = await reconcileCandidates({
              repository,
              downloader,
            });
            console.log(formatReconcileSummary(result));
          },
          tmdbRefreshCycle: scheduleTmdbRefresh
            ? async () => {
                await runTmdbBackgroundRefresh({
                  repository,
                  tmdbMovies,
                  tmdbShows,
                  log,
                });
              }
            : undefined,
          plexRefreshCycle: schedulePlexRefresh
            ? async () => {
                await runPlexBackgroundRefresh({
                  repository,
                  plexMovies,
                  plexShows,
                  log,
                });
              }
            : undefined,
          options: daemonOptionsFromConfig(
            config.runtime,
            config.plex?.refreshIntervalMinutes,
          ),
          signal: controller.signal,
          log,
          onCycleResult: (result) => {
            recordCycleInHealth(health, result);
            writeCycleArtifact(artifactDir, result);
            pruneArtifacts(artifactDir, artifactRetentionDays);
          },
          fetch:
            config.runtime.apiPort != null
              ? createApiFetch({
                  database,
                  repository,
                  health,
                  config,
                  configHolder,
                  configPath: resolvedConfigPath,
                  pollStatePath,
                  loadPollState,
                  tmdbMovies,
                  plexShows,
                  tmdbShows,
                  plexMovies,
                  tmdbCache: tmdbMovies?.cache ?? tmdbShows?.cache,
                  onCandidateTmdbCacheError: (err, c) =>
                    log(
                      `[tmdb] candidate cache enrich failed ${c.identityKey}: ${
                        err instanceof Error ? err.message : String(err)
                      }`,
                    ),
                  downloader,
                })
              : undefined,
        });
      } finally {
        database.close();
      }

      return 0;
    }

    if (command === 'status') {
      const database = openStatusDatabase();

      try {
        const repository = createRepository(database);
        console.log(
          formatStatusReport({
            runs: repository.listRecentRunSummaries(),
            candidates: repository.listCandidateStates(),
          }),
        );
      } finally {
        database.close();
      }

      return 0;
    }

    console.error(
      'Unknown command. Available commands: "run", "daemon", "status", "retry-failed", "reconcile", "plex-refresh", "plex-audit", "config".',
    );
    return 1;
  } catch (error) {
    const message =
      error instanceof ConfigError
        ? error.message
        : formatUnexpectedError(error);
    console.error(message);
    return 1;
  }
}

function formatReconcileSummary(result: {
  trackedCount: number;
  reconciledCount: number;
  updatedCount: number;
  missingCount: number;
}): string {
  return [
    `Tracked torrents: ${result.trackedCount}`,
    `reconciled: ${result.reconciledCount}`,
    `updated: ${result.updatedCount}`,
    `missing_from_transmission: ${result.missingCount}`,
  ].join('\n');
}

function openInitializedWritableDatabase() {
  if (!existsSync(DEFAULT_DATABASE_PATH)) {
    throw new Error(`Database not initialized. Run 'pirate-claw run' first.`);
  }

  const database = openDatabase();

  if (!hasStatusSchema(database)) {
    database.close();
    throw new Error(`Database not initialized. Run 'pirate-claw run' first.`);
  }

  return database;
}

function openStatusDatabase() {
  if (!existsSync(DEFAULT_DATABASE_PATH)) {
    throw new Error(`Database not initialized. Run 'pirate-claw run' first.`);
  }

  const database = openDatabaseReadOnly();

  if (!hasStatusSchema(database)) {
    database.close();
    throw new Error(`Database not initialized. Run 'pirate-claw run' first.`);
  }

  return database;
}

function formatRunSummary(result: {
  runId: number;
  counts: {
    queued: number;
    failed: number;
    dismissed: number;
    skipped_duplicate: number;
    skipped_no_match: number;
  };
}): string {
  return [
    `Run ${result.runId} completed.`,
    `queued: ${result.counts.queued}`,
    `failed: ${result.counts.failed}`,
    `dismissed: ${result.counts.dismissed}`,
    `skipped_duplicate: ${result.counts.skipped_duplicate}`,
    `skipped_no_match: ${result.counts.skipped_no_match}`,
  ].join('\n');
}

function formatStatusReport(input: {
  runs: RunSummaryRecord[];
  candidates: CandidateStateRecord[];
}): string {
  return [
    'Recent runs',
    ...formatRecentRuns(input.runs),
    '',
    'Candidate states',
    ...formatCandidateStates(input.candidates),
  ].join('\n');
}

function formatRecentRuns(runs: RunSummaryRecord[]): string[] {
  if (runs.length === 0) {
    return ['No runs recorded.'];
  }

  return runs.map(
    (run) =>
      `Run ${run.id} | status=${run.status} | started=${run.startedAt} | completed=${run.completedAt ?? '-'} | queued=${run.counts.queued} failed=${run.counts.failed} skipped_duplicate=${run.counts.skipped_duplicate} skipped_no_match=${run.counts.skipped_no_match}`,
  );
}

function deriveCandidateDisplayStatus(candidate: CandidateStateRecord): string {
  if (candidate.pirateClawDisposition === 'deleted') return 'deleted';
  if (!candidate.transmissionTorrentHash) return candidate.status;
  if (candidate.reconciledAt && candidate.transmissionStatusCode === undefined)
    return candidate.status;
  if (candidate.transmissionPercentDone === 1) return 'completed';
  if (candidate.pirateClawDisposition === 'removed') return 'removed';
  if (candidate.transmissionStatusCode === 0) return 'paused';
  return 'downloading';
}

function formatCandidateStates(candidates: CandidateStateRecord[]): string[] {
  if (candidates.length === 0) {
    return ['No candidate states recorded.'];
  }

  return sortCandidatesForStatus(candidates).map((candidate) =>
    [
      `${candidate.identityKey} | status=${deriveCandidateDisplayStatus(candidate)} | rule=${candidate.ruleName} | title=${candidate.normalizedTitle}`,
      formatCandidateMetadata(candidate),
      `updated=${candidate.updatedAt} | queued=${candidate.queuedAt ?? '-'} | reconciled=${candidate.reconciledAt ?? '-'}`,
    ].join('\n'),
  );
}

function formatCandidateMetadata(candidate: CandidateStateRecord): string {
  const details = [
    `media=${candidate.mediaType}`,
    candidate.season !== undefined ? `season=${candidate.season}` : undefined,
    candidate.episode !== undefined
      ? `episode=${candidate.episode}`
      : undefined,
    candidate.year !== undefined ? `year=${candidate.year}` : undefined,
    candidate.resolution ? `resolution=${candidate.resolution}` : undefined,
    candidate.codec ? `codec=${candidate.codec}` : undefined,
    candidate.transmissionPercentDone !== undefined
      ? `progress=${Math.round(candidate.transmissionPercentDone * 100)}%`
      : undefined,
    candidate.transmissionTorrentName
      ? `torrent=${candidate.transmissionTorrentName}`
      : undefined,
    `feed=${candidate.feedName}`,
  ].filter((value): value is string => value !== undefined);

  return details.join(' | ');
}

function sortCandidatesForStatus(
  candidates: CandidateStateRecord[],
): CandidateStateRecord[] {
  return [...candidates].sort((left, right) => {
    const leftTime = Date.parse(left.reconciledAt ?? left.updatedAt);
    const rightTime = Date.parse(right.reconciledAt ?? right.updatedAt);

    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return left.identityKey.localeCompare(right.identityKey);
  });
}

function formatUnexpectedError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

function parseConfigPath(argv: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--config') {
      const value = argv[index + 1];

      if (!value) {
        throw new ConfigError('Missing value for --config.');
      }

      return value;
    }
  }

  return undefined;
}

if (import.meta.main) {
  process.exitCode = await runCli(Bun.argv.slice(2));
}
