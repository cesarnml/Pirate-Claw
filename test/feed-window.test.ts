import type { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp as createTempDir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AppConfig } from '../src/config';
import type { RawFeedItem } from '../src/feed';
import {
  formatFeedWindowAlarm,
  formatFeedWindowLine,
  summarizeFeedWindow,
} from '../src/feed-window';
import { runPipeline } from '../src/pipeline';
import {
  createRepository,
  ensureSchema,
  openDatabase,
} from '../src/repository';

const tempDirs: string[] = [];
const openDatabases: Database[] = [];

const NOW = new Date('2026-09-05T16:00:00.000Z');

function item(overrides: Partial<RawFeedItem> = {}): RawFeedItem {
  return {
    feedName: 'EZTV',
    guidOrLink: 'https://example.test/items/1',
    rawTitle: 'Example.Show.S01E01.1080p.WEB.x265-GROUP',
    publishedAt: '2026-09-05T15:00:00.000Z',
    downloadUrl: 'https://example.test/downloads/1.torrent',
    ...overrides,
  };
}

describe('summarizeFeedWindow', () => {
  it('splits a window into already-seen and new, and reports the overlap', () => {
    const stats = summarizeFeedWindow({
      feedName: 'EZTV',
      items: [
        item({ guidOrLink: 'a' }),
        item({ guidOrLink: 'b' }),
        item({ guidOrLink: 'c' }),
        item({ guidOrLink: 'd' }),
      ],
      knownGuids: new Set(['a', 'b', 'c']),
      previousPollAt: '2026-09-05T15:45:00.000Z',
      now: NOW,
    });

    expect(stats.windowSize).toBe(4);
    expect(stats.newCount).toBe(1);
    expect(stats.seenBeforeCount).toBe(3);
    expect(stats.overlapPercent).toBe(75);
  });

  it('counts a guid repeated within one response only once', () => {
    const stats = summarizeFeedWindow({
      feedName: 'EZTV',
      items: [item({ guidOrLink: 'a' }), item({ guidOrLink: 'a' })],
      knownGuids: new Set(),
      now: NOW,
    });

    expect(stats.windowSize).toBe(1);
    expect(stats.newCount).toBe(1);
  });

  it('measures reach-back from the oldest item and margin against the real gap', () => {
    const stats = summarizeFeedWindow({
      feedName: 'EZTV',
      items: [
        item({ guidOrLink: 'a', publishedAt: '2026-09-05T14:00:00.000Z' }),
        item({ guidOrLink: 'b', publishedAt: '2026-09-05T13:00:00.000Z' }),
        item({ guidOrLink: 'c', publishedAt: '2026-09-05T15:30:00.000Z' }),
      ],
      knownGuids: new Set(),
      // 30 minutes ago — deliberately not the configured interval.
      previousPollAt: '2026-09-05T15:30:00.000Z',
      now: NOW,
    });

    expect(stats.reachBackMinutes).toBe(180);
    expect(stats.sinceLastPollMinutes).toBe(30);
    expect(stats.marginRatio).toBe(6);
    expect(stats.windowRotatedPastUs).toBe(false);
  });

  it('flags the one real loss condition: the window no longer reaches the previous poll', () => {
    const stats = summarizeFeedWindow({
      feedName: 'EZTV',
      items: [
        item({ guidOrLink: 'a', publishedAt: '2026-09-05T15:50:00.000Z' }),
      ],
      knownGuids: new Set(),
      // We last looked an hour ago; the oldest thing still in the feed was
      // published ten minutes ago, so 50 minutes of releases rotated out unseen.
      previousPollAt: '2026-09-05T15:00:00.000Z',
      now: NOW,
    });

    expect(stats.windowRotatedPastUs).toBe(true);
    expect(formatFeedWindowAlarm(stats)).toContain('WINDOW ROTATED PAST US');
  });

  it('does not flag a rotation on the first ever poll of a feed', () => {
    const stats = summarizeFeedWindow({
      feedName: 'EZTV',
      items: [item({ publishedAt: '2026-09-05T15:59:00.000Z' })],
      knownGuids: new Set(),
      now: NOW,
    });

    expect(stats.previousPollAt).toBeNull();
    expect(stats.sinceLastPollMinutes).toBeNull();
    expect(stats.marginRatio).toBeNull();
    expect(stats.windowRotatedPastUs).toBe(false);
  });

  it('handles an empty response without inventing an overlap or a margin', () => {
    const stats = summarizeFeedWindow({
      feedName: 'EZTV',
      items: [],
      knownGuids: new Set(),
      previousPollAt: '2026-09-05T15:30:00.000Z',
      now: NOW,
    });

    expect(stats.windowSize).toBe(0);
    expect(stats.overlapPercent).toBeNull();
    expect(stats.reachBackMinutes).toBeNull();
    expect(stats.marginRatio).toBeNull();
    expect(stats.windowRotatedPastUs).toBe(false);
    expect(formatFeedWindowLine(stats)).toContain('overlap=n/a');
  });

  it('clamps a future publish date to zero rather than reporting a negative age', () => {
    const stats = summarizeFeedWindow({
      feedName: 'EZTV',
      items: [item({ publishedAt: '2026-09-05T16:30:00.000Z' })],
      knownGuids: new Set(),
      now: NOW,
    });

    expect(stats.reachBackMinutes).toBe(0);
  });

  it('suppresses the margin when two polls land inside the same minute', () => {
    const stats = summarizeFeedWindow({
      feedName: 'EZTV',
      items: [item({ publishedAt: '2026-09-05T14:00:00.000Z' })],
      knownGuids: new Set(),
      previousPollAt: '2026-09-05T15:59:50.000Z',
      now: NOW,
    });

    expect(stats.sinceLastPollMinutes).toBe(0);
    expect(stats.marginRatio).toBeNull();
  });

  it('formats one grep-able line', () => {
    const stats = summarizeFeedWindow({
      feedName: 'EZTV',
      items: [
        item({ guidOrLink: 'a', publishedAt: '2026-09-05T14:00:00.000Z' }),
        item({ guidOrLink: 'b', publishedAt: '2026-09-05T15:00:00.000Z' }),
      ],
      knownGuids: new Set(['a']),
      previousPollAt: '2026-09-05T15:30:00.000Z',
      now: NOW,
    });

    expect(formatFeedWindowLine(stats)).toBe(
      '[feed] EZTV window=2 new=1 overlap=50% reach_back=120min since_last_poll=30min margin=4x',
    );
  });
});

describe('feed-window repository reads', () => {
  afterEach(async () => {
    while (openDatabases.length > 0) openDatabases.pop()?.close();
    while (tempDirs.length > 0) {
      const directory = tempDirs.pop();
      if (directory) await Bun.$`rm -rf ${directory}`;
    }
  });

  it("reports guids seen in earlier runs, ignoring this run's own inserts", async () => {
    const repository = await createTestRepository();

    const first = repository.startRun('2026-09-05T15:00:00.000Z');
    repository.recordFeedItem(first.id, item({ guidOrLink: 'a' }));
    repository.recordFeedItem(first.id, item({ guidOrLink: 'b' }));

    const second = repository.startRun('2026-09-05T15:30:00.000Z');
    repository.recordFeedItem(second.id, item({ guidOrLink: 'b' }));
    repository.recordFeedItem(second.id, item({ guidOrLink: 'c' }));

    // 'b' was seen in run 1; 'c' only in this run, so it is still new.
    const known = repository.listKnownFeedItemGuids(
      'EZTV',
      ['a', 'b', 'c'],
      second.id,
    );
    expect(known.sort()).toEqual(['a', 'b']);
  });

  it('scopes known guids to the feed that recorded them', async () => {
    const repository = await createTestRepository();
    const first = repository.startRun('2026-09-05T15:00:00.000Z');
    repository.recordFeedItem(
      first.id,
      item({ feedName: 'YIFY', guidOrLink: 'shared' }),
    );

    const second = repository.startRun('2026-09-05T15:30:00.000Z');
    expect(
      repository.listKnownFeedItemGuids('EZTV', ['shared'], second.id),
    ).toEqual([]);
    expect(
      repository.listKnownFeedItemGuids('YIFY', ['shared'], second.id),
    ).toEqual(['shared']);
  });

  it('returns the previous poll time for a feed, and undefined on its first', async () => {
    const repository = await createTestRepository();

    const first = repository.startRun('2026-09-05T15:00:00.000Z');
    expect(repository.getPreviousFeedPollAt('EZTV', first.id)).toBeUndefined();
    repository.recordFeedItem(first.id, item());

    const second = repository.startRun('2026-09-05T15:30:00.000Z');
    expect(repository.getPreviousFeedPollAt('EZTV', second.id)).toBe(
      '2026-09-05T15:00:00.000Z',
    );
  });

  it('handles an empty guid list without querying', async () => {
    const repository = await createTestRepository();
    const run = repository.startRun('2026-09-05T15:00:00.000Z');
    expect(repository.listKnownFeedItemGuids('EZTV', [], run.id)).toEqual([]);
  });
});

describe('runPipeline feed-window logging', () => {
  afterEach(async () => {
    while (openDatabases.length > 0) openDatabases.pop()?.close();
    while (tempDirs.length > 0) {
      const directory = tempDirs.pop();
      if (directory) await Bun.$`rm -rf ${directory}`;
    }
  });

  it('logs one coverage line per feed per poll, and no alarm when the window still covers the gap', async () => {
    const repository = await createTestRepository();
    const lines: { message: string; level?: string }[] = [];

    const feedItems = [
      item({ guidOrLink: 'a', publishedAt: '2026-09-05T10:00:00.000Z' }),
      item({ guidOrLink: 'b', publishedAt: '2026-09-05T11:00:00.000Z' }),
    ];

    // First poll seeds history; second is the one under test.
    for (let poll = 0; poll < 2; poll++) {
      await runPipeline({
        config: createConfig(),
        repository,
        downloader: {
          submit: async () => ({
            ok: true as const,
            status: 'queued' as const,
          }),
        },
        fetchFeed: async () => feedItems,
        log: (message, level) => lines.push({ message, level }),
      });
    }

    const windowLines = lines.filter((line) =>
      line.message.startsWith('[feed] EZTV window='),
    );
    expect(windowLines).toHaveLength(2);
    // Second poll saw the same two items it had already recorded.
    expect(windowLines[1]?.message).toContain('window=2 new=0 overlap=100%');
    expect(lines.some((line) => line.level === 'warn')).toBe(false);
  });

  it('raises a warn-level alarm when the window rotated past the previous poll', async () => {
    const repository = await createTestRepository();
    const lines: { message: string; level?: string }[] = [];

    const downloader = {
      submit: async () => ({ ok: true as const, status: 'queued' as const }),
    };
    const config = createConfig();

    // First poll records an old item, establishing a previous-poll timestamp.
    await runPipeline({
      config,
      repository,
      downloader,
      fetchFeed: async () => [
        item({ guidOrLink: 'old', publishedAt: '2026-01-01T00:00:00.000Z' }),
      ],
      log: () => {},
    });

    // Second poll returns only items published far in the future relative to
    // that first poll — the window moved on entirely while we weren't looking.
    await runPipeline({
      config,
      repository,
      downloader,
      fetchFeed: async () => [
        item({ guidOrLink: 'new', publishedAt: '2099-01-01T00:00:00.000Z' }),
      ],
      log: (message, level) => lines.push({ message, level }),
    });

    const alarm = lines.find((line) => line.level === 'warn');
    expect(alarm?.message).toContain('WINDOW ROTATED PAST US');
    expect(alarm?.message).toContain('EZTV');
  });
});

async function createTestRepository() {
  const directory = await createTempDir(join(tmpdir(), 'pirate-claw-window-'));
  tempDirs.push(directory);
  const database = openDatabase(join(directory, 'pirate-claw.db'));
  openDatabases.push(database);
  ensureSchema(database);
  return createRepository(database);
}

function createConfig(): AppConfig {
  return {
    feeds: [
      { name: 'EZTV', url: 'https://example.test/tv.rss', mediaType: 'tv' },
    ],
    tv: [{ name: 'Example Show', resolutions: ['1080p'], codecs: ['x265'] }],
    transmission: {
      url: 'http://localhost:9091/transmission/rpc',
      downloadDir: '/downloads',
    },
    runtime: {
      runIntervalMinutes: 15,
      reconcileIntervalSeconds: 240,
      artifactDir: '.pirate-claw/runtime',
      artifactRetentionDays: 7,
    },
  } as AppConfig;
}
