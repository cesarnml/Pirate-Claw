import type { AppConfig, FeedConfig } from './config';
import { fetchFeed, type RawFeedItem } from './feed';
import { matchMovieItem } from './movie-match';
import { normalizeFeedItem } from './normalize';
import type {
  CandidateStateRecord,
  CandidateMatchRecord,
  FeedItemOutcomeRecord,
  FeedItemOutcomeStatus,
  FeedItemRecord,
  Repository,
  RunRecord,
} from './repository';
import type { Downloader } from './transmission';
import { matchTvItem } from './tv-match';

export type RunPipelineResult = {
  runId: number;
  startedAt: string;
  completedAt: string;
  counts: Record<FeedItemOutcomeStatus, number>;
  outcomes: FeedItemOutcomeRecord[];
};

export type FetchFeedFn = (feed: FeedConfig) => Promise<RawFeedItem[]>;

export async function runPipeline(input: {
  config: AppConfig;
  repository: Repository;
  downloader: Downloader;
  fetchFeed?: FetchFeedFn;
}): Promise<RunPipelineResult> {
  const fetchFeedImpl = input.fetchFeed ?? fetchFeed;
  const run = input.repository.startRun();

  try {
    const candidates: MatchedFeedItem[] = [];

    for (const feed of input.config.feeds) {
      const items = await fetchFeedImpl(feed);

      for (const item of items) {
        const feedItem = input.repository.recordFeedItem(run.id, item);
        const match = matchFeedItem(feedItem, input.config, feed);

        if (!match) {
          input.repository.recordFeedItemOutcome({
            runId: run.id,
            feedItemId: feedItem.id,
            status: 'skipped_no_match',
            message: 'No matching rule or policy.',
          });
          continue;
        }

        candidates.push({ feedItem, match });
      }
    }

    for (const group of groupByIdentity(candidates).values()) {
      const winner = selectWinningCandidate(group);

      for (const candidate of group) {
        if (candidate !== winner) {
          recordDuplicateOutcome(input.repository, run, candidate, {
            message: 'Higher-ranked candidate selected for this identity.',
          });
        }
      }

      if (input.repository.isCandidateQueued(winner.match.identityKey)) {
        recordDuplicateOutcome(input.repository, run, winner, {
          message: 'Candidate already queued in a previous run.',
        });
        continue;
      }

      await submitCandidate(input.repository, input.downloader, {
        runId: run.id,
        feedItemId: winner.feedItem.id,
        feedItem: winner.feedItem,
        match: winner.match,
      });
    }

    return finalizeRun(input.repository, run);
  } catch (error) {
    input.repository.failRun(run.id);
    throw error;
  }
}

export async function retryFailedCandidates(input: {
  repository: Repository;
  downloader: Downloader;
}): Promise<RunPipelineResult> {
  const run = input.repository.startRun();

  try {
    const retryableCandidates = input.repository.listRetryableCandidates();

    for (const candidate of retryableCandidates) {
      await submitCandidate(input.repository, input.downloader, {
        runId: run.id,
        feedItem: createRawFeedItem(candidate),
        match: createCandidateMatchRecord(candidate),
      });
    }

    return finalizeRun(input.repository, run);
  } catch (error) {
    input.repository.failRun(run.id);
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

function groupByIdentity(
  candidates: MatchedFeedItem[],
): Map<string, MatchedFeedItem[]> {
  const groups = new Map<string, MatchedFeedItem[]>();

  for (const candidate of candidates) {
    const group = groups.get(candidate.match.identityKey);

    if (group) {
      group.push(candidate);
      continue;
    }

    groups.set(candidate.match.identityKey, [candidate]);
  }

  return groups;
}

function selectWinningCandidate(group: MatchedFeedItem[]): MatchedFeedItem {
  let winner = group[0];

  for (const candidate of group.slice(1)) {
    if (candidate.match.score > winner.match.score) {
      winner = candidate;
    }
  }

  return winner;
}

function recordDuplicateOutcome(
  repository: Repository,
  run: RunRecord,
  candidate: MatchedFeedItem,
  input: { message: string },
): void {
  repository.recordCandidateOutcome({
    runId: run.id,
    feedItemId: candidate.feedItem.id,
    feedItem: candidate.feedItem,
    match: candidate.match,
    status: 'skipped_duplicate',
  });
  repository.recordFeedItemOutcome({
    runId: run.id,
    feedItemId: candidate.feedItem.id,
    status: 'skipped_duplicate',
    identityKey: candidate.match.identityKey,
    ruleName: candidate.match.ruleName,
    message: input.message,
  });
}

export async function submitCandidate(
  repository: Repository,
  downloader: Downloader,
  input: {
    runId: number;
    feedItemId?: number;
    feedItem: RawFeedItem;
    match: CandidateMatchRecord;
  },
): Promise<void> {
  const submission = await downloader.submit({
    downloadUrl: input.feedItem.downloadUrl,
  });

  if (submission.ok) {
    repository.recordCandidateOutcome({
      runId: input.runId,
      feedItemId: input.feedItemId,
      feedItem: input.feedItem,
      match: input.match,
      status: 'queued',
    });
    repository.recordFeedItemOutcome({
      runId: input.runId,
      feedItemId: input.feedItemId,
      status: 'queued',
      identityKey: input.match.identityKey,
      ruleName: input.match.ruleName,
      message: 'Queued in Transmission.',
    });
    return;
  }

  repository.recordCandidateOutcome({
    runId: input.runId,
    feedItemId: input.feedItemId,
    feedItem: input.feedItem,
    match: input.match,
    status: 'failed',
  });
  repository.recordFeedItemOutcome({
    runId: input.runId,
    feedItemId: input.feedItemId,
    status: 'failed',
    identityKey: input.match.identityKey,
    ruleName: input.match.ruleName,
    message: submission.message,
  });
}

function finalizeRun(
  repository: Repository,
  run: RunRecord,
): RunPipelineResult {
  const completedRun = repository.completeRun(run.id);
  const outcomes = repository.listFeedItemOutcomes(run.id);
  const counts = createEmptyCounts();

  for (const outcome of outcomes) {
    counts[outcome.status] += 1;
  }

  return {
    runId: completedRun.id,
    startedAt: completedRun.startedAt,
    completedAt: completedRun.completedAt ?? completedRun.startedAt,
    counts,
    outcomes,
  };
}

function createEmptyCounts(): Record<FeedItemOutcomeStatus, number> {
  return {
    queued: 0,
    failed: 0,
    skipped_duplicate: 0,
    skipped_no_match: 0,
  };
}

function createRawFeedItem(candidate: CandidateStateRecord): RawFeedItem {
  return {
    feedName: candidate.feedName,
    guidOrLink: candidate.guidOrLink,
    rawTitle: candidate.rawTitle,
    publishedAt: candidate.publishedAt,
    downloadUrl: candidate.downloadUrl,
  };
}

function createCandidateMatchRecord(
  candidate: CandidateStateRecord,
): CandidateMatchRecord {
  return {
    ruleName: candidate.ruleName,
    identityKey: candidate.identityKey,
    score: candidate.score,
    reasons: candidate.reasons,
    item: {
      mediaType: candidate.mediaType,
      rawTitle: candidate.rawTitle,
      normalizedTitle: candidate.normalizedTitle,
      season: candidate.season,
      episode: candidate.episode,
      year: candidate.year,
      resolution: candidate.resolution,
      codec: candidate.codec,
    },
  };
}

type MatchedFeedItem = {
  feedItem: FeedItemRecord;
  match: CandidateMatchRecord;
};
