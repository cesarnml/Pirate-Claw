import { existsSync } from 'node:fs';

import { ConfigError, loadConfig, resolveConfigPath } from './config';
import {
  reconcileCandidates,
  retryFailedCandidates,
  runPipeline,
} from './pipeline';
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
      'Unknown command. Available commands: "run", "status", "retry-failed", "reconcile".',
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
  notFoundCount: number;
  counts: Record<CandidateLifecycleStatus, number>;
}): string {
  return [
    `Tracked torrents: ${result.trackedCount}`,
    `reconciled: ${result.reconciledCount}`,
    `not_found: ${result.notFoundCount}`,
    `queued: ${result.counts.queued}`,
    `downloading: ${result.counts.downloading}`,
    `completed: ${result.counts.completed}`,
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

  return candidates.map((candidate) =>
    [
      `${candidate.identityKey} | status=${candidate.status} | rule=${candidate.ruleName} | title=${candidate.normalizedTitle}`,
      formatCandidateMetadata(candidate),
      `updated=${candidate.updatedAt} | queued=${candidate.queuedAt ?? '-'}`,
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
    `feed=${candidate.feedName}`,
  ].filter((value): value is string => value !== undefined);

  return details.join(' | ');
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
  const exitCode = await runCli(Bun.argv.slice(2));
  process.exit(exitCode);
}
