import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type {
  AiReviewAgentResult,
  AiReviewAgentState,
  AiReviewComment,
  AiReviewFetcherResult,
  AiReviewThreadResolution,
  AiReviewTriagerResult,
  DeliveryState,
  ReviewOutcome,
  ReviewResult,
  StandaloneAiReviewResult,
  StandalonePullRequest,
  TicketState,
} from './orchestrator';

const STANDALONE_REVIEW_POLL_INTERVAL_MINUTES = 2;
const STANDALONE_REVIEW_POLL_MAX_WAIT_MINUTES = 8;

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function buildReviewPollCheckMinutes(
  intervalMinutes: number,
  maxWaitMinutes: number,
): number[] {
  if (intervalMinutes <= 0 || maxWaitMinutes <= 0) {
    throw new Error('Review polling interval and max wait must be positive.');
  }

  const checks: number[] = [];

  for (
    let minute = intervalMinutes;
    minute <= maxWaitMinutes;
    minute += intervalMinutes
  ) {
    checks.push(minute);
  }

  return checks;
}

export function resolveReviewPollWindowStart(
  startedAt: string | undefined,
  now: () => number = Date.now,
): { pollWindowStartedAt: number; pollWindowStartedAtIso: string } {
  const parsed = Date.parse(startedAt ?? '');

  if (!Number.isNaN(parsed)) {
    return {
      pollWindowStartedAt: parsed,
      pollWindowStartedAtIso: new Date(parsed).toISOString(),
    };
  }

  const fallback = now();
  return {
    pollWindowStartedAt: fallback,
    pollWindowStartedAtIso: new Date(fallback).toISOString(),
  };
}

export function parseAiReviewFetcherOutput(
  output: string,
): AiReviewFetcherResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(output);
  } catch (error) {
    throw new Error(
      `AI review fetcher must emit JSON. ${formatError(error)}\n${output.trim()}`.trim(),
      {
        cause: error,
      },
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(
      'AI review fetcher output must be a JSON object with `agents`, `detected`, `artifact_text`, `vendors`, and `comments` fields.',
    );
  }

  if (
    !Array.isArray(parsed.agents) ||
    !parsed.agents.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.agent === 'string' &&
        (entry.state === 'started' ||
          entry.state === 'completed' ||
          entry.state === 'findings_detected') &&
        (typeof entry.findingsCount === 'undefined' ||
          parseOptionalNumber(entry.findingsCount) !== undefined) &&
        (typeof entry.note === 'undefined' ||
          parseOptionalString(entry.note) !== undefined),
    ) ||
    typeof parsed.detected !== 'boolean' ||
    typeof parsed.artifact_text !== 'string' ||
    !Array.isArray(parsed.vendors) ||
    !parsed.vendors.every((value) => typeof value === 'string') ||
    !Array.isArray(parsed.comments)
  ) {
    throw new Error(
      'AI review fetcher output must be JSON with `agents`, boolean `detected`, string `artifact_text`, string[] `vendors`, and array `comments` fields.',
    );
  }

  const comments = parsed.comments.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error('AI review fetcher comments must be JSON objects.');
    }

    if (
      typeof entry.vendor !== 'string' ||
      typeof entry.channel !== 'string' ||
      typeof entry.author_login !== 'string' ||
      typeof entry.author_type !== 'string' ||
      typeof entry.body !== 'string' ||
      typeof entry.kind !== 'string'
    ) {
      throw new Error(
        'AI review fetcher comments must include string `vendor`, `channel`, `author_login`, `author_type`, `body`, and `kind` fields.',
      );
    }

    if (
      entry.channel !== 'issue_comment' &&
      entry.channel !== 'review_summary' &&
      entry.channel !== 'inline_review'
    ) {
      throw new Error(`Unknown AI review comment channel: ${entry.channel}`);
    }

    if (
      entry.kind !== 'summary' &&
      entry.kind !== 'finding' &&
      entry.kind !== 'unknown'
    ) {
      throw new Error(`Unknown AI review comment kind: ${entry.kind}`);
    }

    return {
      authorLogin: entry.author_login,
      authorType: entry.author_type,
      body: entry.body,
      channel: entry.channel,
      isOutdated: parseOptionalBoolean(entry.is_outdated),
      isResolved: parseOptionalBoolean(entry.is_resolved),
      kind: entry.kind,
      line: parseOptionalNumber(entry.line),
      path: parseOptionalString(entry.path),
      threadId: parseOptionalString(entry.thread_id),
      threadViewerCanResolve: parseOptionalBoolean(
        entry.thread_viewer_can_resolve,
      ),
      updatedAt: parseOptionalString(entry.updated_at),
      url: parseOptionalString(entry.url),
      vendor: entry.vendor,
    } satisfies AiReviewComment;
  });

  return {
    agents: parsed.agents.map((entry) => ({
      agent: entry.agent as string,
      state: entry.state as AiReviewAgentState,
      findingsCount: parseOptionalNumber(entry.findingsCount),
      note: parseOptionalString(entry.note),
    })) satisfies AiReviewAgentResult[],
    artifactText: parsed.artifact_text,
    comments,
    detected: parsed.detected,
    reviewedHeadSha: parseOptionalString(parsed.reviewed_head_sha),
    vendors: parsed.vendors,
  };
}

export function parseAiReviewTriagerOutput(
  output: string,
): AiReviewTriagerResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(output);
  } catch (error) {
    throw new Error(
      `AI review triager must emit JSON. ${formatError(error)}\n${output.trim()}`.trim(),
      {
        cause: error,
      },
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(
      'AI review triager output must be a JSON object with `outcome`, `note`, and `vendors` fields.',
    );
  }

  if (
    (parsed.outcome !== 'clean' &&
      parsed.outcome !== 'needs_patch' &&
      parsed.outcome !== 'patched') ||
    typeof parsed.note !== 'string' ||
    !Array.isArray(parsed.vendors) ||
    !parsed.vendors.every((value) => typeof value === 'string')
  ) {
    throw new Error(
      'AI review triager output must be JSON with `outcome`, string `note`, and string[] `vendors` fields.',
    );
  }

  return {
    actionSummary: parseOptionalString(parsed.action_summary),
    note: parsed.note,
    nonActionSummary: parseOptionalString(parsed.non_action_summary),
    outcome: parsed.outcome,
    vendors: parsed.vendors,
  };
}

function summarizeReviewMessage(message: string): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  return normalized.length > 180
    ? `${normalized.slice(0, 177).trimEnd()}...`
    : normalized;
}

export function parseResolveReviewThreadOutput(output: string): {
  message?: string;
  resolved: boolean;
} {
  let parsed: unknown;

  try {
    parsed = JSON.parse(output);
  } catch (error) {
    throw new Error(
      `GitHub review-thread resolution must emit JSON. ${formatError(error)}`.trim(),
      {
        cause: error,
      },
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(
      'GitHub review-thread resolution output must be a JSON object.',
    );
  }

  if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
    const firstError = parsed.errors.find(isRecord);
    return {
      resolved: false,
      message: summarizeReviewMessage(
        typeof firstError?.message === 'string'
          ? firstError.message
          : 'GitHub reported a review-thread resolution error.',
      ),
    };
  }

  const thread =
    isRecord(parsed.data) &&
    isRecord(parsed.data.resolveReviewThread) &&
    isRecord(parsed.data.resolveReviewThread.thread)
      ? parsed.data.resolveReviewThread.thread
      : undefined;

  if (thread?.isResolved === true) {
    return { resolved: true };
  }

  return {
    resolved: false,
    message: 'GitHub did not confirm that the review thread was resolved.',
  };
}

type ReviewCoreDependencies = {
  relativeToRepo: (cwd: string, absolutePath: string) => string;
  resolveReviewFetcher: () => string;
  resolveReviewThread: (worktreePath: string, threadId: string) => string;
  resolveReviewTriager: () => string;
  runProcess: (cwd: string, cmd: string[]) => string;
};

export type TicketReviewDependencies = {
  fetcher?: (worktreePath: string, prNumber: number) => AiReviewFetcherResult;
  now?: () => number;
  resolveThreads?: (
    worktreePath: string,
    comments: AiReviewComment[],
  ) => AiReviewThreadResolution[];
  sleep?: (milliseconds: number) => Promise<void>;
  triager?: (
    worktreePath: string,
    artifactJsonPath: string,
  ) => AiReviewTriagerResult;
  updatePullRequestBody?: (
    state: DeliveryState,
    ticket: TicketState,
  ) => void | Promise<void>;
} & ReviewCoreDependencies;

export type StandaloneAiReviewDependencies = Pick<
  TicketReviewDependencies,
  'fetcher' | 'now' | 'resolveThreads' | 'sleep' | 'triager'
> &
  ReviewCoreDependencies & {
    previousOutcome?: ReviewOutcome;
    pullRequest?: StandalonePullRequest;
    resolveStandalonePullRequest: (
      cwd: string,
      prNumber?: number,
    ) => StandalonePullRequest;
    updatePullRequestBody?: (
      cwd: string,
      pullRequest: StandalonePullRequest,
      result: StandaloneAiReviewResult,
    ) => void | Promise<void>;
    writeNote?: (
      cwd: string,
      prNumber: number,
      result: StandaloneAiReviewResult,
    ) => Promise<void>;
  };

type PollForAiReviewResult =
  | {
      status: 'triage_ready';
      result: AiReviewFetcherResult;
      effectiveMaxWaitMinutes: number;
    }
  | {
      status: 'partial_timeout';
      result: AiReviewFetcherResult;
      incompleteAgents: string[];
      effectiveMaxWaitMinutes: number;
    }
  | {
      status: 'clean_timeout';
      incompleteAgents?: string[];
      effectiveMaxWaitMinutes: number;
    };

type DetectedReviewProcessingResult = {
  actionSummary?: string;
  artifactJsonPath: string;
  artifactTextPath: string;
  comments: AiReviewComment[];
  incompleteAgents?: string[];
  nonActionSummary?: string;
  note: string;
  outcome: ReviewResult;
  reviewedHeadSha?: string;
  threadResolutions?: AiReviewThreadResolution[];
  vendors: string[];
};

type CleanReviewProcessingResult = {
  incompleteAgents?: string[];
  note: string;
  outcome: ReviewResult;
};

function runAiReviewFetcher(
  worktreePath: string,
  prNumber: number,
  dependencies: ReviewCoreDependencies,
): AiReviewFetcherResult {
  const fetcher = dependencies.resolveReviewFetcher();
  const output = dependencies.runProcess(worktreePath, [
    fetcher,
    String(prNumber),
  ]);
  return parseAiReviewFetcherOutput(output);
}

function runAiReviewTriager(
  worktreePath: string,
  artifactJsonPath: string,
  dependencies: ReviewCoreDependencies,
): AiReviewTriagerResult {
  const triager = dependencies.resolveReviewTriager();
  const output = dependencies.runProcess(worktreePath, [
    triager,
    artifactJsonPath,
  ]);
  return parseAiReviewTriagerOutput(output);
}

function isTerminalReviewAgent(
  agent: Pick<AiReviewAgentResult, 'state'>,
): boolean {
  return agent.state === 'completed' || agent.state === 'findings_detected';
}

function hasActionableReviewFindings(result: AiReviewFetcherResult): boolean {
  return result.agents.some((agent) => agent.state === 'findings_detected');
}

function hasInFlightReviewAgents(result: AiReviewFetcherResult): boolean {
  return result.agents.some((agent) => agent.state === 'started');
}

function allDetectedAgentsReadyForTriage(
  result: AiReviewFetcherResult,
): boolean {
  return (
    result.agents.length > 0 &&
    result.agents.every((agent) => isTerminalReviewAgent(agent))
  );
}

function listIncompleteReviewAgents(result: AiReviewFetcherResult): string[] {
  return result.agents
    .filter((agent) => agent.state === 'started')
    .map((agent) => agent.agent);
}

function formatReviewAgentList(agents: string[]): string {
  return agents.join(', ');
}

function formatPartialAiReviewTimeoutNote(
  maxWaitMinutes: number,
  agents: string[],
): string {
  return `AI review reached the ${maxWaitMinutes}-minute limit while waiting on: ${formatReviewAgentList(agents)}. Triage the captured findings and rerun manually if needed.`;
}

function formatIncompleteAiReviewWithoutFindingsNote(
  maxWaitMinutes: number,
  agents: string[],
): string {
  return `AI review reached the ${maxWaitMinutes}-minute limit while waiting on: ${formatReviewAgentList(agents)}. No actionable findings were captured. Rerun manually if needed.`;
}

function formatNoAiReviewFeedbackNote(maxWaitMinutes: number): string {
  return `No AI review feedback was detected within the ${maxWaitMinutes}-minute polling window.`;
}

function computeExtendedReviewPollMaxWaitMinutes(
  intervalMinutes: number,
  maxWaitMinutes: number,
): number {
  return maxWaitMinutes + intervalMinutes;
}

function mergeReviewOutcome(
  previous: ReviewOutcome | undefined,
  next: ReviewOutcome | undefined,
): ReviewOutcome | undefined {
  if (previous === 'patched' || next === 'patched') {
    return 'patched';
  }

  return previous ?? next;
}

function accumulateReviewOutcome(
  previous: ReviewOutcome | undefined,
  next: ReviewResult,
): ReviewResult | undefined {
  if (next === 'clean' || next === 'patched') {
    return mergeReviewOutcome(previous, next) ?? next;
  }

  return next;
}

function accumulateTicketReviewOutcome(
  previous: ReviewOutcome | undefined,
  next: ReviewResult,
): ReviewOutcome | undefined {
  const accumulated = accumulateReviewOutcome(previous, next);

  if (accumulated === 'clean' || accumulated === 'patched') {
    return accumulated;
  }

  return previous;
}

function mapStandaloneReviewOutcome(outcome: ReviewResult): ReviewResult {
  return outcome === 'needs_patch' ? 'operator_input_needed' : outcome;
}

function formatCumulativePatchedReviewNote(note: string | undefined): string {
  if (note === undefined || note.length === 0) {
    return 'Earlier review cycles led to prudent follow-up patches; the latest review pass found no additional prudent changes.';
  }

  if (note.includes('no additional prudent follow-up changes')) {
    return note;
  }

  return `${note} Earlier review cycles led to prudent follow-up patches, and the latest review pass found no additional prudent follow-up changes.`;
}

function formatAccumulatedReviewNote(
  previous: ReviewOutcome | undefined,
  next: ReviewResult,
  note: string | undefined,
): string | undefined {
  if (previous === 'patched' && next === 'clean') {
    return formatCumulativePatchedReviewNote(note);
  }

  return note;
}

function defaultFinalReviewNote(
  outcome: ReviewResult,
  note: string | undefined,
  previousNote: string | undefined,
): string | undefined {
  if (note !== undefined) {
    return note;
  }

  if (outcome === 'clean') {
    return 'External AI review completed without prudent follow-up changes.';
  }

  return previousNote;
}

function formatNoFeedbackReviewNote(
  previous: ReviewOutcome | undefined,
  maxWaitMinutes: number,
): string {
  return (
    formatAccumulatedReviewNote(
      previous,
      'clean',
      formatNoAiReviewFeedbackNote(maxWaitMinutes),
    ) ?? formatNoAiReviewFeedbackNote(maxWaitMinutes)
  );
}

async function readStandaloneAiReviewOutcome(
  cwd: string,
  prNumber: number,
): Promise<ReviewOutcome | undefined> {
  const notePath = resolve(
    cwd,
    '.agents/ai-review',
    `pr-${prNumber}`,
    'note.md',
  );

  if (!existsSync(notePath)) {
    return undefined;
  }

  const note = await readFile(notePath, 'utf8');
  const match = note.match(/^- Outcome: `([^`]+)`$/m);

  if (match?.[1] === 'clean' || match?.[1] === 'patched') {
    return match[1];
  }

  return undefined;
}

function shouldResolveDetectedReviewThreads(
  mode: 'standalone' | 'ticketed',
  outcome: ReviewResult,
): boolean {
  if (mode === 'ticketed') {
    return outcome === 'patched';
  }

  return outcome === 'clean' || outcome === 'patched';
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, milliseconds);
  });
}

function resolveNativeReviewThreads(
  worktreePath: string,
  comments: AiReviewComment[],
  dependencies: ReviewCoreDependencies,
): AiReviewThreadResolution[] {
  const resolutions: AiReviewThreadResolution[] = [];
  const seen = new Set<string>();

  for (const comment of comments) {
    if (
      comment.channel !== 'inline_review' ||
      (comment.kind !== 'finding' && comment.isOutdated !== true) ||
      comment.isResolved === true ||
      !comment.threadId ||
      seen.has(comment.threadId)
    ) {
      continue;
    }

    seen.add(comment.threadId);

    if (comment.threadViewerCanResolve === false) {
      resolutions.push({
        status: 'unresolvable',
        threadId: comment.threadId,
        url: comment.url,
        vendor: comment.vendor,
        message: 'GitHub did not expose this review thread as resolvable.',
      });
      continue;
    }

    try {
      const response = dependencies.resolveReviewThread(
        worktreePath,
        comment.threadId,
      );
      const parsed = parseResolveReviewThreadOutput(response);

      if (!parsed.resolved) {
        resolutions.push({
          status: 'failed',
          threadId: comment.threadId,
          url: comment.url,
          vendor: comment.vendor,
          message: parsed.message,
        });
        continue;
      }

      resolutions.push({
        status: 'resolved',
        threadId: comment.threadId,
        url: comment.url,
        vendor: comment.vendor,
      });
    } catch (error) {
      const message = summarizeReviewMessage(formatError(error));
      resolutions.push({
        status: message.includes('already resolved')
          ? 'already_resolved'
          : 'failed',
        threadId: comment.threadId,
        url: comment.url,
        vendor: comment.vendor,
        message,
      });
    }
  }

  return resolutions;
}

async function pollForAiReview(
  worktreePath: string,
  prNumber: number,
  intervalMinutes: number,
  maxWaitMinutes: number,
  pollWindowStartedAt: number,
  dependencies: Pick<TicketReviewDependencies, 'fetcher' | 'now' | 'sleep'> &
    ReviewCoreDependencies,
): Promise<PollForAiReviewResult> {
  const now = dependencies.now ?? Date.now;
  const sleepFn = dependencies.sleep ?? defaultSleep;
  const fetcher =
    dependencies.fetcher ??
    ((nextWorktreePath: string, nextPrNumber: number) =>
      runAiReviewFetcher(nextWorktreePath, nextPrNumber, dependencies));
  const checks = buildReviewPollCheckMinutes(intervalMinutes, maxWaitMinutes);
  const extendedMaxWaitMinutes = computeExtendedReviewPollMaxWaitMinutes(
    intervalMinutes,
    maxWaitMinutes,
  );
  let extended = false;

  for (let index = 0; index < checks.length; index += 1) {
    const checkMinute = checks[index]!;
    const dueAt = pollWindowStartedAt + checkMinute * 60_000;
    const remaining = dueAt - now();

    if (remaining > 0) {
      await sleepFn(remaining);
    }

    const result = fetcher(worktreePath, prNumber);

    if (!result.detected) {
      continue;
    }

    if (allDetectedAgentsReadyForTriage(result)) {
      return {
        status: 'triage_ready',
        result,
        effectiveMaxWaitMinutes: extended
          ? extendedMaxWaitMinutes
          : maxWaitMinutes,
      };
    }

    if (
      !extended &&
      checkMinute === maxWaitMinutes &&
      hasInFlightReviewAgents(result)
    ) {
      checks.push(extendedMaxWaitMinutes);
      extended = true;
      continue;
    }

    if (
      checkMinute === extendedMaxWaitMinutes &&
      hasInFlightReviewAgents(result)
    ) {
      const incompleteAgents = listIncompleteReviewAgents(result);

      if (hasActionableReviewFindings(result)) {
        return {
          status: 'partial_timeout',
          result,
          incompleteAgents,
          effectiveMaxWaitMinutes: extendedMaxWaitMinutes,
        };
      }

      return {
        status: 'clean_timeout',
        incompleteAgents,
        effectiveMaxWaitMinutes: extendedMaxWaitMinutes,
      };
    }
  }

  return {
    status: 'clean_timeout',
    effectiveMaxWaitMinutes: maxWaitMinutes,
  };
}

async function writeAiReviewArtifacts(
  artifactStemPath: string,
  result: AiReviewFetcherResult,
): Promise<{ artifactJsonPath: string; artifactTextPath: string }> {
  const artifactJsonPath = `${artifactStemPath}.json`;
  const artifactTextPath = `${artifactStemPath}.txt`;

  await mkdir(dirname(artifactJsonPath), { recursive: true });
  await writeFile(
    artifactJsonPath,
    JSON.stringify(
      {
        artifact_text: result.artifactText,
        agents: result.agents.map((agent) => ({
          agent: agent.agent,
          state: agent.state,
          findingsCount: agent.findingsCount ?? null,
          note: agent.note ?? null,
        })),
        detected: result.detected,
        reviewed_head_sha: result.reviewedHeadSha ?? null,
        vendors: result.vendors,
        comments: result.comments.map((comment) => ({
          author_login: comment.authorLogin,
          author_type: comment.authorType,
          body: comment.body,
          channel: comment.channel,
          is_outdated: comment.isOutdated ?? null,
          is_resolved: comment.isResolved ?? null,
          kind: comment.kind,
          line: comment.line ?? null,
          path: comment.path ?? null,
          thread_id: comment.threadId ?? null,
          thread_viewer_can_resolve: comment.threadViewerCanResolve ?? null,
          updated_at: comment.updatedAt ?? null,
          url: comment.url ?? null,
          vendor: comment.vendor,
        })),
        thread_resolutions: [],
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  await writeFile(artifactTextPath, result.artifactText, 'utf8');

  return {
    artifactJsonPath,
    artifactTextPath,
  };
}

async function writeAiReviewThreadResolutions(
  artifactJsonPath: string | undefined,
  resolutions: AiReviewThreadResolution[],
): Promise<void> {
  if (!artifactJsonPath) {
    return;
  }

  const existing = JSON.parse(
    await readFile(artifactJsonPath, 'utf8'),
  ) as Record<string, unknown>;
  existing.thread_resolutions = resolutions.map((resolution) => ({
    message: resolution.message ?? null,
    status: resolution.status,
    thread_id: resolution.threadId,
    url: resolution.url ?? null,
    vendor: resolution.vendor,
  }));
  await writeFile(
    artifactJsonPath,
    JSON.stringify(existing, null, 2) + '\n',
    'utf8',
  );
}

async function processDetectedAiReview(options: {
  artifactStemPath: string;
  detectedReview: AiReviewFetcherResult;
  effectiveMaxWaitMinutes: number;
  incompleteAgents?: string[];
  mapOutcome?: (outcome: ReviewResult) => ReviewResult;
  mode: 'standalone' | 'ticketed';
  previousOutcome: ReviewOutcome | undefined;
  resolveThreads: (
    worktreePath: string,
    comments: AiReviewComment[],
  ) => AiReviewThreadResolution[];
  triager: (
    worktreePath: string,
    artifactJsonPath: string,
  ) => AiReviewTriagerResult;
  worktreePath: string;
}): Promise<DetectedReviewProcessingResult> {
  const artifacts = await writeAiReviewArtifacts(
    options.artifactStemPath,
    options.detectedReview,
  );
  const triageResult = options.triager(
    options.worktreePath,
    artifacts.artifactJsonPath,
  );
  const latestOutcome =
    options.mapOutcome?.(triageResult.outcome) ?? triageResult.outcome;
  const threadResolutions = shouldResolveDetectedReviewThreads(
    options.mode,
    latestOutcome,
  )
    ? options.resolveThreads(
        options.worktreePath,
        options.detectedReview.comments,
      )
    : [];
  if (threadResolutions.length > 0) {
    await writeAiReviewThreadResolutions(
      artifacts.artifactJsonPath,
      threadResolutions,
    );
  }

  return {
    actionSummary: triageResult.actionSummary,
    artifactJsonPath: artifacts.artifactJsonPath,
    artifactTextPath: artifacts.artifactTextPath,
    comments: options.detectedReview.comments,
    incompleteAgents: options.incompleteAgents,
    nonActionSummary: triageResult.nonActionSummary,
    note: options.incompleteAgents?.length
      ? formatPartialAiReviewTimeoutNote(
          options.effectiveMaxWaitMinutes,
          options.incompleteAgents,
        )
      : (formatAccumulatedReviewNote(
          options.previousOutcome,
          latestOutcome,
          triageResult.note,
        ) ?? triageResult.note),
    outcome:
      accumulateReviewOutcome(options.previousOutcome, latestOutcome) ??
      latestOutcome,
    reviewedHeadSha: options.detectedReview.reviewedHeadSha,
    threadResolutions:
      threadResolutions.length > 0 ? threadResolutions : undefined,
    vendors:
      triageResult.vendors.length > 0
        ? triageResult.vendors
        : options.detectedReview.vendors,
  };
}

function processCleanAiReview(options: {
  effectiveMaxWaitMinutes: number;
  incompleteAgents?: string[];
  maxWaitMinutes: number;
  previousOutcome: ReviewOutcome | undefined;
}): CleanReviewProcessingResult {
  return {
    incompleteAgents: options.incompleteAgents,
    note: options.incompleteAgents?.length
      ? formatIncompleteAiReviewWithoutFindingsNote(
          options.effectiveMaxWaitMinutes,
          options.incompleteAgents,
        )
      : formatNoFeedbackReviewNote(
          options.previousOutcome,
          options.maxWaitMinutes,
        ),
    outcome:
      accumulateReviewOutcome(options.previousOutcome, 'clean') ?? 'clean',
  };
}

async function applyTicketReviewUpdate(
  state: DeliveryState,
  ticketId: string,
  updateTicket: (ticket: TicketState) => TicketState,
  dependencies: Pick<TicketReviewDependencies, 'updatePullRequestBody'>,
): Promise<DeliveryState> {
  const nextState: DeliveryState = {
    ...state,
    tickets: state.tickets.map((ticket) =>
      ticket.id === ticketId ? updateTicket(ticket) : ticket,
    ),
  };
  const updatedTarget = nextState.tickets.find(
    (ticket) => ticket.id === ticketId,
  );

  if (!updatedTarget) {
    throw new Error(`Unknown ticket ${ticketId}.`);
  }

  try {
    await dependencies.updatePullRequestBody?.(nextState, updatedTarget);
  } catch (error) {
    console.warn(
      `Review was recorded locally for ${updatedTarget.id}, but PR body update failed: ${formatError(error)}`,
    );
  }

  return nextState;
}

async function persistStandaloneAiReviewResult(
  cwd: string,
  pullRequest: StandalonePullRequest,
  result: StandaloneAiReviewResult,
  dependencies: Pick<
    StandaloneAiReviewDependencies,
    'updatePullRequestBody' | 'writeNote'
  >,
): Promise<StandaloneAiReviewResult> {
  const writeNote = dependencies.writeNote ?? writeStandaloneAiReviewNote;

  await writeNote(cwd, pullRequest.number, result);
  try {
    await dependencies.updatePullRequestBody?.(cwd, pullRequest, result);
  } catch (error) {
    console.warn(
      `Standalone AI review was recorded locally for PR #${pullRequest.number}, but PR body update failed: ${formatError(error)}`,
    );
  }

  return result;
}

export async function runTicketReviewLifecycle(
  state: DeliveryState,
  cwd: string,
  ticketId: string | undefined,
  dependencies: TicketReviewDependencies,
): Promise<DeliveryState> {
  const target = state.tickets.find((ticket) =>
    ticketId ? ticket.id === ticketId : ticket.status === 'in_review',
  );

  if (!target || target.status !== 'in_review' || !target.prNumber) {
    throw new Error('No in-review ticket with an open PR was found.');
  }

  const now = dependencies.now ?? Date.now;
  const triager =
    dependencies.triager ??
    ((worktreePath: string, artifactJsonPath: string) =>
      runAiReviewTriager(worktreePath, artifactJsonPath, dependencies));
  const resolveThreads =
    dependencies.resolveThreads ??
    ((worktreePath: string, comments: AiReviewComment[]) =>
      resolveNativeReviewThreads(worktreePath, comments, dependencies));
  const { pollWindowStartedAt, pollWindowStartedAtIso } =
    resolveReviewPollWindowStart(target.prOpenedAt, now);
  const reviewPollResult = await pollForAiReview(
    target.worktreePath,
    target.prNumber,
    state.reviewPollIntervalMinutes,
    state.reviewPollMaxWaitMinutes,
    pollWindowStartedAt,
    dependencies,
  );

  if (
    reviewPollResult.status === 'triage_ready' ||
    reviewPollResult.status === 'partial_timeout'
  ) {
    const processedReview = await processDetectedAiReview({
      artifactStemPath: resolve(
        cwd,
        state.reviewsDirPath,
        `${target.id}-ai-review`,
      ),
      detectedReview: reviewPollResult.result,
      effectiveMaxWaitMinutes: reviewPollResult.effectiveMaxWaitMinutes,
      incompleteAgents:
        reviewPollResult.status === 'partial_timeout'
          ? reviewPollResult.incompleteAgents
          : undefined,
      mode: 'ticketed',
      previousOutcome: target.reviewOutcome,
      resolveThreads,
      triager,
      worktreePath: target.worktreePath,
    });
    const nextStatus =
      processedReview.outcome === 'needs_patch' ? 'needs_patch' : 'reviewed';
    return applyTicketReviewUpdate(
      state,
      target.id,
      (ticket) => ({
        ...ticket,
        prOpenedAt: ticket.prOpenedAt ?? pollWindowStartedAtIso,
        status: nextStatus,
        reviewActionSummary: processedReview.actionSummary,
        reviewComments: processedReview.comments,
        reviewArtifactJsonPath: dependencies.relativeToRepo(
          cwd,
          processedReview.artifactJsonPath,
        ),
        reviewArtifactPath: dependencies.relativeToRepo(
          cwd,
          processedReview.artifactTextPath,
        ),
        reviewFetchedAt: new Date(now()).toISOString(),
        reviewHeadSha: processedReview.reviewedHeadSha,
        reviewNonActionSummary: processedReview.nonActionSummary,
        reviewOutcome: accumulateTicketReviewOutcome(
          ticket.reviewOutcome,
          processedReview.outcome,
        ),
        reviewNote: processedReview.note,
        reviewIncompleteAgents: processedReview.incompleteAgents,
        reviewThreadResolutions: processedReview.threadResolutions,
        reviewVendors: processedReview.vendors,
      }),
      dependencies,
    );
  }

  const processedReview = processCleanAiReview({
    effectiveMaxWaitMinutes: reviewPollResult.effectiveMaxWaitMinutes,
    incompleteAgents: reviewPollResult.incompleteAgents,
    maxWaitMinutes: state.reviewPollMaxWaitMinutes,
    previousOutcome: target.reviewOutcome,
  });
  return applyTicketReviewUpdate(
    state,
    target.id,
    (ticket) => ({
      ...ticket,
      prOpenedAt: ticket.prOpenedAt ?? pollWindowStartedAtIso,
      status: 'reviewed',
      reviewActionSummary: undefined,
      reviewComments: undefined,
      reviewArtifactJsonPath: undefined,
      reviewArtifactPath: undefined,
      reviewHeadSha: undefined,
      reviewNonActionSummary: undefined,
      reviewOutcome: accumulateTicketReviewOutcome(
        ticket.reviewOutcome,
        processedReview.outcome,
      ),
      reviewNote: processedReview.note,
      reviewIncompleteAgents: processedReview.incompleteAgents,
      reviewThreadResolutions: undefined,
      reviewVendors: [],
    }),
    dependencies,
  );
}

export async function runStandaloneAiReviewLifecycle(
  cwd: string,
  prNumber: number | undefined,
  dependencies: StandaloneAiReviewDependencies,
): Promise<StandaloneAiReviewResult> {
  const pullRequest =
    dependencies.pullRequest ??
    dependencies.resolveStandalonePullRequest(cwd, prNumber);
  const previousOutcome =
    dependencies.previousOutcome ??
    (await readStandaloneAiReviewOutcome(cwd, pullRequest.number));
  const triager =
    dependencies.triager ??
    ((worktreePath: string, artifactJsonPath: string) =>
      runAiReviewTriager(worktreePath, artifactJsonPath, dependencies));
  const resolveThreads =
    dependencies.resolveThreads ??
    ((worktreePath: string, comments: AiReviewComment[]) =>
      resolveNativeReviewThreads(worktreePath, comments, dependencies));
  const now = dependencies.now ?? Date.now;
  const commandStartedAt = now();
  const reviewPollResult = await pollForAiReview(
    cwd,
    pullRequest.number,
    STANDALONE_REVIEW_POLL_INTERVAL_MINUTES,
    STANDALONE_REVIEW_POLL_MAX_WAIT_MINUTES,
    commandStartedAt,
    dependencies,
  );

  if (
    reviewPollResult.status === 'triage_ready' ||
    reviewPollResult.status === 'partial_timeout'
  ) {
    const processedReview = await processDetectedAiReview({
      artifactStemPath: resolve(
        cwd,
        '.agents/ai-review',
        `pr-${pullRequest.number}`,
        'review',
      ),
      detectedReview: reviewPollResult.result,
      effectiveMaxWaitMinutes: reviewPollResult.effectiveMaxWaitMinutes,
      incompleteAgents:
        reviewPollResult.status === 'partial_timeout'
          ? reviewPollResult.incompleteAgents
          : undefined,
      mapOutcome: mapStandaloneReviewOutcome,
      mode: 'standalone',
      previousOutcome,
      resolveThreads,
      triager,
      worktreePath: cwd,
    });
    const standaloneResult: StandaloneAiReviewResult = {
      actionSummary: processedReview.actionSummary,
      artifactJsonPath: dependencies.relativeToRepo(
        cwd,
        processedReview.artifactJsonPath,
      ),
      artifactTextPath: dependencies.relativeToRepo(
        cwd,
        processedReview.artifactTextPath,
      ),
      incompleteAgents: processedReview.incompleteAgents,
      note: processedReview.note,
      comments: processedReview.comments,
      nonActionSummary: processedReview.nonActionSummary,
      outcome: processedReview.outcome,
      prNumber: pullRequest.number,
      prUrl: pullRequest.url,
      reviewedHeadSha: processedReview.reviewedHeadSha,
      threadResolutions: processedReview.threadResolutions,
      vendors: processedReview.vendors,
    };
    return persistStandaloneAiReviewResult(
      cwd,
      pullRequest,
      standaloneResult,
      dependencies,
    );
  }

  const processedReview = processCleanAiReview({
    effectiveMaxWaitMinutes: reviewPollResult.effectiveMaxWaitMinutes,
    incompleteAgents: reviewPollResult.incompleteAgents,
    maxWaitMinutes: STANDALONE_REVIEW_POLL_MAX_WAIT_MINUTES,
    previousOutcome,
  });
  const standaloneResult: StandaloneAiReviewResult = {
    incompleteAgents: processedReview.incompleteAgents,
    note: processedReview.note,
    outcome: processedReview.outcome,
    prNumber: pullRequest.number,
    prUrl: pullRequest.url,
    vendors: [],
  };
  return persistStandaloneAiReviewResult(
    cwd,
    pullRequest,
    standaloneResult,
    dependencies,
  );
}

export async function writeStandaloneAiReviewNote(
  cwd: string,
  prNumber: number,
  result: StandaloneAiReviewResult,
): Promise<void> {
  const notePath = resolve(
    cwd,
    '.agents/ai-review',
    `pr-${prNumber}`,
    'note.md',
  );
  await mkdir(dirname(notePath), { recursive: true });
  await writeFile(
    notePath,
    [
      '# AI Review Note',
      '',
      `- PR: ${result.prUrl}`,
      `- Outcome: \`${result.outcome}\``,
      result.vendors.length > 0
        ? `- Vendors: ${result.vendors.map((vendor) => `\`${vendor}\``).join(', ')}`
        : undefined,
      result.actionSummary
        ? `- Action summary: ${result.actionSummary}`
        : undefined,
      result.nonActionSummary
        ? `- Non-action summary: ${result.nonActionSummary}`
        : undefined,
      result.incompleteAgents?.length
        ? `- Incomplete agents at timeout: ${result.incompleteAgents.map((agent) => `\`${agent}\``).join(', ')}`
        : undefined,
      `- Note: ${result.note}`,
      result.artifactJsonPath
        ? `- Artifact (json): \`${result.artifactJsonPath}\``
        : undefined,
      result.artifactTextPath
        ? `- Artifact (text): \`${result.artifactTextPath}\``
        : undefined,
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n') + '\n',
    'utf8',
  );
}

export async function recordTicketReview(
  state: DeliveryState,
  cwd: string,
  ticketId: string,
  outcome: ReviewResult,
  note: string | undefined,
  dependencies: Pick<
    TicketReviewDependencies,
    | 'resolveThreads'
    | 'updatePullRequestBody'
    | 'resolveReviewThread'
    | 'relativeToRepo'
    | 'resolveReviewFetcher'
    | 'resolveReviewTriager'
    | 'runProcess'
  >,
): Promise<DeliveryState> {
  const target = state.tickets.find((ticket) => ticket.id === ticketId);

  if (!target) {
    throw new Error(`Unknown ticket ${ticketId}.`);
  }

  if (
    target.status !== 'needs_patch' &&
    target.status !== 'in_review' &&
    target.status !== 'operator_input_needed'
  ) {
    throw new Error(
      `Ticket ${ticketId} must be in review before recording an outcome.`,
    );
  }

  const resolveThreads =
    dependencies.resolveThreads ??
    ((worktreePath: string, comments: AiReviewComment[]) =>
      resolveNativeReviewThreads(worktreePath, comments, dependencies));
  const reviewThreadResolutions =
    outcome === 'patched' &&
    target.reviewThreadResolutions &&
    target.reviewThreadResolutions.length > 0
      ? target.reviewThreadResolutions
      : outcome === 'patched' && target.reviewComments
        ? resolveThreads(target.worktreePath, target.reviewComments)
        : target.reviewThreadResolutions;
  if (
    outcome === 'patched' &&
    reviewThreadResolutions &&
    reviewThreadResolutions.length > 0
  ) {
    await writeAiReviewThreadResolutions(
      target.reviewArtifactJsonPath
        ? resolve(cwd, target.reviewArtifactJsonPath)
        : undefined,
      reviewThreadResolutions,
    );
  }

  return applyTicketReviewUpdate(
    state,
    ticketId,
    (ticket) => ({
      ...ticket,
      status:
        outcome === 'operator_input_needed'
          ? 'operator_input_needed'
          : 'reviewed',
      reviewOutcome: accumulateTicketReviewOutcome(
        ticket.reviewOutcome,
        outcome,
      ),
      reviewNote:
        formatAccumulatedReviewNote(
          ticket.reviewOutcome,
          outcome,
          defaultFinalReviewNote(outcome, note, ticket.reviewNote),
        ) ?? defaultFinalReviewNote(outcome, note, ticket.reviewNote),
      reviewThreadResolutions:
        outcome === 'patched' ? reviewThreadResolutions : undefined,
    }),
    dependencies,
  );
}
