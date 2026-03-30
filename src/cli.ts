import { ConfigError, loadConfig, resolveConfigPath } from './config';
import { runPipeline } from './pipeline';
import { createRepository, ensureSchema, openDatabase } from './repository';
import { createTransmissionDownloader } from './transmission';

export async function runCli(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (command !== 'run') {
    console.error('Unknown command. Available commands: "run".');
    return 1;
  }

  try {
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
  } catch (error) {
    const message =
      error instanceof ConfigError
        ? error.message
        : formatUnexpectedError(error);
    console.error(message);
    return 1;
  }
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
