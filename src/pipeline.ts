import type { AppConfig, FeedConfig } from './config';
import { fetchFeed, type RawFeedItem } from './feed';
import { matchMovieItem } from './movie-match';
import { normalizeFeedItem } from './normalize';
import type {
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

      const submission = await input.downloader.submit({
        downloadUrl: winner.feedItem.downloadUrl,
      });

      if (submission.ok) {
        input.repository.recordCandidateOutcome({
          runId: run.id,
          feedItemId: winner.feedItem.id,
          feedItem: winner.feedItem,
          match: winner.match,
          status: 'queued',
        });
        input.repository.recordFeedItemOutcome({
          runId: run.id,
          feedItemId: winner.feedItem.id,
          status: 'queued',
          identityKey: winner.match.identityKey,
          ruleName: winner.match.ruleName,
          message: 'Queued in Transmission.',
        });
        continue;
      }

      input.repository.recordCandidateOutcome({
        runId: run.id,
        feedItemId: winner.feedItem.id,
        feedItem: winner.feedItem,
        match: winner.match,
        status: 'failed',
      });
      input.repository.recordFeedItemOutcome({
        runId: run.id,
        feedItemId: winner.feedItem.id,
        status: 'failed',
        identityKey: winner.match.identityKey,
        ruleName: winner.match.ruleName,
        message: submission.message,
      });
    }

    return finalizeRun(input.repository, run);
  } catch (error) {
    input.repository.completeRun(run.id);
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

type MatchedFeedItem = {
  feedItem: FeedItemRecord;
  match: CandidateMatchRecord;
};
