import { ConfigError, loadConfig, resolveConfigPath } from './config';

export async function runCli(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (command !== 'run') {
    console.error('Unknown command. Available commands: "run".');
    return 1;
  }

  const configPath = parseConfigPath(rest);

  try {
    await loadConfig(resolveConfigPath(configPath));
    console.log(`Config loaded from ${resolveConfigPath(configPath)}.`);
    return 0;
  } catch (error) {
    const message =
      error instanceof ConfigError ? error.message : 'Unexpected error.';
    console.error(message);
    return 1;
  }
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
