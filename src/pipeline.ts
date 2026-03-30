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
  CandidateMatchRecord,
  FeedItemRecord,
  Repository,
} from './repository';
import type { Downloader } from './transmission';
import { matchTvItem } from './tv-match';

export type { RunPipelineResult } from './pipeline-runner';
export { submitCandidate } from './pipeline-runner';

export type FetchFeedFn = (feed: FeedConfig) => Promise<RawFeedItem[]>;

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
