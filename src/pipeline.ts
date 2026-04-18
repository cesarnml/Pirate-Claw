import type { AppConfig, FeedConfig, TransmissionConfig } from './config';
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

  return matchMovieItem(normalized, config.movies);
}

function getFeedItemNoMatchReason(
  normalized: NormalizedFeedItem,
  config: AppConfig,
): string | undefined {
  if (normalized.mediaType === 'movie') {
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
): (mediaType: 'tv' | 'movie') => string | undefined {
  return (mediaType) =>
    transmission.downloadDirs?.[mediaType] ?? transmission.downloadDir;
}
