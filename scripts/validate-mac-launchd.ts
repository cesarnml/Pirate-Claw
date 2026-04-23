import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

import { loadConfig } from '../src/config';
import { PlexAuthStore } from '../src/plex/auth';
import { openDatabase } from '../src/repository';
import type { RestartStatus } from '../src/restart-proof';

type ValidationSummary = {
  installDir: string;
  label: string;
  apiPort: number;
  webPort?: number;
  healthStartedAtBeforeRestart: string;
  healthStartedAtAfterRestart: string;
  restartStatus: RestartStatus;
  configPath: string;
  databasePath: string;
  restartProofPath: string;
  plexRefreshToken: string;
  validatedAt: string;
  browserProxyValidated: boolean;
};

type RunningProcess = {
  process: Bun.Subprocess<'ignore', 'pipe', 'pipe'>;
  stop: () => Promise<void>;
};

const WRITE_TOKEN = 'phase-26-mac-write-token';
const PLEX_REFRESH_TOKEN = 'phase-26-refresh-token';
const RESTART_TIMEOUT_MS = 60_000;
const HEALTH_TIMEOUT_MS = 30_000;

function parseArg(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return Bun.argv[index + 1];
}

function hasFlag(name: string): boolean {
  return Bun.argv.includes(name);
}

async function findFreePort(): Promise<number> {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Could not determine free TCP port.'));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePort(port);
      });
    });
  });
}

async function ensureSymlink(target: string, path: string): Promise<void> {
  try {
    await symlink(target, path);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'EEXIST') {
      throw error;
    }
  }
}

async function createValidationInstallDir(repoRoot: string): Promise<string> {
  const installDir = await mkdtemp(join(tmpdir(), 'pirate-claw-mac-launchd-'));
  await ensureSymlink(join(repoRoot, 'src'), join(installDir, 'src'));
  await ensureSymlink(
    join(repoRoot, 'node_modules'),
    join(installDir, 'node_modules'),
  );
  await ensureSymlink(
    join(repoRoot, 'package.json'),
    join(installDir, 'package.json'),
  );
  return installDir;
}

function buildValidationConfig(apiPort: number) {
  return {
    feeds: [],
    tv: {
      defaults: { resolutions: ['1080p'], codecs: ['x265'] },
      shows: [],
    },
    transmission: {
      url: 'http://127.0.0.1:9091/transmission/rpc',
      username: 'validation-user',
      password: 'validation-pass',
    },
    runtime: {
      runIntervalMinutes: 31,
      reconcileIntervalSeconds: 61,
      artifactDir: '.pirate-claw/runtime',
      artifactRetentionDays: 7,
      apiPort,
      apiWriteToken: WRITE_TOKEN,
      tmdbRefreshIntervalMinutes: 0,
    },
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(
      `Request failed for ${url}: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as T;
}

async function waitForJson<T>(
  load: () => Promise<T>,
  timeoutMs: number,
  description: string,
): Promise<T> {
  const startedAt = Date.now();
  let lastError: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await load();
    } catch (error) {
      lastError = error;
      await delay(500);
    }
  }

  throw new Error(
    `${description} did not succeed within ${timeoutMs}ms: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function installLaunchAgent(
  repoRoot: string,
  installDir: string,
  label: string,
): Promise<void> {
  const scriptPath = join(
    repoRoot,
    'docs',
    'mac-reference-pirate-claw-launch-agent.sh',
  );
  const proc = Bun.spawnSync({
    cmd: [
      'sh',
      scriptPath,
      'install',
      '--install-dir',
      installDir,
      '--label',
      label,
    ],
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (proc.exitCode !== 0) {
    throw new Error(
      new TextDecoder().decode(proc.stderr) || 'launch agent install failed',
    );
  }
}

async function uninstallLaunchAgent(
  repoRoot: string,
  label: string,
): Promise<void> {
  const scriptPath = join(
    repoRoot,
    'docs',
    'mac-reference-pirate-claw-launch-agent.sh',
  );
  Bun.spawnSync({
    cmd: ['sh', scriptPath, 'uninstall', '--label', label],
    cwd: repoRoot,
    stdout: 'ignore',
    stderr: 'ignore',
  });
}

async function startWebProxy(
  repoRoot: string,
  apiPort: number,
  webPort: number,
): Promise<RunningProcess> {
  const webServer = Bun.spawn({
    cmd: [
      'bun',
      'run',
      '--cwd',
      'web',
      'dev',
      '--host',
      '127.0.0.1',
      '--port',
      String(webPort),
    ],
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      PIRATE_CLAW_API_URL: `http://127.0.0.1:${apiPort}`,
      PIRATE_CLAW_API_WRITE_TOKEN: WRITE_TOKEN,
    },
  });

  await waitForJson(
    async () =>
      await fetchJson<{ currentDaemonStartedAt: string }>(
        `http://127.0.0.1:${webPort}/api/daemon/restart-status`,
      ),
    HEALTH_TIMEOUT_MS,
    'web restart-status proxy',
  );

  return {
    process: webServer,
    stop: async () => {
      webServer.kill('SIGTERM');
      await webServer.exited;
    },
  };
}

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dir, '..');
  const keepInstallDir = hasFlag('--keep-install-dir');
  const validateBrowserProxy = hasFlag('--validate-browser-proxy');
  const requestedInstallDir = parseArg('--install-dir');
  const installDir = requestedInstallDir
    ? resolve(requestedInstallDir)
    : await createValidationInstallDir(repoRoot);
  const apiPort =
    Number.parseInt(parseArg('--api-port') ?? '', 10) || (await findFreePort());
  const webPort = validateBrowserProxy
    ? Number.parseInt(parseArg('--web-port') ?? '', 10) ||
      (await findFreePort())
    : undefined;
  const label =
    parseArg('--label') ??
    `dev.pirate-claw.phase26.validation.${Date.now().toString(36)}`;
  const configPath = join(installDir, 'pirate-claw.config.json');
  const databasePath = join(installDir, 'pirate-claw.db');
  const artifactDir = join(installDir, '.pirate-claw', 'runtime');
  const restartProofPath = join(artifactDir, 'restart-proof.json');
  let webProcess: RunningProcess | undefined;

  try {
    await mkdir(join(installDir, '.pirate-claw', 'runtime'), {
      recursive: true,
    });
    await writeFile(
      configPath,
      `${JSON.stringify(buildValidationConfig(apiPort), null, 2)}\n`,
    );

    await installLaunchAgent(repoRoot, installDir, label);

    const healthBeforeRestart = await waitForJson<{ startedAt: string }>(
      () => fetchJson(`http://127.0.0.1:${apiPort}/api/health`),
      HEALTH_TIMEOUT_MS,
      'daemon health check',
    );

    if (webPort != null) {
      webProcess = await startWebProxy(repoRoot, apiPort, webPort);
    }

    const database = openDatabase(databasePath);
    try {
      const store = new PlexAuthStore(database);
      store.completeRenewal(PLEX_REFRESH_TOKEN, {
        authenticatedAt: '2026-04-23T10:00:00.000Z',
        tokenExpiresAt: '2026-05-23T10:00:00.000Z',
      });
    } finally {
      database.close();
    }

    const restart = await fetchJson<{ restartStatus: RestartStatus }>(
      `http://127.0.0.1:${apiPort}/api/daemon/restart`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${WRITE_TOKEN}`,
        },
      },
    );

    if (restart.restartStatus.state !== 'requested') {
      throw new Error(
        `Expected requested restart state, received ${restart.restartStatus.state}.`,
      );
    }
    const requestId = restart.restartStatus.requestId;

    const restartStatus = await waitForJson<RestartStatus>(
      async () => {
        const status = await fetchJson<RestartStatus>(
          `http://127.0.0.1:${apiPort}/api/daemon/restart-status`,
        );
        if (status.state === 'back_online' && status.requestId === requestId) {
          return status;
        }
        throw new Error(`Restart still pending: ${JSON.stringify(status)}`);
      },
      RESTART_TIMEOUT_MS,
      'restart round-trip proof',
    );

    const healthAfterRestart = await waitForJson<{ startedAt: string }>(
      () => fetchJson(`http://127.0.0.1:${apiPort}/api/health`),
      HEALTH_TIMEOUT_MS,
      'post-restart daemon health check',
    );

    if (healthAfterRestart.startedAt === healthBeforeRestart.startedAt) {
      throw new Error(
        'Daemon startedAt did not change across launchd-managed restart.',
      );
    }

    const persistedConfig = await loadConfig(configPath);
    if (persistedConfig.runtime.runIntervalMinutes !== 31) {
      throw new Error(
        'Config did not survive restart with the expected runtime marker.',
      );
    }

    const reopenedDatabase = openDatabase(databasePath);
    try {
      const identity = new PlexAuthStore(reopenedDatabase).getIdentity();
      if (!identity || identity.refreshToken !== PLEX_REFRESH_TOKEN) {
        throw new Error(
          'Persisted Plex auth identity did not survive restart.',
        );
      }
    } finally {
      reopenedDatabase.close();
    }

    const restartProof = JSON.parse(
      await readFile(restartProofPath, 'utf8'),
    ) as {
      state?: string;
      requestId?: string;
    };
    if (
      restartProof.state !== 'back_online' ||
      restartProof.requestId !== requestId
    ) {
      throw new Error(
        'restart-proof.json did not resolve to the expected back_online record.',
      );
    }

    if (webPort != null) {
      const proxiedStatus = await fetchJson<RestartStatus>(
        `http://127.0.0.1:${webPort}/api/daemon/restart-status`,
      );
      if (
        proxiedStatus.state !== 'back_online' ||
        proxiedStatus.requestId !== requestId
      ) {
        throw new Error(
          'Web restart-status proxy did not reflect the same back_online proof.',
        );
      }
    }

    const summary: ValidationSummary = {
      installDir,
      label,
      apiPort,
      webPort,
      healthStartedAtBeforeRestart: healthBeforeRestart.startedAt,
      healthStartedAtAfterRestart: healthAfterRestart.startedAt,
      restartStatus,
      configPath,
      databasePath,
      restartProofPath,
      plexRefreshToken: PLEX_REFRESH_TOKEN,
      validatedAt: new Date().toISOString(),
      browserProxyValidated: webPort != null,
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (webProcess) {
      await webProcess.stop();
    }
    await uninstallLaunchAgent(repoRoot, label);
    if (!keepInstallDir && !requestedInstallDir) {
      await rm(installDir, { recursive: true, force: true });
    }
  }
}

await main();
