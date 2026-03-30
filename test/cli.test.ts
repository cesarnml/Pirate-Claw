import type { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp as createTempDir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

import {
  createRepository,
  ensureSchema,
  openDatabase,
} from '../src/repository';

const tempDirs: string[] = [];
const openDatabases: Database[] = [];
const servers: Array<ReturnType<typeof Bun.serve>> = [];
const cwd = process.cwd();
const bunExecutable = process.execPath;
const cliExecutable = join(cwd, 'bin/media-sync');
const binPath = dirname(bunExecutable);
const env = {
  ...process.env,
  PATH: `${binPath}${delimiter}${process.env.PATH ?? ''}`,
};

describe('media-sync run', () => {
  afterEach(async () => {
    while (openDatabases.length > 0) {
      openDatabases.pop()?.close();
    }

    while (servers.length > 0) {
      servers.pop()?.stop(true);
    }

    while (tempDirs.length > 0) {
      const directory = tempDirs.pop();

      if (directory) {
        await Bun.$`rm -rf ${directory}`;
      }
    }
  });

  it('runs the end-to-end pipeline and persists per-feed-item outcomes', async () => {
    const directory = await mkdtemp();
    const feedServer = startFeedServer();
    const transmissionServer = startTransmissionServer();
    const configPath = join(directory, 'media-sync.config.json');

    await Bun.write(
      configPath,
      JSON.stringify(
        {
          feeds: [
            {
              name: 'TV Feed',
              url: `${feedServer.url}/tv.rss`,
              mediaType: 'tv',
            },
            {
              name: 'Movie Feed',
              url: `${feedServer.url}/movie.rss`,
              mediaType: 'movie',
            },
          ],
          tv: [
            {
              name: 'Example Show',
              resolutions: ['1080p'],
              codecs: ['x265'],
            },
          ],
          movies: {
            years: [2024],
            resolutions: ['2160p', '1080p'],
            codecs: ['x265'],
          },
          transmission: {
            url: `${transmissionServer.url}/transmission/rpc`,
            username: 'user',
            password: 'pass',
          },
        },
        null,
        2,
      ),
    );

    const firstRun = await runCliCommand(directory, './media-sync.config.json');

    expect(firstRun.exitCode).toBe(0);
    expect(firstRun.stderr).toBe('');
    expect(firstRun.stdout).toContain('Run 1 completed.');
    expect(firstRun.stdout).toContain('queued: 1');
    expect(firstRun.stdout).toContain('failed: 1');
    expect(firstRun.stdout).toContain('skipped_duplicate: 1');
    expect(firstRun.stdout).toContain('skipped_no_match: 1');

    const secondRun = await runCliCommand(
      directory,
      './media-sync.config.json',
    );

    expect(secondRun.exitCode).toBe(0);
    expect(secondRun.stderr).toBe('');
    expect(secondRun.stdout).toContain('Run 2 completed.');
    expect(secondRun.stdout).toContain('queued: 0');
    expect(secondRun.stdout).toContain('failed: 1');
    expect(secondRun.stdout).toContain('skipped_duplicate: 2');
    expect(secondRun.stdout).toContain('skipped_no_match: 1');

    const repository = createTestRepository(join(directory, 'media-sync.db'));
    const firstRunOutcomes = repository.listFeedItemOutcomes(1);
    const secondRunOutcomes = repository.listFeedItemOutcomes(2);

    expect(firstRunOutcomes.map((outcome) => outcome.status)).toEqual([
      'skipped_no_match',
      'skipped_duplicate',
      'queued',
      'failed',
    ]);
    expect(secondRunOutcomes.map((outcome) => outcome.status)).toEqual([
      'skipped_no_match',
      'skipped_duplicate',
      'skipped_duplicate',
      'failed',
    ]);
    expect(
      firstRunOutcomes.find((outcome) => outcome.status === 'failed')?.message,
    ).toContain('torrent rejected by policy');
    expect(
      secondRunOutcomes.find(
        (outcome) =>
          outcome.status === 'skipped_duplicate' &&
          outcome.message?.includes('previous run'),
      ),
    ).toBeDefined();
    expect(
      repository.getCandidateState('movie:example movie|2024'),
    ).toMatchObject({
      queuedAt: expect.any(String),
    });
    expect(repository.getCandidateState('movie:retry me|2024')).toMatchObject({
      status: 'failed',
      queuedAt: undefined,
    });
    expect(transmissionServer.requestCount).toBe(6);
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

describe('media-sync status', () => {
  afterEach(async () => {
    while (openDatabases.length > 0) {
      openDatabases.pop()?.close();
    }

    while (servers.length > 0) {
      servers.pop()?.stop(true);
    }

    while (tempDirs.length > 0) {
      const directory = tempDirs.pop();

      if (directory) {
        await Bun.$`rm -rf ${directory}`;
      }
    }
  });

  it('prints recent run summaries and current candidate states without mutating the database', async () => {
    const directory = await mkdtemp();
    const repository = createTestRepository(join(directory, 'media-sync.db'));

    const firstRun = repository.startRun('2026-03-30T00:00:00.000Z');
    repository.recordFeedItemOutcome({
      runId: firstRun.id,
      status: 'queued',
      createdAt: '2026-03-30T00:10:00.000Z',
    });
    repository.completeRun(firstRun.id, '2026-03-30T00:12:00.000Z');

    const secondRun = repository.startRun('2026-03-30T01:00:00.000Z');
    repository.recordFeedItemOutcome({
      runId: secondRun.id,
      status: 'failed',
      createdAt: '2026-03-30T01:10:00.000Z',
    });
    repository.recordFeedItemOutcome({
      runId: secondRun.id,
      status: 'skipped_duplicate',
      createdAt: '2026-03-30T01:11:00.000Z',
    });
    repository.completeRun(secondRun.id, '2026-03-30T01:12:00.000Z');

    const queuedFeedItem = repository.recordFeedItem(firstRun.id, {
      feedName: 'Movie Feed',
      guidOrLink: 'https://example.test/releases/example-movie-web',
      rawTitle: 'Example.Movie.2024.1080p.WEB.x265-GROUP',
      publishedAt: '2026-03-30T00:05:00.000Z',
      downloadUrl: 'https://example.test/downloads/example-movie-web.torrent',
    });
    repository.recordCandidateOutcome({
      runId: firstRun.id,
      feedItemId: queuedFeedItem.id,
      feedItem: queuedFeedItem,
      match: {
        ruleName: 'movie-policy',
        identityKey: 'movie:example movie|2024',
        score: 10,
        reasons: ['year matched'],
        item: {
          mediaType: 'movie',
          rawTitle: queuedFeedItem.rawTitle,
          normalizedTitle: 'example movie',
          year: 2024,
          resolution: '1080p',
          codec: 'x265',
        },
      },
      status: 'queued',
      updatedAt: '2026-03-30T00:10:00.000Z',
    });

    const failedFeedItem = repository.recordFeedItem(secondRun.id, {
      feedName: 'Movie Feed',
      guidOrLink: 'https://example.test/releases/retry-me-web',
      rawTitle: 'Retry.Me.2024.1080p.WEB.x265-GROUP',
      publishedAt: '2026-03-30T01:05:00.000Z',
      downloadUrl: 'https://example.test/downloads/retry-me-web.torrent',
    });
    repository.recordCandidateOutcome({
      runId: secondRun.id,
      feedItemId: failedFeedItem.id,
      feedItem: failedFeedItem,
      match: {
        ruleName: 'movie-policy',
        identityKey: 'movie:retry me|2024',
        score: 10,
        reasons: ['year matched'],
        item: {
          mediaType: 'movie',
          rawTitle: failedFeedItem.rawTitle,
          normalizedTitle: 'retry me',
          year: 2024,
          resolution: '1080p',
          codec: 'x265',
        },
      },
      status: 'failed',
      updatedAt: '2026-03-30T01:10:00.000Z',
    });

    const runsBefore = repository.listRecentRunSummaries();
    const candidatesBefore = repository.listCandidateStates();

    const status = await runSimpleCommand(directory, 'status');

    expect(status.exitCode).toBe(0);
    expect(status.stderr).toBe('');
    expect(status.stdout).toContain('Recent runs');
    expect(status.stdout).toContain(
      'Run 2 | status=completed | started=2026-03-30T01:00:00.000Z | completed=2026-03-30T01:12:00.000Z | queued=0 failed=1 skipped_duplicate=1 skipped_no_match=0',
    );
    expect(status.stdout).toContain(
      'Run 1 | status=completed | started=2026-03-30T00:00:00.000Z | completed=2026-03-30T00:12:00.000Z | queued=1 failed=0 skipped_duplicate=0 skipped_no_match=0',
    );
    expect(status.stdout).toContain('Candidate states');
    expect(status.stdout).toContain(
      'movie:retry me|2024 | status=failed | rule=movie-policy | title=retry me',
    );
    expect(status.stdout).toContain(
      'movie:example movie|2024 | status=queued | rule=movie-policy | title=example movie',
    );

    expect(repository.listRecentRunSummaries()).toEqual(runsBefore);
    expect(repository.listCandidateStates()).toEqual(candidatesBefore);
  });

  it('fails without creating a database when status is run before initialization', async () => {
    const directory = await mkdtemp();
    const databasePath = join(directory, 'media-sync.db');

    expect(existsSync(databasePath)).toBe(false);

    const status = await runSimpleCommand(directory, 'status');

    expect(status.exitCode).toBe(1);
    expect(status.stdout).toBe('');
    expect(status.stderr).toContain(
      `Database not initialized. Run 'media-sync run' first.`,
    );
    expect(existsSync(databasePath)).toBe(false);
  });
});

describe('media-sync retry-failed', () => {
  afterEach(async () => {
    while (openDatabases.length > 0) {
      openDatabases.pop()?.close();
    }

    while (servers.length > 0) {
      servers.pop()?.stop(true);
    }

    while (tempDirs.length > 0) {
      const directory = tempDirs.pop();

      if (directory) {
        await Bun.$`rm -rf ${directory}`;
      }
    }
  });

  it('retries only failed candidates from SQLite and updates successful retries to queued', async () => {
    const directory = await mkdtemp();
    const transmissionServer = startFlakyRetryTransmissionServer();
    const configPath = join(directory, 'media-sync.config.json');
    const repository = createTestRepository(join(directory, 'media-sync.db'));

    await Bun.write(
      configPath,
      JSON.stringify({
        feeds: [],
        tv: [],
        movies: {
          years: [2024],
          resolutions: ['2160p', '1080p'],
          codecs: ['x265'],
        },
        transmission: {
          url: `${transmissionServer.url}/transmission/rpc`,
          username: 'user',
          password: 'pass',
        },
      }),
    );

    seedQueuedMovieCandidate(repository, {
      runId: repository.startRun('2026-03-30T00:00:00.000Z').id,
      rawTitle: 'Example.Movie.2024.1080p.WEB.x265-GROUP',
      guidOrLink: 'https://example.test/releases/example-movie-web',
      downloadUrl: 'https://example.test/downloads/example-movie-web.torrent',
      updatedAt: '2026-03-30T00:10:00.000Z',
      status: 'queued',
    });

    seedQueuedMovieCandidate(repository, {
      runId: repository.startRun('2026-03-30T01:00:00.000Z').id,
      rawTitle: 'Retry.Me.2024.1080p.WEB.x265-GROUP',
      guidOrLink: 'https://example.test/releases/retry-me-web',
      downloadUrl: 'https://example.test/downloads/retry-me-web.torrent',
      updatedAt: '2026-03-30T01:10:00.000Z',
      status: 'failed',
    });

    const retry = await runSimpleCommand(
      directory,
      'retry-failed',
      '--config',
      './media-sync.config.json',
    );

    expect(retry.exitCode).toBe(0);
    expect(retry.stderr).toBe('');
    expect(retry.stdout).toContain('Run 3 completed.');
    expect(retry.stdout).toContain('queued: 1');
    expect(retry.stdout).toContain('failed: 0');
    expect(retry.stdout).toContain('skipped_duplicate: 0');
    expect(retry.stdout).toContain('skipped_no_match: 0');
    expect(repository.listFeedItemOutcomes(3)).toMatchObject([
      {
        status: 'queued',
        identityKey: 'movie:retry me|2024',
        ruleName: 'movie-policy',
        message: 'Queued in Transmission.',
      },
    ]);
    expect(repository.getCandidateState('movie:retry me|2024')).toMatchObject({
      status: 'queued',
      queuedAt: expect.any(String),
    });
    expect(
      repository.getCandidateState('movie:example movie|2024'),
    ).toMatchObject({
      status: 'queued',
    });
    expect(transmissionServer.requestedUrls).toEqual([
      'https://example.test/downloads/retry-me-web.torrent',
    ]);
  });

  it('keeps failed candidates failed when the retry attempt still fails', async () => {
    const directory = await mkdtemp();
    const transmissionServer = startTransmissionServer();
    const configPath = join(directory, 'media-sync.config.json');
    const repository = createTestRepository(join(directory, 'media-sync.db'));

    await Bun.write(
      configPath,
      JSON.stringify({
        feeds: [],
        tv: [],
        movies: {
          years: [2024],
          resolutions: ['2160p', '1080p'],
          codecs: ['x265'],
        },
        transmission: {
          url: `${transmissionServer.url}/transmission/rpc`,
          username: 'user',
          password: 'pass',
        },
      }),
    );

    seedQueuedMovieCandidate(repository, {
      runId: repository.startRun('2026-03-30T00:00:00.000Z').id,
      rawTitle: 'Retry.Me.2024.1080p.WEB.x265-GROUP',
      guidOrLink: 'https://example.test/releases/retry-me-web',
      downloadUrl: 'https://example.test/downloads/retry-me-web.torrent',
      updatedAt: '2026-03-30T00:10:00.000Z',
      status: 'failed',
    });

    const retry = await runSimpleCommand(
      directory,
      'retry-failed',
      '--config',
      './media-sync.config.json',
    );

    expect(retry.exitCode).toBe(0);
    expect(retry.stderr).toBe('');
    expect(retry.stdout).toContain('Run 2 completed.');
    expect(retry.stdout).toContain('queued: 0');
    expect(retry.stdout).toContain('failed: 1');
    expect(repository.listFeedItemOutcomes(2)).toMatchObject([
      {
        status: 'failed',
        identityKey: 'movie:retry me|2024',
        ruleName: 'movie-policy',
      },
    ]);
    expect(repository.getCandidateState('movie:retry me|2024')).toMatchObject({
      status: 'failed',
      queuedAt: undefined,
    });
    expect(transmissionServer.requestCount).toBe(2);
  });

  it('fails without creating a database when retry-failed is run before initialization', async () => {
    const directory = await mkdtemp();
    const databasePath = join(directory, 'media-sync.db');
    const configPath = join(directory, 'media-sync.config.json');

    await Bun.write(
      configPath,
      JSON.stringify({
        feeds: [],
        tv: [],
        movies: {
          years: [2024],
          resolutions: ['2160p', '1080p'],
          codecs: ['x265'],
        },
        transmission: {
          url: 'http://127.0.0.1:9091/transmission/rpc',
          username: 'user',
          password: 'pass',
        },
      }),
    );

    expect(existsSync(databasePath)).toBe(false);

    const retry = await runSimpleCommand(
      directory,
      'retry-failed',
      '--config',
      './media-sync.config.json',
    );

    expect(retry.exitCode).toBe(1);
    expect(retry.stdout).toBe('');
    expect(retry.stderr).toContain(
      `Database not initialized. Run 'media-sync run' first.`,
    );
    expect(existsSync(databasePath)).toBe(false);
  });
});

async function mkdtemp(): Promise<string> {
  const directory = await createTempDir(join(tmpdir(), 'media-sync-test-'));

  tempDirs.push(directory);
  return directory;
}

async function runCliCommand(
  commandCwd: string,
  configPath: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return runSimpleCommand(commandCwd, 'run', '--config', configPath);
}

async function runSimpleCommand(
  commandCwd: string,
  ...args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const child = Bun.spawn([cliExecutable, ...args], {
    cwd: commandCwd,
    env,
    stderr: 'pipe',
    stdout: 'pipe',
  });

  return {
    stdout: await new Response(child.stdout).text(),
    stderr: await new Response(child.stderr).text(),
    exitCode: await child.exited,
  };
}

function createTestRepository(path: string) {
  const database = openDatabase(path);

  openDatabases.push(database);
  ensureSchema(database);
  return createRepository(database);
}

function seedQueuedMovieCandidate(
  repository: ReturnType<typeof createRepository>,
  input: {
    runId: number;
    rawTitle: string;
    guidOrLink: string;
    downloadUrl: string;
    updatedAt: string;
    status: 'queued' | 'failed';
  },
) {
  const feedItem = repository.recordFeedItem(input.runId, {
    feedName: 'Movie Feed',
    guidOrLink: input.guidOrLink,
    rawTitle: input.rawTitle,
    publishedAt: input.updatedAt,
    downloadUrl: input.downloadUrl,
  });

  repository.recordCandidateOutcome({
    runId: input.runId,
    feedItemId: feedItem.id,
    feedItem,
    match: {
      ruleName: 'movie-policy',
      identityKey:
        input.rawTitle.includes('Retry')
          ? 'movie:retry me|2024'
          : 'movie:example movie|2024',
      score: 10,
      reasons: ['year matched'],
      item: {
        mediaType: 'movie',
        rawTitle: feedItem.rawTitle,
        normalizedTitle: input.rawTitle.includes('Retry')
          ? 'retry me'
          : 'example movie',
        year: 2024,
        resolution: '1080p',
        codec: 'x265',
      },
    },
    status: input.status,
    updatedAt: input.updatedAt,
  });
}

function startFeedServer(): { url: string } {
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: {
      '/tv.rss': new Response(tvFeedFixture, {
        headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
      }),
      '/movie.rss': new Response(movieFeedFixture, {
        headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
      }),
    },
  });

  servers.push(server);
  return { url: server.url.origin };
}

function startTransmissionServer(): { url: string; requestCount: number } {
  const state = { requestCount: 0 };
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: {
      '/transmission/rpc': async (request: Request) => {
        state.requestCount += 1;

        const sessionId = request.headers.get('x-transmission-session-id');

        if (!sessionId) {
          return new Response(null, {
            status: 409,
            headers: {
              'x-transmission-session-id': 'session-123',
            },
          });
        }

        const body = (await request.json()) as {
          arguments?: { filename?: string };
        };
        const filename = body.arguments?.filename ?? '';

        if (filename.includes('retry-me')) {
          return Response.json({
            result: 'torrent rejected by policy',
            arguments: {},
          });
        }

        return Response.json({
          result: 'success',
          arguments: {
            'torrent-added': {
              id: 42,
              hashString: 'hash-42',
              name: 'Queued Torrent',
            },
          },
        });
      },
    },
  });

  servers.push(server);
  return {
    url: server.url.origin,
    get requestCount() {
      return state.requestCount;
    },
  };
}

function startFlakyRetryTransmissionServer(): {
  url: string;
  requestedUrls: string[];
} {
  const state = {
    requestedUrls: [] as string[],
    attemptsByUrl: new Map<string, number>(),
  };
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: {
      '/transmission/rpc': async (request: Request) => {
        const sessionId = request.headers.get('x-transmission-session-id');

        if (!sessionId) {
          return new Response(null, {
            status: 409,
            headers: {
              'x-transmission-session-id': 'session-123',
            },
          });
        }

        const body = (await request.json()) as {
          arguments?: { filename?: string };
        };
        const filename = body.arguments?.filename ?? '';
        state.requestedUrls.push(filename);
        const nextAttempt = (state.attemptsByUrl.get(filename) ?? 0) + 1;

        state.attemptsByUrl.set(filename, nextAttempt);

        if (filename.includes('retry-me') && nextAttempt === 1) {
          return Response.json({
            result: 'success',
            arguments: {
              'torrent-added': {
                id: 52,
                hashString: 'hash-52',
                name: 'Retried Torrent',
              },
            },
          });
        }

        return Response.json({
          result: 'success',
          arguments: {
            'torrent-added': {
              id: 42,
              hashString: 'hash-42',
              name: 'Queued Torrent',
            },
          },
        });
      },
    },
  });

  servers.push(server);
  return {
    url: server.url.origin,
    get requestedUrls() {
      return [...state.requestedUrls];
    },
  };
}

const tvFeedFixture = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>TV Feed</title>
    <item>
      <title>Other Show S01E01 1080p WEB x265</title>
      <link>https://download.example.test/tv/other-show</link>
      <guid isPermaLink="false">tv-other-show</guid>
      <pubDate>Sun, 30 Mar 2026 08:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const movieFeedFixture = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Movie Feed</title>
    <item>
      <title>Example Movie 2024 1080p WEB x265 GROUP</title>
      <link>https://download.example.test/movie/example-movie-1080.torrent</link>
      <guid isPermaLink="false">movie-example-1080</guid>
      <pubDate>Sun, 30 Mar 2026 08:05:00 GMT</pubDate>
    </item>
    <item>
      <title>Example Movie 2024 2160p WEB x265 GROUP</title>
      <link>https://download.example.test/movie/example-movie-2160.torrent</link>
      <guid isPermaLink="false">movie-example-2160</guid>
      <pubDate>Sun, 30 Mar 2026 08:10:00 GMT</pubDate>
    </item>
    <item>
      <title>Retry Me 2024 1080p WEB x265 GROUP</title>
      <link>https://download.example.test/movie/retry-me-1080.torrent</link>
      <guid isPermaLink="false">movie-retry-1080</guid>
      <pubDate>Sun, 30 Mar 2026 08:15:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;
