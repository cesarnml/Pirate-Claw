import { afterEach, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp as createTempDir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FeedConfig } from '../src/config';
import { DEFAULT_RUNTIME_CONFIG } from '../src/config';
import {
  filterDueFeeds,
  isDueFeed,
  loadPollState,
  recordFeedPolled,
  savePollState,
  type PollState,
} from '../src/poll-state';

const tempDirs: string[] = [];

describe('poll state', () => {
  afterEach(async () => {
    while (tempDirs.length > 0) {
      const directory = tempDirs.pop();
      if (directory) {
        await Bun.$`rm -rf ${directory}`;
      }
    }
  });

  it('returns empty state when file does not exist', () => {
    const state = loadPollState('/nonexistent/poll-state.json');
    expect(state).toEqual({ feeds: {} });
  });

  it('persists and reloads poll state across calls', async () => {
    const dir = await mkdtemp();
    const path = join(dir, 'runtime', 'poll-state.json');

    let state: PollState = { feeds: {} };
    state = recordFeedPolled(state, 'EZTV', '2026-04-05T09:00:00.000Z');
    state = recordFeedPolled(state, 'Atlas Movies', '2026-04-05T08:30:00.000Z');
    savePollState(path, state);

    expect(existsSync(path)).toBe(true);

    const loaded = loadPollState(path);
    expect(loaded.feeds['EZTV']?.lastPolledAt).toBe('2026-04-05T09:00:00.000Z');
    expect(loaded.feeds['Atlas Movies']?.lastPolledAt).toBe(
      '2026-04-05T08:30:00.000Z',
    );
  });

  it('treats a feed as due when it has never been polled', () => {
    const feed = createFeed('EZTV');
    const state: PollState = { feeds: {} };

    expect(isDueFeed(feed, state, DEFAULT_RUNTIME_CONFIG, Date.now())).toBe(
      true,
    );
  });

  it('treats a feed as not due when polled within its interval', () => {
    const now = Date.now();
    const feed = createFeed('EZTV');
    const state: PollState = {
      feeds: {
        EZTV: { lastPolledAt: new Date(now - 10 * 60 * 1000).toISOString() },
      },
    };

    expect(isDueFeed(feed, state, DEFAULT_RUNTIME_CONFIG, now)).toBe(false);
  });

  it('treats a feed as due when its interval has elapsed', () => {
    const now = Date.now();
    const feed = createFeed('EZTV');
    const state: PollState = {
      feeds: {
        EZTV: { lastPolledAt: new Date(now - 31 * 60 * 1000).toISOString() },
      },
    };

    expect(isDueFeed(feed, state, DEFAULT_RUNTIME_CONFIG, now)).toBe(true);
  });

  it('uses per-feed pollIntervalMinutes when present', () => {
    const now = Date.now();
    const feed = createFeed('EZTV', { pollIntervalMinutes: 10 });
    const state: PollState = {
      feeds: {
        EZTV: { lastPolledAt: new Date(now - 11 * 60 * 1000).toISOString() },
      },
    };

    expect(isDueFeed(feed, state, DEFAULT_RUNTIME_CONFIG, now)).toBe(true);
  });

  it('respects per-feed interval over global default', () => {
    const now = Date.now();
    const feed = createFeed('EZTV', { pollIntervalMinutes: 60 });
    const state: PollState = {
      feeds: {
        EZTV: { lastPolledAt: new Date(now - 31 * 60 * 1000).toISOString() },
      },
    };

    expect(isDueFeed(feed, state, DEFAULT_RUNTIME_CONFIG, now)).toBe(false);
  });

  it('filters due feeds from a mixed list', () => {
    const now = Date.now();
    const feeds = [
      createFeed('EZTV'),
      createFeed('Atlas Movies', { pollIntervalMinutes: 60 }),
    ];
    const state: PollState = {
      feeds: {
        EZTV: { lastPolledAt: new Date(now - 31 * 60 * 1000).toISOString() },
        'Atlas Movies': {
          lastPolledAt: new Date(now - 10 * 60 * 1000).toISOString(),
        },
      },
    };

    const due = filterDueFeeds(feeds, state, DEFAULT_RUNTIME_CONFIG, now);
    expect(due.map((f) => f.name)).toEqual(['EZTV']);
  });

  it('treats all feeds as due on first ever run', () => {
    const feeds = [createFeed('EZTV'), createFeed('Atlas Movies')];
    const state: PollState = { feeds: {} };

    const due = filterDueFeeds(
      feeds,
      state,
      DEFAULT_RUNTIME_CONFIG,
      Date.now(),
    );
    expect(due.map((f) => f.name)).toEqual(['EZTV', 'Atlas Movies']);
  });

  it('handles corrupt poll state file gracefully', async () => {
    const dir = await mkdtemp();
    const path = join(dir, 'poll-state.json');
    await Bun.write(path, 'not valid json');

    const state = loadPollState(path);
    expect(state).toEqual({ feeds: {} });
  });
});

async function mkdtemp(): Promise<string> {
  const directory = await createTempDir(
    join(tmpdir(), 'pirate-claw-poll-state-'),
  );
  tempDirs.push(directory);
  return directory;
}

function createFeed(name: string, overrides?: Partial<FeedConfig>): FeedConfig {
  return {
    name,
    url: `https://example.test/${name.toLowerCase().replace(/\s/g, '-')}.rss`,
    mediaType: 'tv',
    ...overrides,
  };
}
