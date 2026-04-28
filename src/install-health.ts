import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { AppConfig } from './config';
import {
  DEFAULT_TRANSMISSION_DOWNLOAD_DIR_MOVIE,
  DEFAULT_TRANSMISSION_DOWNLOAD_DIR_TV,
} from './config';
import {
  DAEMON_API_WRITE_TOKEN_FILE,
  DEFAULT_SYNOLOGY_INSTALL_ROOT,
  GENERATED_CONFIG_DIRECTORY,
  INSTALL_ROOT_DIRECTORIES,
} from './install-bootstrap';
import { fetchFreeSpace, fetchSessionInfo } from './transmission';

export type InstallHealthStatus = 'pass' | 'fail' | 'skip';

export type InstallHealthCheck = {
  status: InstallHealthStatus;
  remediation: string;
  detail?: string;
};

export type InstallHealthResponse = {
  healthy: boolean;
  installRoot: string;
  checks: Record<string, InstallHealthCheck>;
};

const DEFAULT_TRANSMISSION_DOWNLOADS_PATH = '/downloads';

export async function getInstallHealth(
  config: AppConfig,
): Promise<InstallHealthResponse> {
  const installRoot =
    config.runtime.installRoot ?? DEFAULT_SYNOLOGY_INSTALL_ROOT;
  const checks: Record<string, InstallHealthCheck> = {};

  checks.installRoot = await checkDirectoryExists(
    installRoot,
    `Open File Station and create the shared folder path ${installRoot}, then rerun the package or restart the Pirate Claw containers.`,
  );

  for (const relativePath of INSTALL_ROOT_DIRECTORIES) {
    checks[directoryCheckName(relativePath)] = await checkDirectoryExists(
      join(installRoot, relativePath),
      `Open File Station and create ${installRoot}/${relativePath} through the DSM interface.`,
    );
  }

  for (const [name, relativePath] of [
    ['writableConfig', 'config'],
    ['writableData', 'data'],
    ['writableDownloads', 'downloads'],
    ['writableDownloadsIncomplete', 'downloads/incomplete'],
    ['writableMediaMovies', 'media/movies'],
    ['writableMediaShows', 'media/shows'],
  ] as const) {
    checks[name] = await checkWritableDirectory(
      join(installRoot, relativePath),
      `In DSM File Station, give the Pirate Claw and Docker package users read/write access to ${installRoot}/${relativePath}.`,
    );
  }

  checks.daemonWriteToken = checkDaemonWriteToken(config);

  const session = await fetchSessionInfo(config.transmission);
  if (session.ok) {
    checks.transmissionRpcReachable = pass(
      'Bundled Transmission RPC answered.',
    );
    checks.transmissionAuthenticated = pass(
      'Bundled Transmission RPC session opened.',
    );
  } else if (
    session.code === 'http_error' &&
    /HTTP (401|403)/.test(session.message)
  ) {
    checks.transmissionRpcReachable = pass(
      'Bundled Transmission RPC answered.',
    );
    checks.transmissionAuthenticated = fail(
      'Open Docker, inspect the Transmission container settings, and verify Pirate Claw uses the bundled Transmission service without hand-entered credentials.',
      session.message,
    );
  } else {
    checks.transmissionRpcReachable = fail(
      'Open Docker and confirm the transmission container is running on the Pirate Claw network.',
      session.message,
    );
    checks.transmissionAuthenticated = skip(
      'Fix bundled Transmission reachability first, then reload the Pirate Claw first-run page.',
    );
  }

  const transmissionReady = checks.transmissionAuthenticated.status === 'pass';
  await addTransmissionPathCheck({
    checks,
    key: 'transmissionDownloadsWritable',
    config,
    path:
      config.transmission.downloadDir ??
      config.transmission.downloadDirs?.movie ??
      config.transmission.downloadDirs?.tv ??
      DEFAULT_TRANSMISSION_DOWNLOADS_PATH,
    transmissionReady,
    remediation:
      'Open Docker and confirm the Transmission container has the Pirate Claw downloads folder mounted at /downloads with read/write access.',
  });
  await addTransmissionPathCheck({
    checks,
    key: 'transmissionMoviesWritable',
    config,
    path:
      config.transmission.downloadDirs?.movie ??
      DEFAULT_TRANSMISSION_DOWNLOAD_DIR_MOVIE,
    transmissionReady,
    remediation:
      'Open Docker and confirm the Transmission container has the Pirate Claw movie media folder mounted at /media/movies with read/write access.',
  });
  await addTransmissionPathCheck({
    checks,
    key: 'transmissionShowsWritable',
    config,
    path:
      config.transmission.downloadDirs?.tv ??
      DEFAULT_TRANSMISSION_DOWNLOAD_DIR_TV,
    transmissionReady,
    remediation:
      'Open Docker and confirm the Transmission container has the Pirate Claw show media folder mounted at /media/shows with read/write access.',
  });

  return {
    healthy: Object.values(checks).every((check) => check.status === 'pass'),
    installRoot,
    checks,
  };
}

function directoryCheckName(relativePath: string): string {
  return `directory${relativePath
    .split('/')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')}`;
}

async function checkDirectoryExists(
  path: string,
  remediation: string,
): Promise<InstallHealthCheck> {
  try {
    const info = await stat(path);
    if (!info.isDirectory()) {
      return fail(remediation, `${path} exists but is not a directory.`);
    }
    return pass(`${path} exists.`);
  } catch (error) {
    return fail(remediation, formatError(error));
  }
}

async function checkWritableDirectory(
  path: string,
  remediation: string,
): Promise<InstallHealthCheck> {
  try {
    await access(path, constants.W_OK);
    const probePath = join(path, `.pirate-claw-health-${randomUUID()}`);
    await writeFile(probePath, 'ok', { flag: 'wx' });
    await unlink(probePath);
    return pass(`${path} is writable.`);
  } catch (error) {
    return fail(remediation, formatError(error));
  }
}

function checkDaemonWriteToken(config: AppConfig): InstallHealthCheck {
  const token = config.runtime.apiWriteToken?.trim();
  if (token) {
    return pass('Daemon write token is loaded.');
  }

  return fail(
    `Restart the Pirate Claw daemon container so it can generate ${GENERATED_CONFIG_DIRECTORY}/${DAEMON_API_WRITE_TOKEN_FILE}, then reload the first-run page.`,
  );
}

async function addTransmissionPathCheck(input: {
  checks: Record<string, InstallHealthCheck>;
  key: string;
  config: AppConfig;
  path: string;
  transmissionReady: boolean;
  remediation: string;
}): Promise<void> {
  if (!input.transmissionReady) {
    input.checks[input.key] = skip(
      'Fix bundled Transmission reachability first, then reload the Pirate Claw first-run page.',
    );
    return;
  }

  const result = await fetchFreeSpace(input.config.transmission, input.path);
  input.checks[input.key] = result.ok
    ? pass(`Transmission can inspect ${input.path}.`)
    : fail(input.remediation, result.message);
}

function pass(detail: string): InstallHealthCheck {
  return { status: 'pass', remediation: '', detail };
}

function fail(remediation: string, detail?: string): InstallHealthCheck {
  return { status: 'fail', remediation, ...(detail ? { detail } : {}) };
}

function skip(remediation: string): InstallHealthCheck {
  return { status: 'skip', remediation };
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
