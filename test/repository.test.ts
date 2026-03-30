import type { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp as createTempDir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { matchMovieItem } from '../src/movie-match';
import { normalizeFeedItem } from '../src/normalize';
import {
  createRepository,
  ensureSchema,
  openDatabase,
} from '../src/repository';

const tempDirs: string[] = [];
const openDatabases: Database[] = [];

describe('SQLite repository', () => {
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

  it('marks later runs as duplicates after a candidate has already been queued', async () => {
    const repository = createTestRepository(await createDatabasePath());
    const firstRun = repository.startRun('2026-03-30T00:00:00.000Z');
    const firstFeedItem = repository.recordFeedItem(firstRun.id, {
      feedName: 'Movie Feed',
      guidOrLink: 'https://example.test/releases/example-movie-web',
      rawTitle: 'Example.Movie.2024.1080p.WEB.x265-GROUP',
      publishedAt: '2026-03-30T00:05:00.000Z',
      downloadUrl: 'https://example.test/downloads/example-movie-web.torrent',
    });
    const firstMatch = requireMovieMatch(firstFeedItem.rawTitle);

    repository.recordCandidateOutcome({
      runId: firstRun.id,
      feedItemId: firstFeedItem.id,
      feedItem: firstFeedItem,
      match: firstMatch,
      status: 'queued',
      updatedAt: '2026-03-30T00:10:00.000Z',
    });

    expect(repository.isCandidateQueued(firstMatch.identityKey)).toBe(true);

    const secondRun = repository.startRun('2026-03-30T01:00:00.000Z');
    const secondFeedItem = repository.recordFeedItem(secondRun.id, {
      feedName: 'Movie Feed',
      guidOrLink: 'https://example.test/releases/example-movie-bluray',
      rawTitle: 'Example Movie 2024 2160p BluRay x265 OTHER',
      publishedAt: '2026-03-30T01:05:00.000Z',
      downloadUrl:
        'https://example.test/downloads/example-movie-bluray.torrent',
    });
    const secondMatch = requireMovieMatch(secondFeedItem.rawTitle);

    expect(secondMatch.identityKey).toBe(firstMatch.identityKey);
    expect(repository.isCandidateQueued(secondMatch.identityKey)).toBe(true);

    const state = repository.recordCandidateOutcome({
      runId: secondRun.id,
      feedItemId: secondFeedItem.id,
      feedItem: secondFeedItem,
      match: secondMatch,
      status: 'skipped_duplicate',
      updatedAt: '2026-03-30T01:10:00.000Z',
    });

    expect(state).toMatchObject({
      identityKey: 'movie:example movie|2024',
      status: 'skipped_duplicate',
      queuedAt: '2026-03-30T00:10:00.000Z',
      feedName: 'Movie Feed',
      guidOrLink: 'https://example.test/releases/example-movie-bluray',
      firstSeenRunId: firstRun.id,
      lastSeenRunId: secondRun.id,
      lastFeedItemId: secondFeedItem.id,
    });
  });

  it('keeps failed candidates retryable until one is successfully queued', async () => {
    const repository = createTestRepository(await createDatabasePath());
    const firstRun = repository.startRun('2026-03-30T02:00:00.000Z');
    const firstFeedItem = repository.recordFeedItem(firstRun.id, {
      feedName: 'Movie Feed',
      guidOrLink: 'https://example.test/releases/retry-me-web',
      rawTitle: 'Retry.Me.2024.1080p.WEB.x265-GROUP',
      publishedAt: '2026-03-30T02:05:00.000Z',
      downloadUrl: 'https://example.test/downloads/retry-me-web.torrent',
    });
    const match = requireMovieMatch(firstFeedItem.rawTitle);

    const failedState = repository.recordCandidateOutcome({
      runId: firstRun.id,
      feedItemId: firstFeedItem.id,
      feedItem: firstFeedItem,
      match,
      status: 'failed',
      updatedAt: '2026-03-30T02:10:00.000Z',
    });

    expect(failedState.status).toBe('failed');
    expect(failedState.queuedAt).toBeUndefined();
    expect(repository.isCandidateQueued(match.identityKey)).toBe(false);

    const secondRun = repository.startRun('2026-03-30T03:00:00.000Z');
    const secondFeedItem = repository.recordFeedItem(secondRun.id, {
      feedName: 'Movie Feed',
      guidOrLink: 'https://example.test/releases/retry-me-bluray',
      rawTitle: 'Retry Me 2024 2160p BluRay x265 OTHER',
      publishedAt: '2026-03-30T03:05:00.000Z',
      downloadUrl: 'https://example.test/downloads/retry-me-bluray.torrent',
    });
    const retryMatch = requireMovieMatch(secondFeedItem.rawTitle);

    expect(retryMatch.identityKey).toBe(match.identityKey);
    expect(repository.isCandidateQueued(retryMatch.identityKey)).toBe(false);

    const queuedState = repository.recordCandidateOutcome({
      runId: secondRun.id,
      feedItemId: secondFeedItem.id,
      feedItem: secondFeedItem,
      match: retryMatch,
      status: 'queued',
      updatedAt: '2026-03-30T03:10:00.000Z',
    });

    expect(queuedState).toMatchObject({
      identityKey: 'movie:retry me|2024',
      status: 'queued',
      queuedAt: '2026-03-30T03:10:00.000Z',
      firstSeenRunId: firstRun.id,
      lastSeenRunId: secondRun.id,
      lastFeedItemId: secondFeedItem.id,
    });
    expect(repository.isCandidateQueued(retryMatch.identityKey)).toBe(true);
  });

  it('distinguishes failed runs from completed runs', async () => {
    const repository = createTestRepository(await createDatabasePath());
    const startedRun = repository.startRun('2026-03-30T04:00:00.000Z');

    expect(startedRun).toMatchObject({
      status: 'running',
      completedAt: undefined,
    });

    const failedRun = repository.failRun(
      startedRun.id,
      '2026-03-30T04:05:00.000Z',
    );

    expect(failedRun).toMatchObject({
      id: startedRun.id,
      status: 'failed',
      completedAt: '2026-03-30T04:05:00.000Z',
    });
  });

  it('lists recent run summaries with aggregated outcome counts', async () => {
    const repository = createTestRepository(await createDatabasePath());
    const firstRun = repository.startRun('2026-03-30T00:00:00.000Z');
    repository.recordFeedItemOutcome({
      runId: firstRun.id,
      status: 'queued',
      createdAt: '2026-03-30T00:10:00.000Z',
    });
    repository.recordFeedItemOutcome({
      runId: firstRun.id,
      status: 'failed',
      createdAt: '2026-03-30T00:11:00.000Z',
    });
    repository.completeRun(firstRun.id, '2026-03-30T00:12:00.000Z');

    const secondRun = repository.startRun('2026-03-30T01:00:00.000Z');
    repository.recordFeedItemOutcome({
      runId: secondRun.id,
      status: 'skipped_duplicate',
      createdAt: '2026-03-30T01:10:00.000Z',
    });
    repository.recordFeedItemOutcome({
      runId: secondRun.id,
      status: 'skipped_no_match',
      createdAt: '2026-03-30T01:11:00.000Z',
    });
    repository.completeRun(secondRun.id, '2026-03-30T01:12:00.000Z');

    expect(repository.listRecentRunSummaries()).toEqual([
      {
        id: secondRun.id,
        startedAt: '2026-03-30T01:00:00.000Z',
        status: 'completed',
        completedAt: '2026-03-30T01:12:00.000Z',
        counts: {
          queued: 0,
          failed: 0,
          skipped_duplicate: 1,
          skipped_no_match: 1,
        },
      },
      {
        id: firstRun.id,
        startedAt: '2026-03-30T00:00:00.000Z',
        status: 'completed',
        completedAt: '2026-03-30T00:12:00.000Z',
        counts: {
          queued: 1,
          failed: 1,
          skipped_duplicate: 0,
          skipped_no_match: 0,
        },
      },
    ]);
  });

  it('lists candidate states newest first', async () => {
    const repository = createTestRepository(await createDatabasePath());
    const firstRun = repository.startRun('2026-03-30T02:00:00.000Z');
    const firstFeedItem = repository.recordFeedItem(firstRun.id, {
      feedName: 'Movie Feed',
      guidOrLink: 'https://example.test/releases/example-movie-web',
      rawTitle: 'Example.Movie.2024.1080p.WEB.x265-GROUP',
      publishedAt: '2026-03-30T02:05:00.000Z',
      downloadUrl: 'https://example.test/downloads/example-movie-web.torrent',
    });
    const firstMatch = requireMovieMatch(firstFeedItem.rawTitle);
    repository.recordCandidateOutcome({
      runId: firstRun.id,
      feedItemId: firstFeedItem.id,
      feedItem: firstFeedItem,
      match: firstMatch,
      status: 'queued',
      updatedAt: '2026-03-30T02:10:00.000Z',
    });

    const secondRun = repository.startRun('2026-03-30T03:00:00.000Z');
    const secondFeedItem = repository.recordFeedItem(secondRun.id, {
      feedName: 'Movie Feed',
      guidOrLink: 'https://example.test/releases/retry-me-web',
      rawTitle: 'Retry.Me.2024.1080p.WEB.x265-GROUP',
      publishedAt: '2026-03-30T03:05:00.000Z',
      downloadUrl: 'https://example.test/downloads/retry-me-web.torrent',
    });
    const secondMatch = requireMovieMatch(secondFeedItem.rawTitle);
    repository.recordCandidateOutcome({
      runId: secondRun.id,
      feedItemId: secondFeedItem.id,
      feedItem: secondFeedItem,
      match: secondMatch,
      status: 'failed',
      updatedAt: '2026-03-30T03:10:00.000Z',
    });

    expect(repository.listCandidateStates()).toMatchObject([
      {
        identityKey: 'movie:retry me|2024',
        status: 'failed',
        updatedAt: '2026-03-30T03:10:00.000Z',
      },
      {
        identityKey: 'movie:example movie|2024',
        status: 'queued',
        updatedAt: '2026-03-30T02:10:00.000Z',
      },
    ]);
  });
});

function createTestRepository(path: string) {
  const database = openDatabase(path);

  openDatabases.push(database);
  ensureSchema(database);
  return createRepository(database);
}

async function createDatabasePath(): Promise<string> {
  const directory = await createTempDir(join(tmpdir(), 'media-sync-db-test-'));

  tempDirs.push(directory);
  return join(directory, 'media-sync.db');
}

function requireMovieMatch(rawTitle: string) {
  const match = matchMovieItem(
    normalizeFeedItem({
      mediaType: 'movie',
      rawTitle,
    }),
    {
      years: [2024],
      resolutions: ['2160p', '1080p'],
      codecs: ['x265'],
    },
  );

  expect(match).toBeDefined();
  return match!;
}
