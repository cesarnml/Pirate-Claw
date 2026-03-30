import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp as createTempDir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

const tempDirs: string[] = [];
const cwd = process.cwd();
const bunExecutable = process.execPath;
const cliExecutable = './bin/media-sync';
const binPath = dirname(bunExecutable);
const env = {
  ...process.env,
  PATH: `${binPath}${delimiter}${process.env.PATH ?? ''}`,
};

describe('media-sync run', () => {
  afterEach(async () => {
    while (tempDirs.length > 0) {
      const directory = tempDirs.pop();

      if (directory) {
        await Bun.$`rm -rf ${directory}`;
      }
    }
  });

  it('loads config passed with --config', async () => {
    const child = Bun.spawn(
      [cliExecutable, 'run', '--config', './test/fixtures/valid-config.json'],
      {
        cwd,
        env,
        stderr: 'pipe',
        stdout: 'pipe',
      },
    );

    const stdout = await new Response(child.stdout).text();
    const stderr = await new Response(child.stderr).text();
    const exitCode = await child.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toContain(
      'Config loaded from ./test/fixtures/valid-config.json.',
    );
    expect(stderr).toBe('');
  });

  it('exits with a readable error when config is missing a required section', async () => {
    const directory = await mkdtemp();
    const configPath = `${directory}/missing-sections.json`;

    await Bun.write(
      configPath,
      JSON.stringify({
        feeds: [],
        tv: [],
        movies: {
          years: [2024],
          resolutions: ['1080p'],
          codecs: ['x265'],
        },
      }),
    );

    const child = Bun.spawn(
      [bunExecutable, 'run', './src/cli.ts', 'run', '--config', configPath],
      {
        cwd,
        env,
        stderr: 'pipe',
        stdout: 'pipe',
      },
    );

    const stdout = await new Response(child.stdout).text();
    const stderr = await new Response(child.stderr).text();
    const exitCode = await child.exited;

    expect(exitCode).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('missing required object section "transmission"');
  });

  it('exits with a readable error when config JSON is malformed', async () => {
    const directory = await mkdtemp();
    const configPath = `${directory}/broken.json`;

    await Bun.write(configPath, '{not-json');

    const child = Bun.spawn(
      [bunExecutable, 'run', './src/cli.ts', 'run', '--config', configPath],
      {
        cwd,
        env,
        stderr: 'pipe',
        stdout: 'pipe',
      },
    );

    const stdout = await new Response(child.stdout).text();
    const stderr = await new Response(child.stderr).text();
    const exitCode = await child.exited;

    expect(exitCode).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('contains invalid JSON');
  });

  it('exits with a readable error when --config is passed without a value', async () => {
    const child = Bun.spawn(
      [bunExecutable, 'run', './src/cli.ts', 'run', '--config'],
      {
        cwd,
        env,
        stderr: 'pipe',
        stdout: 'pipe',
      },
    );

    const stdout = await new Response(child.stdout).text();
    const stderr = await new Response(child.stderr).text();
    const exitCode = await child.exited;

    expect(exitCode).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('Missing value for --config.');
  });
});

async function mkdtemp(): Promise<string> {
  const directory = await createTempDir(join(tmpdir(), 'media-sync-test-'));

  tempDirs.push(directory);
  return directory;
}
