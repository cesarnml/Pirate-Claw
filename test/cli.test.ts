import { afterEach, describe, expect, it } from 'bun:test';

const tempDirs: string[] = [];
const cwd = process.cwd();
const bunExecutable = process.execPath;

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
      [
        bunExecutable,
        'run',
        './src/cli.ts',
        'run',
        '--config',
        './test/fixtures/valid-config.json',
      ],
      {
        cwd,
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

  it('fails fast when config is missing a required section', async () => {
    const directory = await mkdtemp();
    const configPath = `${directory}/missing-sections.json`;

    await Bun.write(
      configPath,
      JSON.stringify({
        feeds: [],
        tv: [],
        movies: [],
      }),
    );

    const child = Bun.spawn(
      [bunExecutable, 'run', './src/cli.ts', 'run', '--config', configPath],
      {
        cwd,
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

  it('fails fast when config JSON is malformed', async () => {
    const directory = await mkdtemp();
    const configPath = `${directory}/broken.json`;

    await Bun.write(configPath, '{not-json');

    const child = Bun.spawn(
      [bunExecutable, 'run', './src/cli.ts', 'run', '--config', configPath],
      {
        cwd,
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

  it('fails fast when movie policy uses the legacy title-based shape', async () => {
    const directory = await mkdtemp();
    const configPath = `${directory}/legacy-movie-shape.json`;

    await Bun.write(
      configPath,
      JSON.stringify({
        feeds: [],
        tv: [],
        movies: [
          {
            name: 'Example Movie',
            year: 2024,
            resolutions: ['1080p'],
            codecs: ['x265'],
          },
        ],
        transmission: {
          url: 'http://localhost:9091/transmission/rpc',
          username: 'user',
          password: 'pass',
        },
      }),
    );

    const child = Bun.spawn(
      [bunExecutable, 'run', './src/cli.ts', 'run', '--config', configPath],
      {
        cwd,
        stderr: 'pipe',
        stdout: 'pipe',
      },
    );

    const stdout = await new Response(child.stdout).text();
    const stderr = await new Response(child.stderr).text();
    const exitCode = await child.exited;

    expect(exitCode).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain(
      'has invalid "years"; expected a non-empty array of numbers',
    );
  });
});

async function mkdtemp(): Promise<string> {
  const child = Bun.spawn(['mktemp', '-d', '-t', 'media-sync-test'], {
    cwd,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const directory = (await new Response(child.stdout).text()).trim();

  if ((await child.exited) !== 0 || directory.length === 0) {
    throw new Error('Failed to create temporary directory for test.');
  }

  tempDirs.push(directory);
  return directory;
}
