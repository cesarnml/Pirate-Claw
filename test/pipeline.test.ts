import type { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp as createTempDir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AppConfig } from '../src/config';
import { FeedError } from '../src/feed';
import { retryFailedCandidates, runPipeline } from '../src/pipeline';
import {
  createRepository,
  ensureSchema,
  openDatabase,
  type Repository,
} from '../src/repository';

const tempDirs: string[] = [];
const openDatabases: Database[] = [];

describe('runPipeline', () => {
  afterEach(async () => {
    while (openDatabases.length > 0) {
      openDatabases.pop()?.close();
    }

    while (tempDirs.length > 0) {
      const directory = tempDirs.pop();

      if (directory) {
        await Bun.$`rm -rf ${directory}`;
      }
    }
  });

  it('marks a run as failed when feed fetching throws', async () => {
    const repository = createTestRepository(await createDatabasePath());

    await expect(
      runPipeline({
        config: createConfig(),
        repository,
        downloader: {
          submit: async () => ({
            ok: true as const,
            status: 'queued' as const,
          }),
        },
        fetchFeed: async () => {
          throw new FeedError('boom');
        },
      }),
    ).rejects.toThrow(new FeedError('boom'));

    expect(repository.getRun(1)).toMatchObject({
      id: 1,
      status: 'failed',
      completedAt: expect.any(String),
    });
  });

  it('queues only the highest-ranked candidate for an identity and records the rest as duplicates', async () => {
    const repository = createTestRepository(await createDatabasePath());

    const result = await runPipeline({
      config: createConfig({
        tv: [
          {
            name: 'Example Show',
            resolutions: ['2160p', '1080p'],
            codecs: ['x265'],
          },
        ],
      }),
      repository,
      downloader: {
        submit: async () => ({
          ok: true as const,
          status: 'queued' as const,
        }),
      },
      fetchFeed: async () => [
        {
          feedName: 'TV Feed',
          guidOrLink: 'https://example.test/releases/example-show-1080p',
          rawTitle: 'Example.Show.S01E02.1080p.WEB.x265-GROUP',
          publishedAt: '2026-03-30T00:00:00.000Z',
          downloadUrl:
            'https://example.test/downloads/example-show-1080p.torrent',
        },
        {
          feedName: 'TV Feed',
          guidOrLink: 'https://example.test/releases/example-show-2160p',
          rawTitle: 'Example.Show.S01E02.2160p.WEB.x265-GROUP',
          publishedAt: '2026-03-30T00:01:00.000Z',
          downloadUrl:
            'https://example.test/downloads/example-show-2160p.torrent',
        },
      ],
    });

    expect(result.counts).toEqual({
      queued: 1,
      failed: 0,
      skipped_duplicate: 1,
      skipped_no_match: 0,
    });
    expect(repository.listFeedItemOutcomes(result.runId)).toMatchObject([
      {
        status: 'skipped_duplicate',
        identityKey: 'tv:example show|s01e02',
        message: 'Higher-ranked candidate selected for this identity.',
      },
      {
        status: 'queued',
        identityKey: 'tv:example show|s01e02',
        message: 'Queued in Transmission.',
      },
    ]);
    expect(
      repository.getCandidateState('tv:example show|s01e02'),
    ).toMatchObject({
      status: 'queued',
      rawTitle: 'Example.Show.S01E02.2160p.WEB.x265-GROUP',
      resolution: '2160p',
    });
  });
});

describe('retryFailedCandidates', () => {
  afterEach(async () => {
    while (openDatabases.length > 0) {
      openDatabases.pop()?.close();
    }

    while (tempDirs.length > 0) {
      const directory = tempDirs.pop();

      if (directory) {
        await Bun.$`rm -rf ${directory}`;
      }
    }
  });

  it('marks the retry run as failed when submission throws', async () => {
    const repository = createTestRepository(await createDatabasePath());
    seedFailedMovieCandidate(repository);

    await expect(
      retryFailedCandidates({
        repository,
        downloader: {
          submit: async () => {
            throw new Error('transient downloader failure');
          },
        },
      }),
    ).rejects.toThrow('transient downloader failure');

    expect(repository.getRun(2)).toMatchObject({
      id: 2,
      status: 'failed',
      completedAt: expect.any(String),
    });
  });
});

function createTestRepository(path: string) {
  const database = openDatabase(path);

  openDatabases.push(database);
  ensureSchema(database);
  return createRepository(database);
}

function seedFailedMovieCandidate(repository: Repository): void {
  const run = repository.startRun('2026-03-30T00:00:00.000Z');
  const feedItem = repository.recordFeedItem(run.id, {
    feedName: 'Movie Feed',
    guidOrLink: 'https://example.test/releases/retry-me',
    rawTitle: 'Retry.Me.2024.1080p.WEB.x265-GROUP',
    publishedAt: '2026-03-30T00:05:00.000Z',
    downloadUrl: 'https://example.test/downloads/retry-me.torrent',
  });

  repository.recordCandidateOutcome({
    runId: run.id,
    feedItemId: feedItem.id,
    feedItem,
    match: {
      ruleName: 'movie-policy',
      identityKey: 'movie:retry me|2024',
      score: 10,
      reasons: ['year matched'],
      item: {
        mediaType: 'movie',
        rawTitle: feedItem.rawTitle,
        normalizedTitle: 'retry me',
        year: 2024,
        resolution: '1080p',
        codec: 'x265',
      },
    },
    status: 'failed',
    updatedAt: '2026-03-30T00:10:00.000Z',
  });
  repository.completeRun(run.id, '2026-03-30T00:12:00.000Z');
}

async function createDatabasePath(): Promise<string> {
  const directory = await createTempDir(join(tmpdir(), 'media-sync-pipeline-'));

  tempDirs.push(directory);
  return join(directory, 'media-sync.db');
}

function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    feeds: [
      {
        name: 'TV Feed',
        url: 'https://example.test/tv.rss',
        mediaType: 'tv',
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
      resolutions: ['1080p'],
      codecs: ['x265'],
    },
    transmission: {
      url: 'http://localhost:9091/transmission/rpc',
      username: 'user',
      password: 'pass',
    },
    ...overrides,
  };
}
