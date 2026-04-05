import type { RawFeedItem } from './feed';
import type {
  CandidateMatchRecord,
  CandidateStateRecord,
  FeedItemOutcomeRecord,
  FeedItemOutcomeStatus,
  FeedItemRecord,
  Repository,
  RunRecord,
} from './repository';
import type { Downloader } from './transmission';

export type RunPipelineResult = {
  runId: number;
  startedAt: string;
  completedAt: string;
  counts: Record<FeedItemOutcomeStatus, number>;
  outcomes: FeedItemOutcomeRecord[];
};

export type MatchedFeedItem = {
  feedItem: FeedItemRecord;
  match: CandidateMatchRecord;
};

type SubmissionInput = {
  runId: number;
  feedItemId?: number;
  feedItem: RawFeedItem;
  match: CandidateMatchRecord;
};

export function createPipelineCoordinator(input: {
  run: RunRecord;
  repository: Repository;
  downloader: Downloader;
}) {
  return {
    recordNoMatch(feedItemId: number, message?: string): void {
      input.repository.recordFeedItemOutcome({
        runId: input.run.id,
        feedItemId,
        status: 'skipped_no_match',
        message: message ?? 'No matching rule or policy.',
      });
    },

    async submitMatchedCandidates(
      candidates: MatchedFeedItem[],
    ): Promise<void> {
      for (const group of groupByIdentity(candidates).values()) {
        const winner = selectWinningCandidate(group);

        for (const candidate of group) {
          if (candidate !== winner) {
            recordDuplicateOutcome(input.repository, input.run, candidate, {
              message: 'Higher-ranked candidate selected for this identity.',
            });
          }
        }

        if (input.repository.isCandidateQueued(winner.match.identityKey)) {
          recordFeedItemOutcome(input.repository, {
            runId: input.run.id,
            feedItemId: winner.feedItem.id,
            status: 'skipped_duplicate',
            match: winner.match,
            message: 'Candidate already queued in a previous run.',
          });
          continue;
        }

        await submitCandidate(input.repository, input.downloader, {
          runId: input.run.id,
          feedItemId: winner.feedItem.id,
          feedItem: winner.feedItem,
          match: winner.match,
        });
      }
    },

    async retryFailedCandidates(
      candidates: CandidateStateRecord[],
    ): Promise<void> {
      for (const candidate of candidates) {
        await submitCandidate(input.repository, input.downloader, {
          runId: input.run.id,
          feedItemId: candidate.lastFeedItemId,
          feedItem: createRawFeedItem(candidate),
          match: createCandidateMatchRecord(candidate),
        });
      }
    },

    finalize(): RunPipelineResult {
      return finalizeRun(input.repository, input.run);
    },

    fail(): void {
      input.repository.failRun(input.run.id);
    },
  };
}

export async function submitCandidate(
  repository: Repository,
  downloader: Downloader,
  input: SubmissionInput,
): Promise<void> {
  const submission = await downloader.submit({
    downloadUrl: input.feedItem.downloadUrl,
  });

  if (submission.ok) {
    recordCandidateResult(repository, {
      ...input,
      status: 'queued',
      message: 'Queued in Transmission.',
      transmissionTorrentId: submission.torrentId,
      transmissionTorrentName: submission.torrentName,
      transmissionTorrentHash: submission.torrentHash,
    });
    return;
  }

  recordCandidateResult(repository, {
    ...input,
    status: 'failed',
    message: submission.message,
  });
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
  recordCandidateResult(repository, {
    runId: run.id,
    feedItemId: candidate.feedItem.id,
    feedItem: candidate.feedItem,
    match: candidate.match,
    status: 'skipped_duplicate',
    message: input.message,
  });
}

function recordFeedItemOutcome(
  repository: Repository,
  input: {
    runId: number;
    feedItemId?: number;
    status: FeedItemOutcomeStatus;
    match: CandidateMatchRecord;
    message: string;
  },
): void {
  repository.recordFeedItemOutcome({
    runId: input.runId,
    feedItemId: input.feedItemId,
    status: input.status,
    identityKey: input.match.identityKey,
    ruleName: input.match.ruleName,
    message: input.message,
  });
}

function recordCandidateResult(
  repository: Repository,
  input: SubmissionInput & {
    status: 'queued' | 'failed' | 'skipped_duplicate';
    message: string;
    transmissionTorrentId?: number;
    transmissionTorrentName?: string;
    transmissionTorrentHash?: string;
  },
): void {
  repository.recordCandidateOutcome({
    runId: input.runId,
    feedItemId: input.feedItemId,
    feedItem: input.feedItem,
    match: input.match,
    status: input.status,
    transmissionTorrentId: input.transmissionTorrentId,
    transmissionTorrentName: input.transmissionTorrentName,
    transmissionTorrentHash: input.transmissionTorrentHash,
  });
  recordFeedItemOutcome(repository, {
    runId: input.runId,
    feedItemId: input.feedItemId,
    status: input.status,
    match: input.match,
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
