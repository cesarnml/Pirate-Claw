import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ensureSessionSecret } from './auth-state';

export const DEFAULT_SYNOLOGY_INSTALL_ROOT = '/volume1/pirate-claw';

export const INSTALL_ROOT_DIRECTORIES = [
  'config',
  'data',
  'downloads',
  'downloads/incomplete',
  'media',
  'media/movies',
  'media/shows',
  'transmission/config',
] as const;

export const GENERATED_CONFIG_DIRECTORY = 'generated';
export const DAEMON_API_WRITE_TOKEN_FILE = 'daemon-api-write-token';

export type FirstStartupBootstrapResult = {
  installRoot: string;
  configDir: string;
  daemonApiWriteTokenPath: string;
  daemonApiWriteTokenCreated: boolean;
  sessionSecretPath: string;
  sessionSecretCreated: boolean;
};

export async function ensureFirstStartupBootstrap(input: {
  installRoot: string | undefined;
  configPath: string;
}): Promise<FirstStartupBootstrapResult | undefined> {
  const installRoot = normalizeInstallRoot(input.installRoot);

  if (!installRoot) {
    return undefined;
  }

  for (const relativePath of INSTALL_ROOT_DIRECTORIES) {
    await mkdir(join(installRoot, relativePath), { recursive: true });
  }

  const configDir = dirname(input.configPath);
  await mkdir(configDir, { recursive: true });

  const generatedConfigDir = join(configDir, GENERATED_CONFIG_DIRECTORY);
  await mkdir(generatedConfigDir, { recursive: true });

  const daemonApiWriteTokenPath = join(
    generatedConfigDir,
    DAEMON_API_WRITE_TOKEN_FILE,
  );
  const tokenFile = Bun.file(daemonApiWriteTokenPath);
  const daemonApiWriteTokenCreated = !(await tokenFile.exists());

  if (daemonApiWriteTokenCreated) {
    await Bun.write(daemonApiWriteTokenPath, `${generateSecretToken()}\n`);
  }

  const sessionSecret = await ensureSessionSecret(configDir);

  return {
    installRoot,
    configDir,
    daemonApiWriteTokenPath,
    daemonApiWriteTokenCreated,
    sessionSecretPath: sessionSecret.path,
    sessionSecretCreated: sessionSecret.created,
  };
}

export function generatedDaemonApiWriteTokenPath(configPath: string): string {
  return join(
    dirname(configPath),
    GENERATED_CONFIG_DIRECTORY,
    DAEMON_API_WRITE_TOKEN_FILE,
  );
}

export function generateSecretToken(): string {
  return randomBytes(32).toString('base64url');
}

function normalizeInstallRoot(path: string | undefined): string | undefined {
  if (path === undefined) {
    return undefined;
  }

  const trimmed = path.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
