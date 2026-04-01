import type { AppConfig, FeedConfig } from './config';
import { fetchFeed, type RawFeedItem } from './feed';
import { matchMovieItem } from './movie-match';
import { normalizeFeedItem } from './normalize';
import {
  createPipelineCoordinator,
  type MatchedFeedItem,
  type RunPipelineResult,
} from './pipeline-runner';
import type {
  CandidateLifecycleStatus,
  CandidateMatchRecord,
  CandidateStateRecord,
  FeedItemRecord,
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
  notFoundCount: number;
  counts: Record<CandidateLifecycleStatus, number>;
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
  });

  try {
    const candidates: MatchedFeedItem[] = [];

    for (const feed of input.config.feeds) {
      const items = await fetchFeedImpl(feed);

      for (const item of items) {
        const feedItem = input.repository.recordFeedItem(run.id, item);
        const match = matchFeedItem(feedItem, input.config, feed);

        if (!match) {
          coordinator.recordNoMatch(feedItem.id);
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

export async function retryFailedCandidates(input: {
  repository: Repository;
  downloader: Downloader;
}): Promise<RunPipelineResult> {
  const run = input.repository.startRun();
  const coordinator = createPipelineCoordinator({
    run,
    repository: input.repository,
    downloader: input.downloader,
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
      notFoundCount: 0,
      counts: createEmptyReconcileCounts(),
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
  const counts = createEmptyReconcileCounts();
  let reconciledCount = 0;
  let notFoundCount = 0;

  for (const candidate of candidates) {
    const torrent = matchTorrent(candidate, torrentsById, torrentsByHash);

    if (!torrent) {
      notFoundCount += 1;
      continue;
    }

    const lifecycleStatus = deriveLifecycleStatus(torrent);

    input.repository.recordCandidateReconciliation({
      identityKey: candidate.identityKey,
      lifecycleStatus,
      transmissionTorrentName: torrent.torrentName,
      transmissionStatusCode: torrent.statusCode,
      transmissionPercentDone: torrent.percentDone,
      transmissionDoneDate: torrent.doneDate,
      transmissionDownloadDir: torrent.downloadDir,
    });

    counts[lifecycleStatus] += 1;
    reconciledCount += 1;
  }

  return {
    trackedCount: candidates.length,
    reconciledCount,
    notFoundCount,
    counts,
  };
}

function matchFeedItem(
  feedItem: FeedItemRecord,
  config: AppConfig,
  feed: FeedConfig,
): CandidateMatchRecord | undefined {
  const normalized = normalizeFeedItem({
    mediaType: feed.mediaType,
    rawTitle: feedItem.rawTitle,
  });

  if (normalized.mediaType === 'tv') {
    return matchTvItem(normalized, config.tv)[0];
  }

  return matchMovieItem(normalized, config.movies);
}

function createEmptyReconcileCounts(): Record<
  CandidateLifecycleStatus,
  number
> {
  return {
    queued: 0,
    downloading: 0,
    completed: 0,
  };
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

function deriveLifecycleStatus(
  torrent: Pick<TorrentSnapshot, 'percentDone' | 'statusCode'>,
): CandidateLifecycleStatus {
  if (torrent.percentDone !== undefined && torrent.percentDone >= 1) {
    return 'completed';
  }

  if (torrent.statusCode !== undefined && torrent.statusCode === 4) {
    return 'downloading';
  }

  if (torrent.percentDone !== undefined && torrent.percentDone > 0) {
    return 'downloading';
  }

  return 'queued';
}
