import {
  type AppConfig,
  type FeedConfig,
  DEFAULT_TRANSMISSION_DOWNLOAD_DIR_MOVIE,
  DEFAULT_TRANSMISSION_DOWNLOAD_DIR_TV,
  type TransmissionConfig,
} from './config';
import { fetchFeed, type RawFeedItem } from './feed';
import { getMovieNoMatchReason, matchMovieItem } from './movie-match';
import { normalizeFeedItem, type NormalizedFeedItem } from './normalize';
import {
  createPipelineCoordinator,
  type MatchedFeedItem,
  type RunPipelineResult,
} from './pipeline-runner';
import type {
  CandidateMatchRecord,
  CandidateStateRecord,
  Repository,
} from './repository';
import type { Downloader, TorrentSnapshot } from './transmission';
import { matchTvItem } from './tv-match';

export type { RunPipelineResult } from './pipeline-runner';
export { submitCandidate } from './pipeline-runner';

export type FetchFeedFn = (feed: FeedConfig) => Promise<RawFeedItem[]>;

export type ReconcileCandidatesResult = {
  trackedCount: number;
  reconciledCount: number;
  updatedCount: number;
  missingCount: number;
};

export async function runPipeline(input: {
  config: AppConfig;
  repository: Repository;
  downloader: Downloader;
  fetchFeed?: FetchFeedFn;
}): Promise<RunPipelineResult> {
  const fetchFeedImpl = input.fetchFeed ?? fetchFeed;
  const run = input.repository.startRun();
  const coordinator = createPipelineCoordinator({
    run,
    repository: input.repository,
    downloader: input.downloader,
    resolveDownloadDir: createDownloadDirResolver(input.config.transmission),
  });

  try {
    const candidates: MatchedFeedItem[] = [];

    for (const feed of input.config.feeds) {
      const items = await fetchFeedImpl(feed);

      for (const item of items) {
        const feedItem = input.repository.recordFeedItem(run.id, item);
        const normalized = normalizeFeedItem({
          mediaType: feed.mediaType,
          rawTitle: feedItem.rawTitle,
        });
        const match = matchFeedItem(normalized, input.config);

        if (!match) {
          coordinator.recordNoMatch(
            feedItem.id,
            getFeedItemNoMatchReason(normalized, input.config),
          );
          continue;
        }

        candidates.push({ feedItem, match });
      }
    }

    await coordinator.submitMatchedCandidates(candidates);
    return coordinator.finalize();
  } catch (error) {
    coordinator.fail();
    throw error;
  }
}

/**
 * Re-evaluates every feed item already on record against the *current*
 * watchlist, queueing anything that now matches.
 *
 * Feed items are otherwise matched exactly once, at the moment they are
 * polled, and never revisited. That makes every newly added show blind to
 * everything the feed already saw: adding a show today does nothing about the
 * episodes that scrolled past yesterday, even though their releases are still
 * recorded (with working download URLs) in `feed_items`. Measured on the live
 * box 2026-09-03: replaying stored history against the then-current config
 * matched 21 episodes, against 10 that had ever actually been queued. The gap
 * was almost entirely shows added after their releases came through — which
 * is why the library had to be backfilled by hand.
 *
 * Deliberately reuses `submitMatchedCandidates` rather than any bespoke path,
 * so a rescan inherits the pipeline's existing safeguards unchanged: one
 * winner per identity, already-queued candidates skipped, and — the one that
 * matters most here, since the operator has been backfilling by hand for
 * weeks — anything already grabbed manually is skipped too. A rescan over
 * fully-caught-up history is therefore a no-op, not a re-download.
 *
 * `mediaType` comes from the feed the item was recorded under, since
 * `feed_items` stores `feed_name` rather than a media type; an item whose
 * feed is no longer in config is skipped, as there is nothing to interpret
 * its titles with.
 */
export async function rescanFeedHistory(input: {
  config: AppConfig;
  repository: Repository;
  downloader: Downloader;
  limit?: number;
  /**
   * Restricts the rescan to these watchlist show names, and skips movies
   * entirely. The rescan-on-add path passes the shows that were just added,
   * which keeps the blast radius equal to the operator's actual intent:
   * without it, adding one TV show replays the whole feed archive through
   * *every* rule — including the movie policy, and including any TV pattern
   * that has been loosened since those items were polled — and fire-and-
   * forget submits everything it finds. Omitted means "the whole config",
   * which is what the explicit Rescan button asks for.
   */
  onlyShowNames?: string[];
}): Promise<RunPipelineResult> {
  const run = input.repository.startRun();
  const coordinator = createPipelineCoordinator({
    run,
    repository: input.repository,
    downloader: input.downloader,
    resolveDownloadDir: createDownloadDirResolver(input.config.transmission),
  });

  try {
    const mediaTypeByFeed = new Map(
      input.config.feeds.map((feed) => [feed.name, feed.mediaType]),
    );

    const scoped = input.onlyShowNames?.length
      ? scopeConfigToShows(input.config, input.onlyShowNames)
      : input.config;

    const candidates: MatchedFeedItem[] = [];

    for (const feedItem of input.repository.listDistinctFeedItems(
      input.limit,
    )) {
      const mediaType = mediaTypeByFeed.get(feedItem.feedName);
      if (!mediaType) continue;

      if (mediaType === 'movie' && scoped !== input.config) continue;

      const normalized = normalizeFeedItem({
        mediaType,
        rawTitle: feedItem.rawTitle,
      });
      const match = matchFeedItem(normalized, scoped);
      if (!match) continue;

      candidates.push({ feedItem, match });
    }

    // No outcome rows are written for the non-matching majority, unlike a
    // normal run: a rescan re-reads the same tens of thousands of items every
    // time it runs, and recording a fresh `skipped_no_match` for each would
    // bury the real run history under its own noise.
    await coordinator.submitMatchedCandidates(candidates);
    return coordinator.finalize();
  } catch (error) {
    coordinator.fail();
    throw error;
  }
}

/** A copy of the config carrying only the named TV rules, and no movie
 * policy — see rescanFeedHistory's `onlyShowNames`. Matching is name-based
 * because that is the identifier the watchlist, the config file, and
 * `candidate_state.rule_name` all agree on. */
function scopeConfigToShows(config: AppConfig, showNames: string[]): AppConfig {
  const wanted = new Set(showNames.map((name) => name.trim().toLowerCase()));
  return {
    ...config,
    tv: config.tv.filter((rule) => wanted.has(rule.name.trim().toLowerCase())),
    movies: undefined,
  };
}

export async function retryFailedCandidates(input: {
  repository: Repository;
  downloader: Downloader;
  transmissionConfig?: TransmissionConfig;
}): Promise<RunPipelineResult> {
  const run = input.repository.startRun();
  const coordinator = createPipelineCoordinator({
    run,
    repository: input.repository,
    downloader: input.downloader,
    resolveDownloadDir: input.transmissionConfig
      ? createDownloadDirResolver(input.transmissionConfig)
      : undefined,
  });

  try {
    await coordinator.retryFailedCandidates(
      input.repository.listRetryableCandidates(),
    );
    return coordinator.finalize();
  } catch (error) {
    coordinator.fail();
    throw error;
  }
}

export async function reconcileCandidates(input: {
  repository: Repository;
  downloader: Downloader;
}): Promise<ReconcileCandidatesResult> {
  if (!input.downloader.lookupTorrents) {
    throw new Error('Configured downloader does not support reconciliation.');
  }

  const candidates = input.repository.listReconcilableCandidates();

  if (candidates.length === 0) {
    return {
      trackedCount: 0,
      reconciledCount: 0,
      updatedCount: 0,
      missingCount: 0,
    };
  }

  const lookup = await input.downloader.lookupTorrents({
    ids: candidates.flatMap((candidate) =>
      candidate.transmissionTorrentId !== undefined
        ? [candidate.transmissionTorrentId]
        : [],
    ),
    hashes: candidates.flatMap((candidate) =>
      candidate.transmissionTorrentHash
        ? [candidate.transmissionTorrentHash]
        : [],
    ),
  });

  if (!lookup.ok) {
    throw new Error(lookup.message);
  }

  const torrentsById = new Map(
    lookup.torrents.map((torrent) => [torrent.torrentId, torrent]),
  );
  const torrentsByHash = new Map(
    lookup.torrents.map((torrent) => [torrent.torrentHash, torrent]),
  );
  let reconciledCount = 0;
  let updatedCount = 0;
  let missingCount = 0;

  for (const candidate of candidates) {
    const torrent = matchTorrent(candidate, torrentsById, torrentsByHash);

    input.repository.recordCandidateReconciliation(
      torrent
        ? {
            identityKey: candidate.identityKey,
            transmissionTorrentName: torrent.torrentName,
            transmissionStatusCode: torrent.statusCode,
            transmissionPercentDone: torrent.percentDone,
            transmissionDoneDate: torrent.doneDate,
            transmissionDownloadDir: torrent.downloadDir,
          }
        : { identityKey: candidate.identityKey },
    );

    if (torrent) updatedCount++;
    else missingCount++;
    reconciledCount++;
  }

  return {
    trackedCount: candidates.length,
    reconciledCount,
    updatedCount,
    missingCount,
  };
}

function matchFeedItem(
  normalized: NormalizedFeedItem,
  config: AppConfig,
): CandidateMatchRecord | undefined {
  if (normalized.mediaType === 'tv') {
    return matchTvItem(normalized, config.tv)[0];
  }

  if (!config.movies) {
    return undefined;
  }

  return matchMovieItem(normalized, config.movies);
}

function getFeedItemNoMatchReason(
  normalized: NormalizedFeedItem,
  config: AppConfig,
): string | undefined {
  if (normalized.mediaType === 'movie' && config.movies) {
    return getMovieNoMatchReason(normalized, config.movies);
  }

  return undefined;
}

function matchTorrent(
  candidate: CandidateStateRecord,
  torrentsById: Map<number, TorrentSnapshot>,
  torrentsByHash: Map<string, TorrentSnapshot>,
): TorrentSnapshot | undefined {
  if (candidate.transmissionTorrentId !== undefined) {
    const byId = torrentsById.get(candidate.transmissionTorrentId);

    if (byId) {
      return byId;
    }
  }

  if (candidate.transmissionTorrentHash) {
    return torrentsByHash.get(candidate.transmissionTorrentHash);
  }

  return undefined;
}

function createDownloadDirResolver(
  transmission: TransmissionConfig,
): (mediaType: 'tv' | 'movie') => string {
  return (mediaType) =>
    transmission.downloadDirs?.[mediaType] ??
    transmission.downloadDir ??
    (mediaType === 'tv'
      ? DEFAULT_TRANSMISSION_DOWNLOAD_DIR_TV
      : DEFAULT_TRANSMISSION_DOWNLOAD_DIR_MOVIE);
}
