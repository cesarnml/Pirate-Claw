import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DAEMON_API_WRITE_TOKEN_FILE,
  GENERATED_CONFIG_DIRECTORY,
  INSTALL_ROOT_DIRECTORIES,
  RUNTIME_DATA_DIRECTORY,
  ensureFirstStartupBootstrap,
  generateSecretToken,
  installRootDataDir,
} from '../src/install-bootstrap';

describe('ensureFirstStartupBootstrap', () => {
  let installRoot: string | undefined;

  afterEach(async () => {
    if (installRoot) {
      await rm(installRoot, { recursive: true, force: true });
      installRoot = undefined;
    }
  });

  it('creates the Synology install root tree and generated daemon token on a clean root', async () => {
    installRoot = await mkdtemp(join(tmpdir(), 'pirate-claw-install-'));
    const configPath = join(installRoot, 'config', 'pirate-claw.config.json');

    const result = await ensureFirstStartupBootstrap({
      installRoot,
      configPath,
    });

    expect(result?.daemonApiWriteTokenCreated).toBe(true);

    for (const relativePath of INSTALL_ROOT_DIRECTORIES) {
      expect((await stat(join(installRoot, relativePath))).isDirectory()).toBe(
        true,
      );
    }

    const tokenPath = join(
      installRoot,
      'config',
      GENERATED_CONFIG_DIRECTORY,
      DAEMON_API_WRITE_TOKEN_FILE,
    );
    const token = (await Bun.file(tokenPath).text()).trim();
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it('leaves existing directories and generated secrets unchanged on second startup', async () => {
    installRoot = await mkdtemp(join(tmpdir(), 'pirate-claw-install-'));
    const configPath = join(installRoot, 'config', 'pirate-claw.config.json');

    const first = await ensureFirstStartupBootstrap({
      installRoot,
      configPath,
    });
    const firstToken = await Bun.file(first!.daemonApiWriteTokenPath).text();

    const second = await ensureFirstStartupBootstrap({
      installRoot,
      configPath,
    });
    const secondToken = await Bun.file(second!.daemonApiWriteTokenPath).text();

    expect(second?.daemonApiWriteTokenCreated).toBe(false);
    expect(secondToken).toBe(firstToken);
  });

  it('generates non-empty random-looking secret values', () => {
    const first = generateSecretToken();
    const second = generateSecretToken();

    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(second.length).toBeGreaterThanOrEqual(32);
    expect(second).not.toBe(first);
  });

  it('does nothing when no install root is configured', async () => {
    const result = await ensureFirstStartupBootstrap({
      installRoot: undefined,
      configPath: 'pirate-claw.config.json',
    });

    expect(result).toBeUndefined();
  });
});

describe('installRootDataDir', () => {
  const originalEnvInstallRoot = process.env.PIRATE_CLAW_INSTALL_ROOT;

  afterEach(() => {
    if (originalEnvInstallRoot === undefined) {
      delete process.env.PIRATE_CLAW_INSTALL_ROOT;
    } else {
      process.env.PIRATE_CLAW_INSTALL_ROOT = originalEnvInstallRoot;
    }
  });

  it('joins an explicitly-given install root with the runtime data directory', () => {
    // This is the exact call shape that must be threaded through from a
    // resolved config's runtime.installRoot — passing an explicit value here
    // must win regardless of what (if anything) is in the process env, since
    // the config file is a supported install-root source independent of the
    // PIRATE_CLAW_INSTALL_ROOT env var (see src/config.ts validateRuntime).
    process.env.PIRATE_CLAW_INSTALL_ROOT = '/env/should-not-be-used';

    expect(installRootDataDir('/volume1/pirate-claw')).toBe(
      `/volume1/pirate-claw/${RUNTIME_DATA_DIRECTORY}`,
    );
  });

  it('falls back to the environment variable only when no argument is given', () => {
    delete process.env.PIRATE_CLAW_INSTALL_ROOT;
    expect(installRootDataDir()).toBeUndefined();

    process.env.PIRATE_CLAW_INSTALL_ROOT = '/volume1/pirate-claw';
    expect(installRootDataDir()).toBe(
      `/volume1/pirate-claw/${RUNTIME_DATA_DIRECTORY}`,
    );
  });
});
