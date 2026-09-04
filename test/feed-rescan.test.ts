import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import type { AppConfig } from '../src/config';
import { rescanFeedHistory } from '../src/pipeline';
import {
  createRepository,
  ensureSchema,
  type Repository,
} from '../src/repository';
import { ensureManualGrabsSchema } from '../src/manual-grabs/schema';
import { ManualGrabsStore } from '../src/manual-grabs/store';
import type { Downloader, SubmitDownloadInput } from '../src/transmission';

function freshRepository(): { database: Database; repository: Repository } {
  const database = new Database(':memory:');
  ensureSchema(database);
  return { database, repository: createRepository(database) };
}

/** Records what it was asked to download and always succeeds — the rescan's
 * job is deciding *what* to submit, not how Transmission responds. */
function recordingDownloader(): Downloader & { submitted: string[] } {
  const submitted: string[] = [];
  return {
    submitted,
    async submit(input: SubmitDownloadInput) {
      submitted.push(input.downloadUrl);
      return {
        ok: true as const,
        status: 'queued' as const,
        torrentId: submitted.length,
        torrentHash: `hash-${String(submitted.length)}`,
        torrentName: input.downloadUrl,
      };
    },
  };
}

function config(shows: string[]): AppConfig {
  return {
    feeds: [
      { name: 'TV Feed', url: 'https://example.test/tv.rss', mediaType: 'tv' },
    ],
    tv: shows.map((name) => ({
      name,
      resolutions: ['1080p'],
      codecs: ['x265'],
    })),
    transmission: {
      url: 'http://localhost:9091/transmission/rpc',
      username: 'user',
      password: 'pass',
    },
    runtime: {
      runIntervalMinutes: 15,
      reconcileIntervalSeconds: 30,
      artifactDir: '.pirate-claw/runtime',
      artifactRetentionDays: 7,
    },
  };
}

/** Stands in for a feed poll that happened before the show was tracked. */
function seedFeedItem(
  repository: Repository,
  rawTitle: string,
  guid: string,
): void {
  const run = repository.startRun();
  repository.recordFeedItem(run.id, {
    feedName: 'TV Feed',
    guidOrLink: guid,
    rawTitle,
    publishedAt: '2026-09-01T00:00:00.000Z',
    downloadUrl: `magnet:?xt=${guid}`,
  });
  repository.completeRun(run.id);
}

describe('rescanFeedHistory', () => {
  it('queues an episode that was seen before the show was tracked', async () => {
    const { database, repository } = freshRepository();
    try {
      seedFeedItem(
        repository,
        'Lanterns 2026 S01E03 1080p HEVC x265-MeGusta',
        'g1',
      );

      const downloader = recordingDownloader();
      // The whole point: the item was recorded while the watchlist was empty,
      // and normal matching never revisits it.
      const result = await rescanFeedHistory({
        config: config(['Lanterns']),
        repository,
        downloader,
      });

      expect(downloader.submitted).toEqual(['magnet:?xt=g1']);
      expect(result.counts.queued).toBe(1);
    } finally {
      database.close();
    }
  });

  it('is a no-op when nothing on the watchlist matches', async () => {
    const { database, repository } = freshRepository();
    try {
      seedFeedItem(
        repository,
        'Lanterns 2026 S01E03 1080p HEVC x265-MeGusta',
        'g1',
      );

      const downloader = recordingDownloader();
      await rescanFeedHistory({
        config: config(['Some Other Show']),
        repository,
        downloader,
      });

      expect(downloader.submitted).toEqual([]);
    } finally {
      database.close();
    }
  });

  it('does not re-download an episode already grabbed by hand', async () => {
    const { database, repository } = freshRepository();
    try {
      ensureManualGrabsSchema(database);
      seedFeedItem(
        repository,
        'Lanterns 2026 S01E03 1080p HEVC x265-MeGusta',
        'g1',
      );
      // Exactly the situation on the live box: weeks of hand-backfilling
      // before the rescan existed. A rescan that re-grabbed all of it would
      // be worse than not having one.
      new ManualGrabsStore(database).record({
        normalizedTitle: 'Lanterns 2026',
        season: 1,
        episode: 3,
        source: 'eztv',
        rawTitle: 'Lanterns 2026 S01E03 1080p HEVC x265-MeGusta',
        transmissionTorrentHash: 'existing-hash',
        transmissionTorrentId: 99,
      });

      const downloader = recordingDownloader();
      await rescanFeedHistory({
        config: config(['Lanterns']),
        repository,
        downloader,
      });

      expect(downloader.submitted).toEqual([]);
    } finally {
      database.close();
    }
  });

  it('does not queue the same episode twice across two rescans', async () => {
    const { database, repository } = freshRepository();
    try {
      seedFeedItem(
        repository,
        'Lanterns 2026 S01E03 1080p HEVC x265-MeGusta',
        'g1',
      );

      const downloader = recordingDownloader();
      const cfg = config(['Lanterns']);
      await rescanFeedHistory({ config: cfg, repository, downloader });
      await rescanFeedHistory({ config: cfg, repository, downloader });

      // Running it again is safe — which is what lets it be wired to every
      // show-add without the operator having to think about it.
      expect(downloader.submitted).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it('collapses repeat sightings of one release into a single grab', async () => {
    const { database, repository } = freshRepository();
    try {
      // recordFeedItem inserts a fresh row per poll, so a release that stays
      // in the feed for days accumulates many rows for one guid.
      for (let i = 0; i < 5; i++) {
        seedFeedItem(
          repository,
          'Lanterns 2026 S01E03 1080p HEVC x265-MeGusta',
          'g1',
        );
      }

      const downloader = recordingDownloader();
      await rescanFeedHistory({
        config: config(['Lanterns']),
        repository,
        downloader,
      });

      expect(downloader.submitted).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it('skips items from a feed no longer in config', async () => {
    const { database, repository } = freshRepository();
    try {
      seedFeedItem(
        repository,
        'Lanterns 2026 S01E03 1080p HEVC x265-MeGusta',
        'g1',
      );

      const downloader = recordingDownloader();
      const cfg = config(['Lanterns']);
      // Without a feed there's no media type to interpret the title with,
      // so the item is left alone rather than guessed at.
      cfg.feeds = [];
      await rescanFeedHistory({ config: cfg, repository, downloader });

      expect(downloader.submitted).toEqual([]);
    } finally {
      database.close();
    }
  });
});

describe('rescanFeedHistory scoping', () => {
  it('ignores watchlist shows it was not asked about', async () => {
    const { database, repository } = freshRepository();
    try {
      seedFeedItem(
        repository,
        'Lanterns 2026 S01E03 1080p HEVC x265-MeGusta',
        'g1',
      );
      seedFeedItem(
        repository,
        'Lioness 2023 S03E05 1080p HEVC x265-MeGusta',
        'g2',
      );

      const downloader = recordingDownloader();
      // Adding one show must not replay the entire archive through every
      // other rule — several of which have been loosened since those items
      // were polled.
      await rescanFeedHistory({
        config: config(['Lanterns', 'Lioness']),
        repository,
        downloader,
        onlyShowNames: ['Lanterns'],
      });

      expect(downloader.submitted).toEqual(['magnet:?xt=g1']);
    } finally {
      database.close();
    }
  });
});
