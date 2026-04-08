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
      transmissionTorrentId: 7,
      transmissionTorrentName: 'Example Movie 2024',
      transmissionTorrentHash: 'abcdef123456',
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
      transmissionTorrentId: 7,
      transmissionTorrentName: 'Example Movie 2024',
      transmissionTorrentHash: 'abcdef123456',
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

  it('adds and preserves Transmission identity columns for queued candidates', async () => {
    const path = await createDatabasePath();
    const database = openDatabase(path);

    openDatabases.push(database);
    database.run(`
      CREATE TABLE runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        completed_at TEXT
      );

      CREATE TABLE feed_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL REFERENCES runs(id),
        feed_name TEXT NOT NULL,
        guid_or_link TEXT NOT NULL,
        raw_title TEXT NOT NULL,
        published_at TEXT NOT NULL,
        download_url TEXT NOT NULL
      );

      CREATE TABLE candidate_state (
        identity_key TEXT PRIMARY KEY,
        media_type TEXT NOT NULL,
        status TEXT NOT NULL,
        queued_at TEXT,
        rule_name TEXT NOT NULL,
        score INTEGER NOT NULL,
        reasons_json TEXT NOT NULL,
        raw_title TEXT NOT NULL,
        normalized_title TEXT NOT NULL,
        season INTEGER,
        episode INTEGER,
        year INTEGER,
        resolution TEXT,
        codec TEXT,
        feed_name TEXT NOT NULL,
        guid_or_link TEXT NOT NULL,
        published_at TEXT NOT NULL,
        download_url TEXT NOT NULL,
        first_seen_run_id INTEGER NOT NULL REFERENCES runs(id),
        last_seen_run_id INTEGER NOT NULL REFERENCES runs(id),
        last_feed_item_id INTEGER REFERENCES feed_items(id),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE feed_item_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL REFERENCES runs(id),
        feed_item_id INTEGER REFERENCES feed_items(id),
        status TEXT NOT NULL,
        identity_key TEXT,
        rule_name TEXT,
        message TEXT,
        created_at TEXT NOT NULL
      );
    `);

    ensureSchema(database);
    const repository = createRepository(database);
    const run = repository.startRun('2026-03-30T00:00:00.000Z');
    const feedItem = repository.recordFeedItem(run.id, {
      feedName: 'Movie Feed',
      guidOrLink: 'https://example.test/releases/example-movie-web',
      rawTitle: 'Example.Movie.2024.1080p.WEB.x265-GROUP',
      publishedAt: '2026-03-30T00:05:00.000Z',
      downloadUrl: 'https://example.test/downloads/example-movie-web.torrent',
    });
    const match = requireMovieMatch(feedItem.rawTitle);

    repository.recordCandidateOutcome({
      runId: run.id,
      feedItemId: feedItem.id,
      feedItem,
      match,
      status: 'queued',
      transmissionTorrentId: 7,
      transmissionTorrentName: 'Example Movie 2024',
      transmissionTorrentHash: 'abcdef123456',
      updatedAt: '2026-03-30T00:10:00.000Z',
    });

    const updatedFeedItem = repository.recordFeedItem(run.id, {
      feedName: 'Movie Feed',
      guidOrLink: 'https://example.test/releases/example-movie-rerun',
      rawTitle: 'Example Movie 2024 2160p BluRay x265 OTHER',
      publishedAt: '2026-03-30T00:06:00.000Z',
      downloadUrl: 'https://example.test/downloads/example-movie-rerun.torrent',
    });

    const state = repository.recordCandidateOutcome({
      runId: run.id,
      feedItemId: updatedFeedItem.id,
      feedItem: updatedFeedItem,
      match: requireMovieMatch(updatedFeedItem.rawTitle),
      status: 'skipped_duplicate',
      updatedAt: '2026-03-30T00:11:00.000Z',
    });

    expect(state).toMatchObject({
      transmissionTorrentId: 7,
      transmissionTorrentName: 'Example Movie 2024',
      transmissionTorrentHash: 'abcdef123456',
    });
  });

  it('persists reconciled lifecycle state and raw Transmission fields', async () => {
    const repository = createTestRepository(await createDatabasePath());
    const run = repository.startRun('2026-03-30T00:00:00.000Z');
    const feedItem = repository.recordFeedItem(run.id, {
      feedName: 'Movie Feed',
      guidOrLink: 'https://example.test/releases/example-movie-web',
      rawTitle: 'Example.Movie.2024.1080p.WEB.x265-GROUP',
      publishedAt: '2026-03-30T00:05:00.000Z',
      downloadUrl: 'https://example.test/downloads/example-movie-web.torrent',
    });

    repository.recordCandidateOutcome({
      runId: run.id,
      feedItemId: feedItem.id,
      feedItem,
      match: requireMovieMatch(feedItem.rawTitle),
      status: 'queued',
      transmissionTorrentId: 42,
      transmissionTorrentName: 'Queued Torrent',
      transmissionTorrentHash: 'hash-42',
      updatedAt: '2026-03-30T00:10:00.000Z',
    });

    const state = repository.recordCandidateReconciliation({
      identityKey: 'movie:example movie|2024',
      lifecycleStatus: 'downloading',
      transmissionTorrentName: 'Queued Torrent',
      transmissionStatusCode: 4,
      transmissionPercentDone: 0.5,
      transmissionDoneDate: undefined,
      transmissionDownloadDir: '/downloads/movies',
      reconciledAt: '2026-03-30T00:20:00.000Z',
    });

    expect(state).toMatchObject({
      lifecycleStatus: 'downloading',
      reconciledAt: '2026-03-30T00:20:00.000Z',
      transmissionStatusCode: 4,
      transmissionPercentDone: 0.5,
      transmissionDownloadDir: '/downloads/movies',
      transmissionTorrentHash: 'hash-42',
    });
  });

  it('lists only queued candidates with Transmission identity as reconcilable', async () => {
    const repository = createTestRepository(await createDatabasePath());
    const firstRun = repository.startRun('2026-03-30T00:00:00.000Z');
    const firstFeedItem = repository.recordFeedItem(firstRun.id, {
      feedName: 'Movie Feed',
      guidOrLink: 'https://example.test/releases/example-movie-web',
      rawTitle: 'Example.Movie.2024.1080p.WEB.x265-GROUP',
      publishedAt: '2026-03-30T00:05:00.000Z',
      downloadUrl: 'https://example.test/downloads/example-movie-web.torrent',
    });
    repository.recordCandidateOutcome({
      runId: firstRun.id,
      feedItemId: firstFeedItem.id,
      feedItem: firstFeedItem,
      match: requireMovieMatch(firstFeedItem.rawTitle),
      status: 'queued',
      transmissionTorrentId: 42,
      transmissionTorrentHash: 'hash-42',
      updatedAt: '2026-03-30T00:10:00.000Z',
    });

    const secondRun = repository.startRun('2026-03-30T01:00:00.000Z');
    const secondFeedItem = repository.recordFeedItem(secondRun.id, {
      feedName: 'Movie Feed',
      guidOrLink: 'https://example.test/releases/retry-me-web',
      rawTitle: 'Retry.Me.2024.1080p.WEB.x265-GROUP',
      publishedAt: '2026-03-30T01:05:00.000Z',
      downloadUrl: 'https://example.test/downloads/retry-me-web.torrent',
    });
    repository.recordCandidateOutcome({
      runId: secondRun.id,
      feedItemId: secondFeedItem.id,
      feedItem: secondFeedItem,
      match: requireMovieMatch(secondFeedItem.rawTitle),
      status: 'failed',
      updatedAt: '2026-03-30T01:10:00.000Z',
    });

    expect(repository.listReconcilableCandidates()).toMatchObject([
      {
        identityKey: 'movie:example movie|2024',
        transmissionTorrentId: 42,
        transmissionTorrentHash: 'hash-42',
      },
    ]);
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

  it('lists retryable candidates in updated order and excludes queued items', async () => {
    const repository = createTestRepository(await createDatabasePath());
    const firstRun = repository.startRun('2026-03-30T00:00:00.000Z');
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
      match: requireMovieMatch(queuedFeedItem.rawTitle),
      status: 'queued',
      updatedAt: '2026-03-30T00:10:00.000Z',
    });

    const secondRun = repository.startRun('2026-03-30T01:00:00.000Z');
    const olderFailedFeedItem = repository.recordFeedItem(secondRun.id, {
      feedName: 'Movie Feed',
      guidOrLink: 'https://example.test/releases/retry-me-web',
      rawTitle: 'Retry.Me.2024.1080p.WEB.x265-GROUP',
      publishedAt: '2026-03-30T01:05:00.000Z',
      downloadUrl: 'https://example.test/downloads/retry-me-web.torrent',
    });
    repository.recordCandidateOutcome({
      runId: secondRun.id,
      feedItemId: olderFailedFeedItem.id,
      feedItem: olderFailedFeedItem,
      match: requireMovieMatch(olderFailedFeedItem.rawTitle),
      status: 'failed',
      updatedAt: '2026-03-30T01:10:00.000Z',
    });

    const thirdRun = repository.startRun('2026-03-30T02:00:00.000Z');
    const newerFailedFeedItem = repository.recordFeedItem(thirdRun.id, {
      feedName: 'Movie Feed',
      guidOrLink: 'https://example.test/releases/another-movie-web',
      rawTitle: 'Another Movie 2024 2160p WEB x265 GROUP',
      publishedAt: '2026-03-30T02:05:00.000Z',
      downloadUrl: 'https://example.test/downloads/another-movie-web.torrent',
    });
    repository.recordCandidateOutcome({
      runId: thirdRun.id,
      feedItemId: newerFailedFeedItem.id,
      feedItem: newerFailedFeedItem,
      match: requireMovieMatch(newerFailedFeedItem.rawTitle),
      status: 'failed',
      updatedAt: '2026-03-30T02:10:00.000Z',
    });

    expect(repository.listRetryableCandidates()).toMatchObject([
      {
        identityKey: 'movie:retry me|2024',
        status: 'failed',
        updatedAt: '2026-03-30T01:10:00.000Z',
      },
      {
        identityKey: 'movie:another movie|2024',
        status: 'failed',
        updatedAt: '2026-03-30T02:10:00.000Z',
      },
    ]);
  });

  it('creates TMDB cache tables in ensureSchema', async () => {
    const path = await createDatabasePath();
    const database = openDatabase(path);

    openDatabases.push(database);
    ensureSchema(database);

    const rows = database
      .query(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'tmdb_%' ORDER BY name`,
      )
      .all() as Array<{ name: string }>;

    const names = rows.map((row) => row.name);

    expect(names).toEqual([
      'tmdb_movie_cache',
      'tmdb_tv_cache',
      'tmdb_tv_season_cache',
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
  const directory = await createTempDir(join(tmpdir(), 'pirate-claw-db-test-'));

  tempDirs.push(directory);
  return join(directory, 'pirate-claw.db');
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
      codecPolicy: 'prefer',
    },
  );

  expect(match).toBeDefined();
  return match!;
}
