import { existsSync } from 'node:fs';

import { join } from 'node:path';

import { createApiFetch, createHealthState, recordCycleInHealth } from './api';
import { ConfigError, loadConfig, resolveConfigPath } from './config';
import { daemonOptionsFromConfig, runDaemonLoop } from './daemon';
import {
  reconcileCandidates,
  retryFailedCandidates,
  runPipeline,
} from './pipeline';
import {
  filterDueFeeds,
  loadPollState,
  recordFeedPolled,
  savePollState,
} from './poll-state';
import { pruneArtifacts, writeCycleArtifact } from './runtime-artifacts';
import {
  type CandidateLifecycleStatus,
  createRepository,
  ensureSchema,
  hasStatusSchema,
  openDatabase,
  openDatabaseReadOnly,
  DEFAULT_DATABASE_PATH,
  type CandidateStateRecord,
  type RunSummaryRecord,
} from './repository';
import { createTransmissionDownloader } from './transmission';

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

    if (command === 'daemon') {
      const configPath = parseConfigPath(rest);
      const resolvedConfigPath = resolveConfigPath(configPath);
      const config = await loadConfig(resolvedConfigPath);
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

        await runDaemonLoop({
          runCycle: async () => {
            let pollState = loadPollState(pollStatePath);
            const now = Date.now();
            const dueFeeds = filterDueFeeds(
              config.feeds,
              pollState,
              config.runtime,
              now,
            );

            if (dueFeeds.length === 0) {
              console.log('run cycle: no feeds due');
              return;
            }

            const result = await runPipeline({
              config: { ...config, feeds: dueFeeds },
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
          options: daemonOptionsFromConfig(config.runtime),
          signal: controller.signal,
          log,
          onCycleResult: (result) => {
            recordCycleInHealth(health, result);
            writeCycleArtifact(artifactDir, result);
            pruneArtifacts(artifactDir, artifactRetentionDays);
          },
          fetch:
            config.runtime.apiPort != null
              ? createApiFetch({ repository, health })
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
      'Unknown command. Available commands: "run", "daemon", "status", "retry-failed", "reconcile", "config".',
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
  counts: Record<CandidateLifecycleStatus, number>;
}): string {
  return [
    `Tracked torrents: ${result.trackedCount}`,
    `reconciled: ${result.reconciledCount}`,
    `queued: ${result.counts.queued}`,
    `downloading: ${result.counts.downloading}`,
    `completed: ${result.counts.completed}`,
    `missing_from_transmission: ${result.counts.missing_from_transmission}`,
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
    skipped_duplicate: number;
    skipped_no_match: number;
  };
}): string {
  return [
    `Run ${result.runId} completed.`,
    `queued: ${result.counts.queued}`,
    `failed: ${result.counts.failed}`,
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

function formatCandidateStates(candidates: CandidateStateRecord[]): string[] {
  if (candidates.length === 0) {
    return ['No candidate states recorded.'];
  }

  return sortCandidatesForStatus(candidates).map((candidate) =>
    [
      `${candidate.identityKey} | status=${candidate.lifecycleStatus ?? candidate.status} | rule=${candidate.ruleName} | title=${candidate.normalizedTitle}`,
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
