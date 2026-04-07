import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import {
  loadOrchestratorConfig as loadOrchestratorConfigImpl,
  resolveOrchestratorConfig as resolveOrchestratorConfigImpl,
  type OrchestratorConfig,
  type ResolvedOrchestratorConfig,
} from './config';
import {
  addWorktree as addPlatformWorktree,
  bootstrapWorktreeIfNeeded as bootstrapPlatformWorktreeIfNeeded,
  copyLocalEnvIfPresent as copyPlatformEnvIfPresent,
  createPullRequest as createPlatformPullRequest,
  editPullRequest as editPlatformPullRequest,
  ensureBranchPushed as ensurePlatformBranchPushed,
  ensureCleanWorktree as ensurePlatformCleanWorktree,
  fetchOrigin as fetchPlatformOrigin,
  findOpenPullRequest as findPlatformOpenPullRequest,
  findPrimaryWorktreePath as findPlatformPrimaryWorktreePath,
  hasMergedPullRequestForBranch as hasPlatformMergedPullRequestForBranch,
  listCommitSubjectsBetween as listPlatformCommitSubjectsBetween,
  readCurrentBranch as readPlatformCurrentBranch,
  readHeadSha as readPlatformHeadSha,
  readLatestCommitSubject as readPlatformLatestCommitSubject,
  readMergeBase as readPlatformMergeBase,
  rebaseOnto as rebasePlatformOnto,
  rebaseOntoDefaultBranch as rebasePlatformOntoDefaultBranch,
  resolveReviewThread as resolvePlatformReviewThread,
  resolveStandalonePullRequest as resolvePlatformStandalonePullRequest,
  runProcess as runPlatformProcess,
  runProcessResult as runPlatformProcessResult,
  type PullRequestSummary,
} from './platform';
import {
  createOptions as createOptionsImpl,
  derivePlanKey as derivePlanKeyImpl,
  inferPlanPathFromBranch as inferPlanPathFromBranchImpl,
  parsePlan as parsePlanImpl,
  resolvePlanPathForBranch as resolvePlanPathForBranchImpl,
} from './planning';
import {
  loadState as loadStateImpl,
  repairState as repairStateImpl,
  saveState as saveStateImpl,
  summarizeStateDifferences as summarizeStateDifferencesImpl,
  syncStateWithPlan as syncStateWithPlanImpl,
} from './state';

export { parseGitWorktreeList } from './platform';

export type TicketStatus =
  | 'pending'
  | 'in_progress'
  | 'internally_reviewed'
  | 'in_review'
  | 'needs_patch'
  | 'operator_input_needed'
  | 'reviewed'
  | 'done';

export type ReviewOutcome = 'clean' | 'patched';
export type ReviewResult =
  | ReviewOutcome
  | 'needs_patch'
  | 'operator_input_needed';

export type TicketDefinition = {
  id: string;
  title: string;
  slug: string;
  ticketFile: string;
};

export type TicketState = TicketDefinition & {
  status: TicketStatus;
  branch: string;
  baseBranch: string;
  worktreePath: string;
  handoffPath?: string;
  handoffGeneratedAt?: string;
  internalReviewCompletedAt?: string;
  prNumber?: number;
  prUrl?: string;
  prOpenedAt?: string;
  reviewArtifactPath?: string;
  reviewArtifactJsonPath?: string;
  reviewActionSummary?: string;
  reviewFetchedAt?: string;
  reviewHeadSha?: string;
  reviewNonActionSummary?: string;
  reviewComments?: AiReviewComment[];
  reviewOutcome?: ReviewOutcome;
  reviewNote?: string;
  reviewIncompleteAgents?: string[];
  reviewThreadResolutions?: AiReviewThreadResolution[];
  reviewVendors?: string[];
};

export type DeliveryState = {
  planKey: string;
  planPath: string;
  statePath: string;
  reviewsDirPath: string;
  handoffsDirPath: string;
  reviewPollIntervalMinutes: number;
  reviewPollMaxWaitMinutes: number;
  tickets: TicketState[];
};

export type OrchestratorOptions = {
  planPath: string;
  planKey: string;
  statePath: string;
  reviewsDirPath: string;
  handoffsDirPath: string;
  reviewPollIntervalMinutes: number;
  reviewPollMaxWaitMinutes: number;
};

type RepairStateResult = {
  state: DeliveryState;
  backupPath?: string;
  changes: string[];
  hadExistingState: boolean;
};

type BranchMatch = {
  branch: string;
  source: 'ticket-id' | 'derived';
};

export type { OrchestratorConfig, ResolvedOrchestratorConfig } from './config';

let _config: ResolvedOrchestratorConfig = {
  defaultBranch: 'main',
  planRoot: 'docs',
  runtime: 'bun',
  packageManager: 'npm',
};

export function initOrchestratorConfig(
  config: ResolvedOrchestratorConfig,
): void {
  _config = config;
}

export function getOrchestratorConfig(): ResolvedOrchestratorConfig {
  return _config;
}

export async function loadOrchestratorConfig(
  cwd: string,
): Promise<OrchestratorConfig> {
  return loadOrchestratorConfigImpl(cwd);
}

export function resolveOrchestratorConfig(
  raw: OrchestratorConfig,
  cwd: string,
): ResolvedOrchestratorConfig {
  return resolveOrchestratorConfigImpl(raw, cwd);
}

export { inferPackageManager } from './config';

export function generateRunDeliverInvocation(
  packageManager: ResolvedOrchestratorConfig['packageManager'],
): string {
  if (packageManager === 'npm') {
    return 'npm run deliver --';
  }

  return `${packageManager} run deliver`;
}

export type DeliveryNotificationEvent =
  | {
      kind: 'ticket_started';
      planKey: string;
      ticketId: string;
      ticketTitle: string;
      branch: string;
    }
  | {
      kind: 'pr_opened';
      planKey: string;
      ticketId: string;
      ticketTitle: string;
      branch: string;
      prUrl: string;
    }
  | {
      kind: 'review_window_ready';
      planKey: string;
      ticketId: string;
      ticketTitle: string;
      branch: string;
      prUrl: string;
      reviewPollIntervalMinutes: number;
      reviewPollMaxWaitMinutes: number;
      firstCheckAt: string;
      finalCheckAt: string;
    }
  | {
      kind: 'review_recorded';
      planKey: string;
      ticketId: string;
      ticketTitle: string;
      branch: string;
      outcome: ReviewResult;
      note?: string;
      prUrl?: string;
    }
  | {
      kind: 'ticket_completed';
      planKey: string;
      ticketId: string;
      ticketTitle: string;
      branch: string;
      prUrl?: string;
    }
  | {
      kind: 'standalone_review_started';
      prNumber: number;
      prUrl: string;
      reviewPollIntervalMinutes: number;
      reviewPollMaxWaitMinutes: number;
    }
  | {
      kind: 'standalone_review_recorded';
      prNumber: number;
      prUrl: string;
      outcome: ReviewResult;
      note?: string;
    }
  | {
      kind: 'run_blocked';
      planKey?: string;
      command?: string;
      reason: string;
    };

type DeliveryNotifier =
  | {
      kind: 'noop';
      enabled: false;
    }
  | {
      kind: 'telegram';
      enabled: true;
      botToken: string;
      chatId: string;
    };

type NotificationPayload = {
  entities?: Array<{
    length: number;
    offset: number;
    type: 'text_link';
    url: string;
  }>;
  text: string;
};

const DEFAULT_REVIEW_POLL_INTERVAL_MINUTES = 2;
const DEFAULT_REVIEW_POLL_MAX_WAIT_MINUTES = 8;
const MAX_ACTION_COMMITS = 20;
const STANDALONE_AI_REVIEW_SECTION_START = '<!-- ai-review:start -->';
const STANDALONE_AI_REVIEW_SECTION_END = '<!-- ai-review:end -->';

export type AiReviewAgentState = 'started' | 'completed' | 'findings_detected';

export type AiReviewAgentResult = {
  agent: string;
  state: AiReviewAgentState;
  findingsCount?: number;
  note?: string;
};

type AiReviewCommentChannel =
  | 'issue_comment'
  | 'review_summary'
  | 'inline_review';

type AiReviewCommentKind = 'summary' | 'finding' | 'unknown';

type AiReviewComment = {
  authorLogin: string;
  authorType: string;
  body: string;
  channel: AiReviewCommentChannel;
  isOutdated?: boolean;
  isResolved?: boolean;
  kind: AiReviewCommentKind;
  line?: number;
  path?: string;
  threadId?: string;
  threadViewerCanResolve?: boolean;
  updatedAt?: string;
  url?: string;
  vendor: string;
};

type AiReviewThreadResolutionStatus =
  | 'resolved'
  | 'already_resolved'
  | 'failed'
  | 'unresolvable';

type AiReviewThreadResolution = {
  message?: string;
  status: AiReviewThreadResolutionStatus;
  threadId: string;
  url?: string;
  vendor: string;
};

type ReviewActionCommit = {
  sha: string;
  subject: string;
  vendors: string[];
};

type AiReviewFetcherResult = {
  agents: AiReviewAgentResult[];
  artifactText: string;
  comments: AiReviewComment[];
  detected: boolean;
  reviewedHeadSha?: string;
  vendors: string[];
};

type AiReviewTriagerResult = {
  actionSummary?: string;
  note: string;
  nonActionSummary?: string;
  outcome: ReviewResult;
  vendors: string[];
};

type PollReviewDependencies = {
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
};

export type StandaloneAiReviewResult = {
  actionSummary?: string;
  artifactJsonPath?: string;
  artifactTextPath?: string;
  incompleteAgents?: string[];
  comments?: AiReviewComment[];
  note: string;
  nonActionSummary?: string;
  outcome: ReviewResult;
  prNumber: number;
  prUrl: string;
  reviewedHeadSha?: string;
  threadResolutions?: AiReviewThreadResolution[];
  vendors: string[];
};

type ReviewMetadataRefreshContext = {
  actionCommits?: ReviewActionCommit[];
  currentHeadSha?: string;
};

type TicketReviewMetadataRefreshTarget = Pick<
  TicketState,
  | 'id'
  | 'title'
  | 'ticketFile'
  | 'baseBranch'
  | 'internalReviewCompletedAt'
  | 'reviewActionSummary'
  | 'reviewIncompleteAgents'
  | 'reviewComments'
  | 'reviewHeadSha'
  | 'status'
  | 'reviewOutcome'
  | 'reviewNote'
  | 'reviewNonActionSummary'
  | 'reviewThreadResolutions'
  | 'reviewVendors'
>;

type ReviewMetadataRefreshBodyOptions =
  | {
      mode: 'standalone';
      body: string;
      result: StandaloneAiReviewResult;
    }
  | {
      mode: 'ticketed';
      state: DeliveryState;
      ticket: TicketReviewMetadataRefreshTarget;
    };

type StandaloneAiReviewDependencies = Pick<
  PollReviewDependencies,
  'fetcher' | 'now' | 'resolveThreads' | 'sleep' | 'triager'
> & {
  previousOutcome?: ReviewOutcome;
  pullRequest?: StandalonePullRequest;
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

type StandalonePullRequest = {
  body: string;
  createdAt: string;
  headRefName: string;
  headRefOid: string;
  number: number;
  title: string;
  url: string;
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

export async function runDeliveryOrchestrator(
  argv: string[],
  cwd: string,
): Promise<number> {
  let parsed:
    | {
        command: string;
        positionals: string[];
        flags: Set<string>;
        planPath?: string;
        prNumber?: number;
      }
    | undefined;

  try {
    const rawConfig = await loadOrchestratorConfig(cwd);
    _config = resolveOrchestratorConfig(rawConfig, cwd);

    await ensureEnvReady(cwd);
    const notifier = resolveNotifier();
    parsed = parseCliArgs(argv);
    if (parsed.command === 'ai-review') {
      const result = await runStandaloneAiReview(
        cwd,
        notifier,
        parsed.prNumber,
      );
      console.log(formatStandaloneAiReviewResult(result));
      await emitNotificationWarnings(notifier, cwd, [
        buildStandaloneReviewRecordedEvent(result),
      ]);
      return 0;
    }
    const options = await resolveOptionsForCommand(
      cwd,
      parsed.command,
      parsed.planPath,
    );
    parsed = {
      ...parsed,
      planPath: options.planPath,
    };

    if (parsed.command === 'repair-state') {
      const repaired = await repairState(cwd, options);
      console.log(
        [formatStatus(repaired.state), formatRepairSummary(repaired)]
          .filter(Boolean)
          .join('\n\n'),
      );
      return 0;
    }

    const state = await loadState(cwd, options);

    switch (parsed.command) {
      case 'sync': {
        await saveState(cwd, state);
        console.log(formatStatus(state));
        return 0;
      }
      case 'status': {
        console.log(formatStatus(state));
        return 0;
      }
      case 'start': {
        const nextState = await startTicket(state, cwd, parsed.positionals[0]);
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState));
        await emitNotificationWarnings(
          notifier,
          cwd,
          eventsForStartCommand(nextState, parsed.positionals[0]),
        );
        return 0;
      }
      case 'internal-review': {
        const nextState = await recordInternalReview(
          state,
          parsed.positionals[0],
        );
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState));
        return 0;
      }
      case 'open-pr': {
        const nextState = await openPullRequest(
          state,
          cwd,
          parsed.positionals[0],
        );
        await saveState(cwd, nextState);
        console.log(
          [
            formatStatus(nextState),
            formatReviewWindowMessage(nextState, parsed.positionals[0]),
          ]
            .filter(Boolean)
            .join('\n\n'),
        );
        await emitNotificationWarnings(
          notifier,
          cwd,
          eventsForOpenPrCommand(nextState, parsed.positionals[0]),
        );
        return 0;
      }
      case 'poll-review': {
        const nextState = await pollReview(state, cwd, parsed.positionals[0]);
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState));
        await emitNotificationWarnings(
          notifier,
          cwd,
          eventsForPollReviewCommand(nextState, parsed.positionals[0]),
        );
        return 0;
      }
      case 'record-review': {
        const [ticketId, outcome, ...noteParts] = parsed.positionals;

        if (
          !ticketId ||
          (outcome !== 'clean' &&
            outcome !== 'patched' &&
            outcome !== 'operator_input_needed')
        ) {
          throw new Error(
            `Usage: ${generateRunDeliverInvocation(_config.packageManager)} --plan <plan-path> record-review <ticket-id> <clean|patched|operator_input_needed> [note]`,
          );
        }

        const nextState = await recordReview(
          state,
          cwd,
          ticketId,
          outcome,
          noteParts.join(' ').trim() || undefined,
        );
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState));
        await emitNotificationWarnings(
          notifier,
          cwd,
          eventsForRecordReviewCommand(nextState, ticketId),
        );
        return 0;
      }
      case 'advance': {
        const startNext = !parsed.flags.has('no-start-next');
        const nextState = await advanceToNextTicket(state, cwd, startNext);
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState));
        await emitNotificationWarnings(
          notifier,
          cwd,
          eventsForAdvanceCommand(state, nextState),
        );
        return 0;
      }
      case 'restack': {
        const nextState = await restackTicket(
          state,
          cwd,
          parsed.positionals[0],
        );
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState));
        return 0;
      }
      default: {
        console.error(getUsage());
        return 1;
      }
    }
  } catch (error) {
    const notifier = resolveNotifier();
    await emitNotificationWarnings(notifier, cwd, [
      buildRunBlockedEvent(
        parsed?.planPath ? derivePlanKey(parsed.planPath) : undefined,
        parsed?.command,
        formatError(error),
      ),
    ]);
    console.error(formatError(error));
    return 1;
  }
}

export function parseDotEnv(content: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key.length > 0) {
      values[key] = value;
    }
  }

  return values;
}

async function ensureEnvReady(cwd: string): Promise<void> {
  await ensureLocalEnvFile(cwd);
  await loadDotEnvIntoProcess(cwd);
}

async function ensureLocalEnvFile(cwd: string): Promise<void> {
  const localEnvPath = resolve(cwd, '.env');

  if (existsSync(localEnvPath)) {
    return;
  }

  const primaryWorktreePath = findPrimaryWorktreePath(cwd);

  if (!primaryWorktreePath) {
    return;
  }

  await copyLocalEnvIfPresent(primaryWorktreePath, cwd);
}

export function findPrimaryWorktreePath(cwd: string): string | undefined {
  return findPlatformPrimaryWorktreePath(
    cwd,
    _config.defaultBranch,
    _config.runtime,
  );
}

async function loadDotEnvIntoProcess(cwd: string): Promise<void> {
  const envPath = resolve(cwd, '.env');

  if (!existsSync(envPath)) {
    return;
  }

  const values = parseDotEnv(await readFile(envPath, 'utf8'));

  for (const [key, value] of Object.entries(values)) {
    if (typeof process.env[key] === 'undefined') {
      process.env[key] = value;
    }
  }
}

export function parsePlan(
  markdown: string,
  planPath: string,
): TicketDefinition[] {
  return parsePlanImpl(markdown, planPath);
}

export function syncStateWithPlan(
  existing: DeliveryState | undefined,
  ticketDefinitions: TicketDefinition[],
  cwd: string,
  options: OrchestratorOptions,
  inferred?: DeliveryState,
): DeliveryState {
  return syncStateWithPlanImpl(existing, ticketDefinitions, options, inferred, {
    cwd,
    defaultBranch: _config.defaultBranch,
    deriveBranchName,
    deriveWorktreePath,
  });
}

export function findNextPendingTicket(
  state: DeliveryState,
): TicketState | undefined {
  return state.tickets.find((ticket) => ticket.status === 'pending');
}

export function findTicketByBranch(
  state: DeliveryState,
  branch: string,
): TicketState | undefined {
  return state.tickets.find((ticket) => ticket.branch === branch);
}

export function canAdvanceTicket(ticket: TicketState): boolean {
  return (
    ticket.status === 'reviewed' &&
    (ticket.reviewOutcome === 'clean' || ticket.reviewOutcome === 'patched')
  );
}

export function deriveBranchName(
  definition: Pick<TicketDefinition, 'id' | 'slug'>,
): string {
  return `agents/${definition.id.toLowerCase().replace('.', '-')}-${definition.slug}`;
}

export function deriveWorktreePath(cwd: string, ticketId: string): string {
  const parent = dirname(resolve(cwd));
  const repoBaseName = basename(resolve(cwd)).replace(/_p\d+(_\d+)?$/, '');
  return join(
    parent,
    `${repoBaseName}_${ticketId.toLowerCase().replace('.', '_')}`,
  );
}

export function resolveReviewFetcher(): string {
  if (process.env.AI_CODE_REVIEW_FETCHER) {
    return process.env.AI_CODE_REVIEW_FETCHER;
  }

  return '.agents/skills/ai-code-review/scripts/fetch_ai_pr_comments.sh';
}

export function resolveReviewTriager(): string {
  if (process.env.AI_CODE_REVIEW_TRIAGER) {
    return process.env.AI_CODE_REVIEW_TRIAGER;
  }

  return '.agents/skills/ai-code-review/scripts/triage_ai_review.sh';
}

export function resolveNotifier(): DeliveryNotifier {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!botToken || !chatId) {
    return {
      kind: 'noop',
      enabled: false,
    };
  }

  return {
    kind: 'telegram',
    enabled: true,
    botToken,
    chatId,
  };
}

export function createOptions(input: {
  planPath?: string;
}): OrchestratorOptions {
  return createOptionsImpl(input);
}

function parseCliArgs(argv: string[]): {
  command: string;
  positionals: string[];
  flags: Set<string>;
  planPath?: string;
  prNumber?: number;
} {
  let planPath: string | undefined;
  let prNumber: number | undefined;
  const flags = new Set<string>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--plan') {
      planPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === '--pr') {
      const rawNumber = argv[index + 1];

      if (!rawNumber || Number.isNaN(Number(rawNumber))) {
        throw new Error('Pass --pr <number>.');
      }

      prNumber = Number(rawNumber);
      index += 1;
      continue;
    }

    if (value === '--phase') {
      throw new Error(
        '--phase has been removed. Pass --plan <plan-path> instead.',
      );
    }

    if (value?.startsWith('--')) {
      flags.add(value.slice(2));
      continue;
    }

    positionals.push(value ?? '');
  }

  const [command, ...rest] = positionals;

  if (!command) {
    throw new Error(getUsage());
  }

  return {
    command,
    positionals: rest,
    flags,
    planPath,
    prNumber,
  };
}

async function resolveOptionsForCommand(
  cwd: string,
  command: string,
  planPath?: string,
): Promise<OrchestratorOptions> {
  if (planPath) {
    return createOptions({ planPath });
  }

  if (command !== 'restack') {
    throw new Error(
      'Pass --plan <plan-path>. Phase aliases are no longer supported.',
    );
  }

  const branch = readCurrentBranch(cwd);
  const inferredPlanPath = await inferPlanPathFromBranch(cwd, branch);
  return createOptions({ planPath: inferredPlanPath });
}

function getUsage(): string {
  return [
    `Usage: ${generateRunDeliverInvocation(_config.packageManager)} --plan <plan-path> <command>`,
    '',
    'Commands:',
    '  ai-review [--pr <number>]',
    '  sync',
    '  status',
    '  repair-state',
    '  start [ticket-id]',
    '  internal-review [ticket-id]',
    '  open-pr [ticket-id]',
    '  poll-review [ticket-id]',
    '  record-review <ticket-id> <clean|patched|operator_input_needed> [note]',
    '  advance [--no-start-next]',
    '  restack [ticket-id]',
  ].join('\n');
}

function findTicketById(
  state: DeliveryState,
  ticketId?: string,
): TicketState | undefined {
  return ticketId
    ? state.tickets.find((ticket) => ticket.id === ticketId)
    : (state.tickets.find((ticket) => ticket.status === 'in_review') ??
        state.tickets.find(
          (ticket) => ticket.status === 'operator_input_needed',
        ));
}

export async function loadState(
  cwd: string,
  options: OrchestratorOptions,
): Promise<DeliveryState> {
  return loadStateImpl(cwd, options, {
    cwd,
    defaultBranch: _config.defaultBranch,
    runtime: _config.runtime,
    deriveBranchName,
    deriveWorktreePath,
    findExistingBranch,
  });
}

async function repairState(
  cwd: string,
  options: OrchestratorOptions,
): Promise<RepairStateResult> {
  return repairStateImpl(cwd, options, {
    cwd,
    defaultBranch: _config.defaultBranch,
    runtime: _config.runtime,
    deriveBranchName,
    deriveWorktreePath,
    findExistingBranch,
  });
}

export async function inferPlanPathFromBranch(
  cwd: string,
  branch: string,
): Promise<string> {
  return inferPlanPathFromBranchImpl(
    cwd,
    branch,
    _config.planRoot,
    findExistingBranch,
  );
}

export function resolvePlanPathForBranch(
  planIndex: Array<{ planPath: string; tickets: TicketDefinition[] }>,
  branch: string,
): string {
  return resolvePlanPathForBranchImpl(planIndex, branch, findExistingBranch);
}

export async function saveState(
  cwd: string,
  state: DeliveryState,
): Promise<void> {
  await saveStateImpl(cwd, state);
}

export function summarizeStateDifferences(
  existing: DeliveryState,
  repaired: DeliveryState,
): string[] {
  return summarizeStateDifferencesImpl(existing, repaired);
}

export function findExistingBranch(
  branches: string[],
  definition: Pick<TicketDefinition, 'id' | 'slug'>,
): BranchMatch | undefined {
  const ticketIdToken = definition.id.toLowerCase().replace('.', '-');
  const ticketIdMatches = branches.filter((branch) => {
    const normalized = branch.toLowerCase();
    return (
      normalized.includes(`/${ticketIdToken}`) ||
      normalized.includes(`-${ticketIdToken}`) ||
      normalized.endsWith(ticketIdToken)
    );
  });

  if (ticketIdMatches.length > 0) {
    return {
      branch: preferDeliveryBranch(ticketIdMatches),
      source: 'ticket-id',
    };
  }

  const derived = deriveBranchName(definition);

  if (branches.includes(derived)) {
    return {
      branch: derived,
      source: 'derived',
    };
  }

  return undefined;
}

function resolveStandalonePullRequest(
  cwd: string,
  prNumber?: number,
): StandalonePullRequest {
  return resolvePlatformStandalonePullRequest(cwd, _config.runtime, prNumber);
}

async function startTicket(
  state: DeliveryState,
  cwd: string,
  ticketId?: string,
): Promise<DeliveryState> {
  const active = state.tickets.find(
    (ticket) => ticket.status === 'in_progress',
  );

  if (active && active.id !== ticketId) {
    throw new Error(`Ticket ${active.id} is already in progress.`);
  }

  const target =
    (ticketId
      ? state.tickets.find((ticket) => ticket.id === ticketId)
      : (active ?? findNextPendingTicket(state))) ?? undefined;

  if (!target) {
    throw new Error('No pending ticket found.');
  }

  const targetIndex = state.tickets.findIndex(
    (ticket) => ticket.id === target.id,
  );
  const previous = targetIndex > 0 ? state.tickets[targetIndex - 1] : undefined;

  if (previous && previous.status !== 'done') {
    throw new Error(
      `Cannot start ${target.id} before ${previous.id} is marked done.`,
    );
  }

  if (target.status === 'in_progress') {
    return state;
  }

  if (!existsSync(target.worktreePath)) {
    addWorktree(cwd, target.worktreePath, target.branch, target.baseBranch);
  }

  await copyLocalEnvIfPresent(cwd, target.worktreePath);
  await bootstrapWorktreeIfNeeded(target.worktreePath);

  const handoff = await writeTicketHandoff(state, cwd, target.id);

  return {
    ...state,
    tickets: state.tickets.map((ticket) =>
      ticket.id === target.id
        ? {
            ...ticket,
            status: 'in_progress',
            handoffPath: handoff.relativePath,
            handoffGeneratedAt: handoff.generatedAt,
          }
        : ticket,
    ),
  };
}

export async function copyLocalEnvIfPresent(
  sourceWorktreePath: string,
  targetWorktreePath: string,
): Promise<void> {
  await copyPlatformEnvIfPresent(sourceWorktreePath, targetWorktreePath);
}

export async function recordInternalReview(
  state: DeliveryState,
  ticketId?: string,
): Promise<DeliveryState> {
  const target =
    (ticketId
      ? state.tickets.find((ticket) => ticket.id === ticketId)
      : state.tickets.find((ticket) => ticket.status === 'in_progress')) ??
    undefined;

  if (!target) {
    throw new Error(
      'No in-progress ticket found to mark as internally reviewed.',
    );
  }

  if (target.status === 'internally_reviewed') {
    return state;
  }

  if (target.status !== 'in_progress') {
    throw new Error(
      `Ticket ${target.id} must be in progress before internal review can be recorded.`,
    );
  }

  const completedAt = new Date().toISOString();

  return {
    ...state,
    tickets: state.tickets.map((ticket) =>
      ticket.id === target.id
        ? {
            ...ticket,
            status: 'internally_reviewed',
            internalReviewCompletedAt: completedAt,
          }
        : ticket,
    ),
  };
}

export async function openPullRequest(
  state: DeliveryState,
  cwd: string,
  ticketId?: string,
): Promise<DeliveryState> {
  const target =
    (ticketId
      ? state.tickets.find((ticket) => ticket.id === ticketId)
      : (state.tickets.find(
          (ticket) => ticket.status === 'internally_reviewed',
        ) ?? state.tickets.find((ticket) => ticket.status === 'in_review'))) ??
    undefined;

  if (!target) {
    throw new Error('No internally reviewed ticket found to open as a PR.');
  }

  if (target.status === 'in_progress') {
    throw new Error(
      `Ticket ${target.id} must complete internal review before opening a PR.`,
    );
  }

  if (
    target.status !== 'internally_reviewed' &&
    target.status !== 'in_review'
  ) {
    throw new Error(
      `Ticket ${target.id} is not in a PR-openable state. Current status: ${target.status}.`,
    );
  }

  ensureBranchPushed(target.worktreePath, target.branch);

  const title = buildPullRequestTitle(
    target,
    readLatestCommitSubject(target.worktreePath),
  );
  const currentHeadSha = readHeadSha(target.worktreePath);
  const body = buildPullRequestBody(state, target, {
    actionCommits: listReviewActionCommits(
      target.worktreePath,
      target.reviewHeadSha,
      currentHeadSha,
      target.reviewComments,
      target.reviewVendors,
    ),
    currentHeadSha,
  });
  assertReviewerFacingMarkdown(body);
  const existingPullRequest = findOpenPullRequest(
    target.worktreePath,
    target.branch,
  );
  let prUrl: string;
  let prNumber: number;

  if (existingPullRequest) {
    editPullRequest(target.worktreePath, existingPullRequest.number, {
      body,
      title,
    });
    prUrl = existingPullRequest.url;
    prNumber = existingPullRequest.number;
  } else {
    prUrl = createPullRequest(target.worktreePath, {
      base: target.baseBranch,
      body,
      head: target.branch,
      title,
    });
    prNumber = parsePullRequestNumber(prUrl);
  }

  const now = new Date().toISOString();

  return {
    ...state,
    tickets: state.tickets.map((ticket) =>
      ticket.id === target.id
        ? {
            ...ticket,
            status: 'in_review',
            internalReviewCompletedAt: ticket.internalReviewCompletedAt,
            prUrl,
            prNumber,
            prOpenedAt: now,
          }
        : ticket,
    ),
  };
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
    })),
    artifactText: parsed.artifact_text,
    comments,
    detected: parsed.detected,
    reviewedHeadSha: parseOptionalString(parsed.reviewed_head_sha),
    vendors: parsed.vendors,
  };
}

function runAiReviewFetcher(
  worktreePath: string,
  prNumber: number,
): AiReviewFetcherResult {
  const fetcher = resolveReviewFetcher();
  const output = runProcess(worktreePath, [fetcher, String(prNumber)]);
  return parseAiReviewFetcherOutput(output);
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

function runAiReviewTriager(
  worktreePath: string,
  artifactJsonPath: string,
): AiReviewTriagerResult {
  const triager = resolveReviewTriager();
  const output = runProcess(worktreePath, [triager, artifactJsonPath]);
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

function computeExtendedReviewPollMaxWaitMinutes(
  intervalMinutes: number,
  maxWaitMinutes: number,
): number {
  return maxWaitMinutes + intervalMinutes;
}

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

function resolveNativeReviewThreads(
  worktreePath: string,
  comments: AiReviewComment[],
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
      const response = resolveReviewThread(worktreePath, comment.threadId);
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
  dependencies: Pick<PollReviewDependencies, 'fetcher' | 'now' | 'sleep'> = {},
): Promise<PollForAiReviewResult> {
  const now = dependencies.now ?? Date.now;
  const sleepFn = dependencies.sleep ?? sleep;
  const fetcher = dependencies.fetcher ?? runAiReviewFetcher;
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

function shouldResolveDetectedReviewThreads(
  mode: 'standalone' | 'ticketed',
  outcome: ReviewResult,
): boolean {
  if (mode === 'ticketed') {
    return outcome === 'patched';
  }

  return outcome === 'clean' || outcome === 'patched';
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
  dependencies: {
    updatePullRequestBody?: (
      state: DeliveryState,
      ticket: TicketState,
    ) => void | Promise<void>;
  } = {},
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

  const updatePullRequestBodyFn =
    dependencies.updatePullRequestBody ?? updatePullRequestBody;
  try {
    await updatePullRequestBodyFn(nextState, updatedTarget);
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
  > = {},
): Promise<StandaloneAiReviewResult> {
  const writeNote = dependencies.writeNote ?? writeStandaloneAiReviewNote;
  const updatePullRequestBodyFn =
    dependencies.updatePullRequestBody ?? updateStandalonePullRequestBody;

  await writeNote(cwd, pullRequest.number, result);
  try {
    await updatePullRequestBodyFn(cwd, pullRequest, result);
  } catch (error) {
    console.warn(
      `Standalone AI review was recorded locally for PR #${pullRequest.number}, but PR body update failed: ${formatError(error)}`,
    );
  }

  return result;
}

export async function pollReview(
  state: DeliveryState,
  cwd: string,
  ticketId?: string,
  dependencies: PollReviewDependencies = {},
): Promise<DeliveryState> {
  const target = findTicketById(state, ticketId);

  if (!target || target.status !== 'in_review' || !target.prNumber) {
    throw new Error('No in-review ticket with an open PR was found.');
  }

  const now = dependencies.now ?? Date.now;
  const triager = dependencies.triager ?? runAiReviewTriager;
  const resolveThreads =
    dependencies.resolveThreads ?? resolveNativeReviewThreads;
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
        reviewArtifactJsonPath: relativeToRepo(
          cwd,
          processedReview.artifactJsonPath,
        ),
        reviewArtifactPath: relativeToRepo(
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

export async function runStandaloneAiReview(
  cwd: string,
  notifier: DeliveryNotifier,
  prNumber?: number,
  dependencies: StandaloneAiReviewDependencies = {},
): Promise<StandaloneAiReviewResult> {
  const pullRequest =
    dependencies.pullRequest ?? resolveStandalonePullRequest(cwd, prNumber);
  const previousOutcome =
    dependencies.previousOutcome ??
    (await readStandaloneAiReviewOutcome(cwd, pullRequest.number));
  const triager = dependencies.triager ?? runAiReviewTriager;
  const resolveThreads =
    dependencies.resolveThreads ?? resolveNativeReviewThreads;

  await emitNotificationWarnings(notifier, cwd, [
    buildStandaloneReviewStartedEvent(pullRequest.number, pullRequest.url),
  ]);

  const commandStartedAt = Date.now();
  const reviewPollResult = await pollForAiReview(
    cwd,
    pullRequest.number,
    DEFAULT_REVIEW_POLL_INTERVAL_MINUTES,
    DEFAULT_REVIEW_POLL_MAX_WAIT_MINUTES,
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
      artifactJsonPath: relativeToRepo(cwd, processedReview.artifactJsonPath),
      artifactTextPath: relativeToRepo(cwd, processedReview.artifactTextPath),
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
    maxWaitMinutes: DEFAULT_REVIEW_POLL_MAX_WAIT_MINUTES,
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

async function writeStandaloneAiReviewNote(
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

export async function recordReview(
  state: DeliveryState,
  cwd: string,
  ticketId: string,
  outcome: ReviewResult,
  note?: string,
  dependencies: {
    resolveThreads?: (
      worktreePath: string,
      comments: AiReviewComment[],
    ) => AiReviewThreadResolution[];
    updatePullRequestBody?: (
      state: DeliveryState,
      ticket: TicketState,
    ) => void | Promise<void>;
  } = {},
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
    dependencies.resolveThreads ?? resolveNativeReviewThreads;
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

async function advanceToNextTicket(
  state: DeliveryState,
  cwd: string,
  startNext: boolean,
): Promise<DeliveryState> {
  const current = state.tickets.find((ticket) => ticket.status === 'reviewed');

  if (!current) {
    throw new Error('No reviewed ticket is ready to advance.');
  }

  if (!canAdvanceTicket(current)) {
    throw new Error(
      `Ticket ${current.id} cannot advance until review is recorded as clean or patched.`,
    );
  }

  updatePullRequestBody(state, current);

  let nextState: DeliveryState = {
    ...state,
    tickets: state.tickets.map((ticket) =>
      ticket.id === current.id ? { ...ticket, status: 'done' } : ticket,
    ),
  };

  if (!startNext) {
    return nextState;
  }

  const nextTicket = findNextPendingTicket(nextState);

  if (!nextTicket) {
    return nextState;
  }

  nextState = await startTicket(nextState, cwd, nextTicket.id);
  return nextState;
}

async function restackTicket(
  state: DeliveryState,
  cwd: string,
  ticketId?: string,
): Promise<DeliveryState> {
  ensureCleanWorktree(cwd);
  const currentBranch = readCurrentBranch(cwd);
  const target =
    (ticketId
      ? state.tickets.find((ticket) => ticket.id === ticketId)
      : findTicketByBranch(state, currentBranch)) ?? undefined;

  if (!target) {
    throw new Error(
      ticketId
        ? `Unknown ticket ${ticketId}.`
        : `Current branch ${currentBranch} is not tracked by the delivery plan.`,
    );
  }

  if (target.branch !== currentBranch) {
    throw new Error(
      `Restack must run from ${target.branch}. Current branch is ${currentBranch}.`,
    );
  }

  fetchOrigin(cwd);

  const targetIndex = state.tickets.findIndex(
    (ticket) => ticket.id === target.id,
  );
  const previous = targetIndex > 0 ? state.tickets[targetIndex - 1] : undefined;

  let nextBaseBranch = _config.defaultBranch;
  let rebaseTarget = `origin/${_config.defaultBranch}`;

  if (previous) {
    const oldBase = readMergeBase(cwd, target.branch, previous.branch);

    if (!oldBase) {
      throw new Error(
        `Could not determine the shared ancestor between ${target.branch} and ${previous.branch}.`,
      );
    }

    if (!hasMergedPullRequestForBranch(cwd, previous.branch)) {
      nextBaseBranch = previous.branch;
      rebaseTarget = previous.branch;
    }

    rebaseOnto(cwd, rebaseTarget, oldBase);
  } else {
    rebaseOntoDefaultBranch(cwd, _config.defaultBranch);
  }

  const nextState: DeliveryState = {
    ...state,
    tickets: state.tickets.map((ticket) =>
      ticket.id === target.id
        ? {
            ...ticket,
            baseBranch: nextBaseBranch,
          }
        : ticket,
    ),
  };
  const updatedTarget = nextState.tickets.find(
    (ticket) => ticket.id === target.id,
  );

  if (!updatedTarget) {
    throw new Error(`Unknown ticket ${target.id}.`);
  }

  const pullRequest = findOpenPullRequest(cwd, target.branch);

  if (pullRequest) {
    const currentHeadSha = readHeadSha(updatedTarget.worktreePath);
    editPullRequest(cwd, pullRequest.number, {
      base: nextBaseBranch,
      body: buildPullRequestBody(nextState, updatedTarget, {
        actionCommits: listReviewActionCommits(
          updatedTarget.worktreePath,
          updatedTarget.reviewHeadSha,
          currentHeadSha,
          updatedTarget.reviewComments,
          updatedTarget.reviewVendors,
        ),
        currentHeadSha,
      }),
    });
  }

  return nextState;
}

function parseMarkdownHeading(
  line: string,
): { level: number; lineCount: number; title: string } | undefined {
  const match = line.trim().match(/^(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/);
  if (!match) {
    return undefined;
  }
  return { level: match[1].length, lineCount: 1, title: match[2].trim() };
}

function parseUnderlineHeading(
  lines: string[],
  index: number,
): { level: number; lineCount: number; title: string } | undefined {
  const titleLine = lines[index]?.trim();
  const underlineLine = lines[index + 1]?.trim();
  if (!titleLine || !underlineLine) {
    return undefined;
  }

  if (/^-{1,}\s*$/.test(underlineLine)) {
    return { level: 2, lineCount: 2, title: titleLine };
  }
  if (/^={1,}\s*$/.test(underlineLine)) {
    return { level: 1, lineCount: 2, title: titleLine };
  }
  return undefined;
}

function parseMarkdownHeadingAt(
  lines: string[],
  index: number,
): { level: number; lineCount: number; title: string } | undefined {
  return (
    parseMarkdownHeading(lines[index]!) ?? parseUnderlineHeading(lines, index)
  );
}

function parseFenceMarker(
  line: string,
): { char: '`' | '~'; length: number; trailing: string } | undefined {
  const match = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
  if (!match) {
    return undefined;
  }
  return {
    char: match[1]![0] as '`' | '~',
    length: match[1]!.length,
    trailing: match[2] ?? '',
  };
}

function isBannedPrBodyHeadingTitle(title: string): boolean {
  const normalized = title
    .toLowerCase()
    .replace(/[#:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (
    /^validation\b/.test(normalized) ||
    /^verification\b/.test(normalized) ||
    /^summary by\b/.test(normalized)
  );
}

function stripBannedPrBodySections(body: string): string {
  const lines = body.split('\n');
  const kept: string[] = [];
  let index = 0;
  let activeFence: { char: '`' | '~'; length: number } | undefined;

  while (index < lines.length) {
    const line = lines[index]!;
    const fenceMarker = parseFenceMarker(line);
    if (fenceMarker) {
      if (!activeFence) {
        activeFence = { char: fenceMarker.char, length: fenceMarker.length };
      } else if (
        fenceMarker.char === activeFence.char &&
        fenceMarker.length >= activeFence.length &&
        fenceMarker.trailing.trim().length === 0
      ) {
        activeFence = undefined;
      }
      kept.push(line);
      index += 1;
      continue;
    }
    if (activeFence) {
      kept.push(line);
      index += 1;
      continue;
    }

    const heading = parseMarkdownHeadingAt(lines, index);
    if (!heading || !isBannedPrBodyHeadingTitle(heading.title)) {
      kept.push(lines[index]!);
      index += 1;
      continue;
    }

    index += heading.lineCount;
    while (index < lines.length) {
      const nextLine = lines[index]!;
      const nextFenceMarker = parseFenceMarker(nextLine);
      if (nextFenceMarker) {
        if (!activeFence) {
          activeFence = {
            char: nextFenceMarker.char,
            length: nextFenceMarker.length,
          };
        } else if (
          nextFenceMarker.char === activeFence.char &&
          nextFenceMarker.length >= activeFence.length &&
          nextFenceMarker.trailing.trim().length === 0
        ) {
          activeFence = undefined;
        }
        index += 1;
        continue;
      }
      if (activeFence) {
        index += 1;
        continue;
      }
      const nextHeading = parseMarkdownHeadingAt(lines, index);
      if (nextHeading && nextHeading.level <= heading.level) {
        break;
      }
      index += 1;
    }
  }

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

function stripExternalAiReviewSections(body: string): string {
  const lines = body.split('\n');
  const kept: string[] = [];
  let index = 0;
  let activeFence: { char: '`' | '~'; length: number } | undefined;

  while (index < lines.length) {
    const line = lines[index]!;
    const fenceMarker = parseFenceMarker(line);
    if (fenceMarker) {
      if (!activeFence) {
        activeFence = { char: fenceMarker.char, length: fenceMarker.length };
      } else if (
        fenceMarker.char === activeFence.char &&
        fenceMarker.length >= activeFence.length &&
        fenceMarker.trailing.trim().length === 0
      ) {
        activeFence = undefined;
      }
      kept.push(line);
      index += 1;
      continue;
    }
    if (activeFence) {
      kept.push(line);
      index += 1;
      continue;
    }

    const heading = parseMarkdownHeadingAt(lines, index);
    if (
      !heading ||
      heading.title.trim().toLowerCase() !== 'external ai review'
    ) {
      kept.push(lines[index]!);
      index += 1;
      continue;
    }

    index += heading.lineCount;
    while (index < lines.length) {
      const nextLine = lines[index]!;
      const nextFenceMarker = parseFenceMarker(nextLine);
      if (nextFenceMarker) {
        if (!activeFence) {
          activeFence = {
            char: nextFenceMarker.char,
            length: nextFenceMarker.length,
          };
        } else if (
          nextFenceMarker.char === activeFence.char &&
          nextFenceMarker.length >= activeFence.length &&
          nextFenceMarker.trailing.trim().length === 0
        ) {
          activeFence = undefined;
        }
        index += 1;
        continue;
      }
      if (activeFence) {
        index += 1;
        continue;
      }
      const nextHeading = parseMarkdownHeadingAt(lines, index);
      if (nextHeading && nextHeading.level <= heading.level) {
        break;
      }
      index += 1;
    }
  }

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

function normalizeReviewerFacingPullRequestBody(
  body: string,
  options: {
    stripExternalAiReviewSections?: boolean;
  } = {},
): string {
  const sanitized = stripBannedPrBodySections(body);
  const withoutExternalReview = options.stripExternalAiReviewSections
    ? stripExternalAiReviewSections(sanitized)
    : sanitized;

  return `${withoutExternalReview.trimEnd()}\n`;
}

function collectActionVendors(
  comments: AiReviewComment[] | undefined,
  vendors: string[] | undefined,
): string[] {
  const fromFindings = (comments ?? [])
    .filter((comment) => comment.kind === 'finding')
    .map((comment) => comment.vendor);
  const merged = fromFindings.length > 0 ? fromFindings : (vendors ?? []);
  return [...new Set(merged)];
}

function listReviewActionCommits(
  cwd: string,
  reviewedHeadSha: string | undefined,
  currentHeadSha: string | undefined,
  comments: AiReviewComment[] | undefined,
  vendors: string[] | undefined,
): ReviewActionCommit[] {
  if (
    !reviewedHeadSha ||
    !currentHeadSha ||
    reviewedHeadSha === currentHeadSha
  ) {
    return [];
  }

  const actionVendors = collectActionVendors(comments, vendors);
  try {
    return listCommitSubjectsBetween(
      cwd,
      reviewedHeadSha,
      currentHeadSha,
      MAX_ACTION_COMMITS,
    )
      .map((line) => {
        const [sha, subject] = line.split('\t', 2);
        if (!sha || !subject) {
          return undefined;
        }
        return {
          sha,
          subject: summarizeReviewMessage(subject),
          vendors: actionVendors,
        } satisfies ReviewActionCommit;
      })
      .filter((commit): commit is ReviewActionCommit => commit !== undefined);
  } catch {
    return [];
  }
}

function preferDeliveryBranch(branches: string[]): string {
  return (
    branches.find((branch) => branch.startsWith('agents/')) ?? branches[0]!
  );
}

function shortenSha(sha: string | undefined): string | undefined {
  return sha ? sha.slice(0, 12) : undefined;
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

function formatCumulativePatchedReviewNote(note: string | undefined): string {
  if (note === undefined || note.length === 0) {
    return 'Earlier review cycles led to prudent follow-up patches; the latest review pass found no additional prudent changes.';
  }

  if (note.includes('no additional prudent follow-up changes')) {
    return note;
  }

  return `${note} Earlier review cycles led to prudent follow-up patches, and the latest review pass found no additional prudent follow-up changes.`;
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

function summarizeReviewComment(body: string): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  return normalized.length > 140
    ? `${normalized.slice(0, 137).trimEnd()}...`
    : normalized;
}

function formatReviewCommentLocation(comment: AiReviewComment): string {
  if (!comment.path) {
    return '';
  }

  return comment.line
    ? ` \`${comment.path}:${comment.line}\``
    : ` \`${comment.path}\``;
}

function formatReviewThreadLink(url: string | undefined): string {
  return url ? ` [thread](${url})` : '';
}

function formatResolutionSuffix(
  resolution: AiReviewThreadResolution | undefined,
): string {
  if (!resolution) {
    return '';
  }

  switch (resolution.status) {
    case 'resolved':
      return '; native GitHub thread resolved';
    case 'already_resolved':
      return '; native GitHub thread was already resolved';
    case 'unresolvable':
      return '; native GitHub thread could not be resolved automatically';
    case 'failed':
      return resolution.message
        ? `; native GitHub thread resolution failed: ${summarizeReviewMessage(resolution.message)}`
        : '; native GitHub thread resolution failed';
  }
}

function extractHighlightedReviewText(body: string): string | undefined {
  const boldMatches = [...body.matchAll(/\*\*([^*]+)\*\*/g)];

  for (const match of boldMatches) {
    const candidate = match[1]?.trim();
    if (
      candidate &&
      !candidate.toLowerCase().startsWith('actionable comments posted')
    ) {
      return candidate;
    }
  }

  return undefined;
}

function summarizeReviewerFacingFinding(body: string): string {
  const highlighted = extractHighlightedReviewText(body);
  if (highlighted) {
    return highlighted;
  }

  const firstMeaningfulLine = body
    .split('\n')
    .map((line) => line.trim())
    .find(
      (line) =>
        line.length > 0 &&
        !line.startsWith('```') &&
        !line.startsWith('<') &&
        !line.startsWith('>') &&
        !line.startsWith('<!--'),
    );

  return summarizeReviewComment(firstMeaningfulLine ?? body);
}

function formatReviewFindingBullet(
  comment: AiReviewComment,
  detail?: string,
): string {
  const base = `- [${comment.vendor}] ${summarizeReviewerFacingFinding(comment.body)}`;
  const suffix = detail ? ` (${detail})` : '';
  return `${base}${suffix}${formatReviewCommentLocation(comment)}${formatReviewThreadLink(comment.url)}`;
}

function buildReviewCommentBullet(
  comment: AiReviewComment,
  detail?: string,
): string {
  return formatReviewFindingBullet(comment, detail);
}

function buildReviewCommentBullets(
  comments: AiReviewComment[] | undefined,
  detail?: string,
): string[] {
  if (!comments || comments.length === 0) {
    return [];
  }

  return comments.map((comment) => buildReviewCommentBullet(comment, detail));
}

export function assertReviewerFacingMarkdown(body: string): void {
  const lines = body.split('\n');
  let activeFence: { char: '`' | '~'; length: number } | undefined;
  const sanitizedLines: string[] = [];

  for (const line of lines) {
    const fenceMarker = parseFenceMarker(line);
    if (fenceMarker) {
      if (!activeFence) {
        activeFence = { char: fenceMarker.char, length: fenceMarker.length };
      } else if (
        fenceMarker.char === activeFence.char &&
        fenceMarker.length >= activeFence.length &&
        fenceMarker.trailing.trim().length === 0
      ) {
        activeFence = undefined;
      }
      sanitizedLines.push('');
      continue;
    }

    if (activeFence) {
      sanitizedLines.push('');
      continue;
    }

    sanitizedLines.push(line.replace(/`[^`]*`/g, ''));
  }

  if (activeFence) {
    throw new Error(
      'PR body guard failed: markdown contains an unmatched fenced code block.',
    );
  }

  const sanitizedBody = sanitizedLines.join('\n');
  if (/(^|[^`])\\n(#{1,6}\s|- |\* |\d+\.\s)/.test(sanitizedBody)) {
    throw new Error(
      'PR body guard failed: body contains likely-escaped newline formatting sequences.',
    );
  }

  const malformedHeading = sanitizedLines.find((line) =>
    /^(#{1,6})(?!#)\S/.test(line.trim()),
  );
  if (malformedHeading) {
    throw new Error(
      `PR body guard failed: malformed markdown heading "${malformedHeading.trim()}".`,
    );
  }

  const bannedHeading = sanitizedLines.find((line, index) => {
    const heading = parseMarkdownHeadingAt(sanitizedLines, index);
    return heading ? isBannedPrBodyHeadingTitle(heading.title) : false;
  });
  if (bannedHeading) {
    throw new Error(
      `PR body guard failed: banned section heading "${bannedHeading.trim()}".`,
    );
  }
}

function buildAiReviewDetailLines(input: {
  actionCommits?: ReviewActionCommit[];
  actionSummary?: string;
  comments?: AiReviewComment[];
  currentHeadSha?: string;
  maxWaitMinutes: number;
  nonActionSummary?: string;
  note?: string;
  outcome?: ReviewResult;
  reviewedHeadSha?: string;
  status?: TicketStatus;
  threadResolutions?: AiReviewThreadResolution[];
  vendors?: string[];
}): string[] {
  const lines: string[] = [];
  const reviewStatus = input.outcome ?? input.status;

  if (
    !reviewStatus ||
    (reviewStatus !== 'clean' &&
      reviewStatus !== 'patched' &&
      reviewStatus !== 'needs_patch' &&
      reviewStatus !== 'operator_input_needed')
  ) {
    return lines;
  }

  lines.push(`- outcome: \`${reviewStatus}\``);

  const appliesToCurrentHead =
    !!input.reviewedHeadSha &&
    !!input.currentHeadSha &&
    input.reviewedHeadSha === input.currentHeadSha;

  if (input.reviewedHeadSha) {
    lines.push(`- reviewed commit: \`${shortenSha(input.reviewedHeadSha)}\``);
  }

  if (input.currentHeadSha) {
    lines.push(
      `- current branch head: \`${shortenSha(input.currentHeadSha)}\``,
    );
  }

  if (input.reviewedHeadSha && input.currentHeadSha && !appliesToCurrentHead) {
    lines.push(
      '- the latest recorded external AI review applies to an older branch head; the prior review history is shown below for debugging.',
    );
  }

  if (input.vendors && input.vendors.length > 0) {
    lines.push(
      `- vendors: ${input.vendors.map((vendor) => `\`${vendor}\``).join(', ')}`,
    );
  }

  const effectiveContext =
    input.reviewedHeadSha && input.currentHeadSha && !appliesToCurrentHead
      ? 'history'
      : 'current';
  const currentComments =
    effectiveContext === 'current' ? (input.comments ?? []) : [];
  const currentActionableComments = currentComments.filter(
    (comment) =>
      !comment.isOutdated && !comment.isResolved && comment.kind !== 'summary',
  );
  const currentSummaryNoiseComments = currentComments.filter(
    (comment) =>
      !comment.isOutdated && !comment.isResolved && comment.kind === 'summary',
  );
  const staleOrResolvedComments =
    effectiveContext === 'history'
      ? (input.comments ?? [])
      : (input.comments ?? []).filter(
          (comment) => comment.isOutdated || comment.isResolved,
        );

  const resolutionByThreadId = new Map(
    (input.threadResolutions ?? []).map((resolution) => [
      resolution.threadId,
      resolution,
    ]),
  );
  const resolvedFindingComments = [
    ...(reviewStatus === 'patched' ? currentActionableComments : []),
    ...staleOrResolvedComments,
  ];
  const unresolvedFindingComments =
    reviewStatus === 'needs_patch' || reviewStatus === 'operator_input_needed'
      ? currentActionableComments
      : [];

  if (
    reviewStatus === 'clean' &&
    currentActionableComments.length === 0 &&
    currentSummaryNoiseComments.length === 0 &&
    resolvedFindingComments.length === 0
  ) {
    lines.push('- no prudent follow-up changes were required.');
  }

  const resolvedFindingBullets = resolvedFindingComments.map((comment) => {
    const resolution = comment.threadId
      ? resolutionByThreadId.get(comment.threadId)
      : undefined;
    const detail =
      comment.isResolved || comment.isOutdated || effectiveContext === 'history'
        ? undefined
        : resolution
          ? formatResolutionSuffix(resolution).replace(/^;\s*/, '')
          : reviewStatus === 'patched'
            ? 'patched'
            : undefined;
    return buildReviewCommentBullet(comment, detail);
  });

  const actionCommitBullets = (input.actionCommits ?? []).map((commit) => {
    const vendorTag =
      commit.vendors.length > 0 ? ` [${commit.vendors.join(',')}]` : '';
    return `- \`${shortenSha(commit.sha)}\`${vendorTag} ${commit.subject}`;
  });

  if (actionCommitBullets.length > 0) {
    lines.push('', '### Actions Taken', '', ...actionCommitBullets);
  } else if (resolvedFindingBullets.length > 0) {
    lines.push(
      '',
      '### Resolved Review Findings',
      '',
      ...resolvedFindingBullets,
    );
  }

  const unresolvedFindingBullets = buildReviewCommentBullets(
    unresolvedFindingComments,
  );

  if (unresolvedFindingBullets.length > 0) {
    lines.push(
      '',
      '### Unresolved Review Findings',
      '',
      ...unresolvedFindingBullets,
    );
    if (input.note) {
      lines.push('', `- triage note: ${input.note}`);
    }
    if (input.actionSummary) {
      lines.push(`- triage summary: ${input.actionSummary}`);
    }
  }

  if (input.nonActionSummary) {
    lines.push(
      '',
      '### No-Action Rationale',
      '',
      `- ${input.nonActionSummary}`,
    );
  }

  return lines;
}

export function buildPullRequestBody(
  state: DeliveryState,
  ticket: TicketReviewMetadataRefreshTarget,
  options: {
    actionCommits?: ReviewActionCommit[];
    currentHeadSha?: string;
  } = {},
): string {
  const lines = [
    '## Summary',
    '',
    `- delivery ticket: \`${ticket.id} ${ticket.title}\``,
    `- ticket file: \`${ticket.ticketFile}\``,
    `- stacked base branch: \`${ticket.baseBranch}\``,
  ];

  if (ticket.internalReviewCompletedAt) {
    lines.push(
      `- internal review: completed at \`${ticket.internalReviewCompletedAt}\``,
    );
  }

  if (
    ticket.reviewOutcome ||
    ticket.status === 'needs_patch' ||
    ticket.status === 'operator_input_needed'
  ) {
    lines.push(
      '',
      buildExternalAiReviewSection(
        {
          actionSummary: ticket.reviewActionSummary,
          comments: ticket.reviewComments,
          note: ticket.reviewNote,
          nonActionSummary: ticket.reviewNonActionSummary,
          outcome: ticket.reviewOutcome,
          reviewedHeadSha: ticket.reviewHeadSha,
          status: ticket.status,
          threadResolutions: ticket.reviewThreadResolutions,
          vendors: ticket.reviewVendors,
        },
        {
          actionCommits: options.actionCommits,
          currentHeadSha: options.currentHeadSha,
          incompleteAgents: ticket.reviewIncompleteAgents,
          maxWaitMinutes: state.reviewPollMaxWaitMinutes,
        },
      ),
    );
  }

  return normalizeReviewerFacingPullRequestBody(lines.join('\n'));
}

export function buildReviewMetadataRefreshBody(
  options: ReviewMetadataRefreshBodyOptions,
  context: ReviewMetadataRefreshContext = {},
): string {
  if (options.mode === 'ticketed') {
    return buildPullRequestBody(options.state, options.ticket, context);
  }

  return mergeStandaloneAiReviewSection(
    options.body,
    buildStandaloneAiReviewSection(options.result, context),
  );
}

export function buildPullRequestTitle(
  ticket: Pick<TicketState, 'id' | 'title'>,
  commitSubject?: string,
): string {
  const fallbackSubject = `feat: ${ticket.title.toLowerCase()}`;
  const baseSubject = (commitSubject?.trim() || fallbackSubject).replace(
    /\s+\[[A-Z0-9.]+\]$/,
    '',
  );

  return `${baseSubject} [${ticket.id}]`;
}

function buildTicketStartedEvent(
  state: DeliveryState,
  ticket: Pick<TicketState, 'id' | 'title' | 'branch'>,
): DeliveryNotificationEvent {
  return {
    kind: 'ticket_started',
    planKey: state.planKey,
    ticketId: ticket.id,
    ticketTitle: ticket.title,
    branch: ticket.branch,
  };
}

function buildPrOpenedEvent(
  state: DeliveryState,
  ticket: Pick<TicketState, 'id' | 'title' | 'branch' | 'prUrl'>,
): DeliveryNotificationEvent | undefined {
  if (!ticket.prUrl) {
    return undefined;
  }

  return {
    kind: 'pr_opened',
    planKey: state.planKey,
    ticketId: ticket.id,
    ticketTitle: ticket.title,
    branch: ticket.branch,
    prUrl: ticket.prUrl,
  };
}

function buildReviewRecordedEvent(
  state: DeliveryState,
  ticket: Pick<
    TicketState,
    | 'id'
    | 'title'
    | 'branch'
    | 'reviewOutcome'
    | 'reviewNote'
    | 'prUrl'
    | 'status'
  >,
): DeliveryNotificationEvent | undefined {
  const outcome =
    ticket.reviewOutcome ??
    (ticket.status === 'needs_patch'
      ? 'needs_patch'
      : ticket.status === 'operator_input_needed'
        ? 'operator_input_needed'
        : undefined);

  if (!outcome) {
    return undefined;
  }

  return {
    kind: 'review_recorded',
    planKey: state.planKey,
    ticketId: ticket.id,
    ticketTitle: ticket.title,
    branch: ticket.branch,
    outcome,
    note: ticket.reviewNote,
    prUrl: ticket.prUrl,
  };
}

function buildTicketCompletedEvent(
  state: DeliveryState,
  ticket: Pick<TicketState, 'id' | 'title' | 'branch' | 'prUrl'>,
): DeliveryNotificationEvent {
  return {
    kind: 'ticket_completed',
    planKey: state.planKey,
    ticketId: ticket.id,
    ticketTitle: ticket.title,
    branch: ticket.branch,
    prUrl: ticket.prUrl,
  };
}

function buildReviewWindowReadyEvent(
  state: DeliveryState,
  ticket: Pick<TicketState, 'id' | 'title' | 'branch' | 'prUrl' | 'prOpenedAt'>,
): DeliveryNotificationEvent | undefined {
  if (!ticket.prUrl || !ticket.prOpenedAt) {
    return undefined;
  }

  const openedAt = Date.parse(ticket.prOpenedAt);

  if (Number.isNaN(openedAt)) {
    return undefined;
  }

  return {
    kind: 'review_window_ready',
    planKey: state.planKey,
    ticketId: ticket.id,
    ticketTitle: ticket.title,
    branch: ticket.branch,
    prUrl: ticket.prUrl,
    reviewPollIntervalMinutes: state.reviewPollIntervalMinutes,
    reviewPollMaxWaitMinutes: state.reviewPollMaxWaitMinutes,
    firstCheckAt: new Date(
      openedAt + state.reviewPollIntervalMinutes * 60_000,
    ).toISOString(),
    finalCheckAt: new Date(
      openedAt + state.reviewPollMaxWaitMinutes * 60_000,
    ).toISOString(),
  };
}

function buildRunBlockedEvent(
  planKey: string | undefined,
  command: string | undefined,
  reason: string,
): DeliveryNotificationEvent {
  return {
    kind: 'run_blocked',
    planKey,
    command,
    reason,
  };
}

export function eventsForStartCommand(
  state: DeliveryState,
  ticketId?: string,
): DeliveryNotificationEvent[] {
  const ticket = ticketId
    ? state.tickets.find((candidate) => candidate.id === ticketId)
    : state.tickets.find((candidate) => candidate.status === 'in_progress');

  return ticket ? [buildTicketStartedEvent(state, ticket)] : [];
}

export function eventsForOpenPrCommand(
  state: DeliveryState,
  ticketId?: string,
): DeliveryNotificationEvent[] {
  const ticket = findTicketById(state, ticketId);

  if (!ticket) {
    return [];
  }

  return [
    buildPrOpenedEvent(state, ticket),
    buildReviewWindowReadyEvent(state, ticket),
  ].filter((event): event is DeliveryNotificationEvent => event !== undefined);
}

export function eventsForRecordReviewCommand(
  state: DeliveryState,
  ticketId: string,
): DeliveryNotificationEvent[] {
  const ticket = state.tickets.find((candidate) => candidate.id === ticketId);

  return ticket
    ? [buildReviewRecordedEvent(state, ticket)].filter(
        (event): event is DeliveryNotificationEvent => event !== undefined,
      )
    : [];
}

export function eventsForPollReviewCommand(
  state: DeliveryState,
  ticketId?: string,
): DeliveryNotificationEvent[] {
  const ticket = ticketId
    ? state.tickets.find((candidate) => candidate.id === ticketId)
    : (state.tickets.find((candidate) => candidate.status === 'in_review') ??
      state.tickets.find(
        (candidate) =>
          candidate.status === 'needs_patch' ||
          candidate.status === 'operator_input_needed',
      ) ??
      state.tickets.find(
        (candidate) =>
          candidate.status === 'reviewed' &&
          candidate.reviewOutcome !== undefined,
      ));

  if (
    !ticket ||
    (ticket.status !== 'reviewed' &&
      ticket.status !== 'needs_patch' &&
      ticket.status !== 'operator_input_needed') ||
    (!ticket.reviewOutcome &&
      ticket.status !== 'needs_patch' &&
      ticket.status !== 'operator_input_needed')
  ) {
    return [];
  }

  return [buildReviewRecordedEvent(state, ticket)].filter(
    (event): event is DeliveryNotificationEvent => event !== undefined,
  );
}

function buildStandaloneReviewStartedEvent(
  prNumber: number,
  prUrl: string,
): DeliveryNotificationEvent {
  return {
    kind: 'standalone_review_started',
    prNumber,
    prUrl,
    reviewPollIntervalMinutes: DEFAULT_REVIEW_POLL_INTERVAL_MINUTES,
    reviewPollMaxWaitMinutes: DEFAULT_REVIEW_POLL_MAX_WAIT_MINUTES,
  };
}

function buildStandaloneReviewRecordedEvent(
  result: StandaloneAiReviewResult,
): DeliveryNotificationEvent {
  return {
    kind: 'standalone_review_recorded',
    prNumber: result.prNumber,
    prUrl: result.prUrl,
    outcome: result.outcome,
    note: result.note,
  };
}

export function eventsForAdvanceCommand(
  previousState: DeliveryState,
  nextState: DeliveryState,
): DeliveryNotificationEvent[] {
  const events: DeliveryNotificationEvent[] = [];

  for (const previousTicket of previousState.tickets) {
    const nextTicket = nextState.tickets.find(
      (candidate) => candidate.id === previousTicket.id,
    );

    if (previousTicket.status !== 'done' && nextTicket?.status === 'done') {
      events.push(buildTicketCompletedEvent(nextState, nextTicket));
    }

    if (
      previousTicket.status !== 'in_progress' &&
      nextTicket?.status === 'in_progress'
    ) {
      events.push(buildTicketStartedEvent(nextState, nextTicket));
    }
  }

  return events;
}

export function buildTicketHandoff(
  state: DeliveryState,
  ticket: Pick<
    TicketState,
    'id' | 'title' | 'ticketFile' | 'branch' | 'baseBranch' | 'worktreePath'
  >,
): string {
  const ticketIndex = state.tickets.findIndex(
    (candidate) => candidate.id === ticket.id,
  );
  const previous = ticketIndex > 0 ? state.tickets[ticketIndex - 1] : undefined;
  const requiredReads = [
    'docs/00-overview/start-here.md',
    state.planPath,
    ticket.ticketFile,
    'docs/03-engineering/delivery-orchestrator.md',
  ];
  const lines = [
    '# Ticket Handoff',
    '',
    `Phase plan: ${state.planPath}`,
    `Ticket: ${ticket.id} ${ticket.title}`,
    `Branch: ${ticket.branch}`,
    `Base branch: ${ticket.baseBranch}`,
    `Worktree: ${ticket.worktreePath}`,
    '',
    '## Required Reads',
    '',
    ...requiredReads.map((path) => `- \`${path}\``),
    '',
    '## Context Reset Contract',
    '',
    '- Re-read the required docs before implementing.',
    '- Start from the current repository state and this handoff artifact, not from prior chat assumptions.',
    '- Carry forward only explicit review notes, review artifacts, and committed branch state.',
  ];

  if (previous) {
    lines.push('', '## Carry Forward From Previous Ticket', '');
    lines.push(`- Previous ticket: \`${previous.id} ${previous.title}\``);
    lines.push(`- Previous branch: \`${previous.branch}\``);

    if (previous.prUrl) {
      lines.push(`- Previous PR: ${previous.prUrl}`);
    }

    if (previous.reviewOutcome) {
      lines.push(`- Review outcome: \`${previous.reviewOutcome}\``);
    }

    if (previous.reviewNote) {
      lines.push(`- Review note: ${previous.reviewNote}`);
    }

    if (previous.reviewVendors && previous.reviewVendors.length > 0) {
      lines.push(
        `- Review vendors: ${previous.reviewVendors.map((vendor) => `\`${vendor}\``).join(', ')}`,
      );
    }

    if (previous.reviewArtifactPath) {
      lines.push(`- Review artifact: \`${previous.reviewArtifactPath}\``);
    }

    if (previous.reviewArtifactJsonPath) {
      lines.push(
        `- Review artifact (json): \`${previous.reviewArtifactJsonPath}\``,
      );
    }
  }

  lines.push('', '## Stop Conditions', '');
  lines.push(
    '- Stop if the current ticket cannot be completed safely or prerequisite state is missing.',
  );
  lines.push(
    '- Stop if review triage is ambiguous enough to require user input.',
  );
  lines.push(
    '- Stop if the work requires a broader redesign beyond the ticket scope.',
  );

  return lines.join('\n') + '\n';
}

async function writeTicketHandoff(
  state: DeliveryState,
  cwd: string,
  ticketId: string,
): Promise<{ relativePath: string; generatedAt: string }> {
  const ticket = state.tickets.find((candidate) => candidate.id === ticketId);

  if (!ticket) {
    throw new Error(`Unknown ticket ${ticketId}.`);
  }

  const absolutePath = resolve(
    cwd,
    state.handoffsDirPath,
    `${ticket.id.toLowerCase().replace('.', '-')}-handoff.md`,
  );
  const generatedAt = new Date().toISOString();

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buildTicketHandoff(state, ticket), 'utf8');

  return {
    relativePath: relativeToRepo(cwd, absolutePath),
    generatedAt,
  };
}

function updatePullRequestBody(
  state: DeliveryState,
  ticket: TicketState,
): void {
  if (!ticket.prNumber) {
    return;
  }

  const currentHeadSha = readHeadSha(ticket.worktreePath);
  const body = buildReviewMetadataRefreshBody(
    {
      mode: 'ticketed',
      state,
      ticket,
    },
    {
      actionCommits: listReviewActionCommits(
        ticket.worktreePath,
        ticket.reviewHeadSha,
        currentHeadSha,
        ticket.reviewComments,
        ticket.reviewVendors,
      ),
      currentHeadSha,
    },
  );
  assertReviewerFacingMarkdown(body);

  editPullRequest(ticket.worktreePath, ticket.prNumber, { body });
}

export function buildStandaloneAiReviewSection(
  result: Pick<
    StandaloneAiReviewResult,
    | 'actionSummary'
    | 'artifactJsonPath'
    | 'artifactTextPath'
    | 'comments'
    | 'incompleteAgents'
    | 'note'
    | 'nonActionSummary'
    | 'outcome'
    | 'reviewedHeadSha'
    | 'threadResolutions'
    | 'vendors'
  >,
  options: {
    actionCommits?: ReviewActionCommit[];
    currentHeadSha?: string;
  } = {},
): string {
  const section = buildExternalAiReviewSection(result, {
    actionCommits: options.actionCommits,
    currentHeadSha: options.currentHeadSha,
    incompleteAgents: result.incompleteAgents,
    maxWaitMinutes: DEFAULT_REVIEW_POLL_MAX_WAIT_MINUTES,
  });

  return [
    STANDALONE_AI_REVIEW_SECTION_START,
    section,
    STANDALONE_AI_REVIEW_SECTION_END,
  ].join('\n');
}

export function buildExternalAiReviewSection(
  result: {
    actionSummary?: string;
    comments?: AiReviewComment[];
    note?: string;
    nonActionSummary?: string;
    outcome?: ReviewResult;
    reviewedHeadSha?: string;
    status?: TicketStatus;
    threadResolutions?: AiReviewThreadResolution[];
    vendors?: string[];
  },
  options: {
    actionCommits?: ReviewActionCommit[];
    currentHeadSha?: string;
    incompleteAgents?: string[];
    maxWaitMinutes: number;
  },
): string {
  const lines = ['## External AI Review', ''];
  lines.push(
    ...buildAiReviewDetailLines({
      actionSummary: result.actionSummary,
      actionCommits: options.actionCommits,
      comments: result.comments,
      currentHeadSha: options.currentHeadSha,
      maxWaitMinutes: options.maxWaitMinutes,
      nonActionSummary: result.nonActionSummary,
      note: result.note,
      outcome: result.outcome,
      reviewedHeadSha: result.reviewedHeadSha,
      status: result.status,
      threadResolutions: result.threadResolutions,
      vendors: result.vendors,
    }),
  );

  if (options.incompleteAgents && options.incompleteAgents.length > 0) {
    lines.push(
      `- incomplete agents at timeout: \`${options.incompleteAgents.join(', ')}\``,
    );
  }

  return lines.join('\n');
}

export function mergeStandaloneAiReviewSection(
  body: string,
  section: string,
): string {
  const pattern = new RegExp(
    `${STANDALONE_AI_REVIEW_SECTION_START}[\\s\\S]*?${STANDALONE_AI_REVIEW_SECTION_END}`,
    'g',
  );
  const bodyWithoutAiReviewSections = body.replace(pattern, '').trimEnd();
  const normalizedBody = normalizeReviewerFacingPullRequestBody(
    bodyWithoutAiReviewSections,
    {
      stripExternalAiReviewSections: true,
    },
  ).trimEnd();
  const mergedBody =
    normalizedBody.length > 0
      ? `${normalizedBody}\n\n${section}\n`
      : `${section}\n`;

  return normalizeReviewerFacingPullRequestBody(mergedBody);
}

function updateStandalonePullRequestBody(
  cwd: string,
  pullRequest: StandalonePullRequest,
  result: StandaloneAiReviewResult,
): void {
  const nextBody = buildReviewMetadataRefreshBody(
    {
      body: pullRequest.body,
      mode: 'standalone',
      result,
    },
    {
      actionCommits: listReviewActionCommits(
        cwd,
        result.reviewedHeadSha,
        pullRequest.headRefOid,
        result.comments,
        result.vendors,
      ),
      currentHeadSha: pullRequest.headRefOid,
    },
  );
  assertReviewerFacingMarkdown(nextBody);

  editPullRequest(cwd, pullRequest.number, { body: nextBody });
}

function findOpenPullRequest(
  cwd: string,
  branch: string,
): PullRequestSummary | undefined {
  return findPlatformOpenPullRequest(cwd, branch, _config.runtime);
}

function hasMergedPullRequestForBranch(cwd: string, branch: string): boolean {
  return hasPlatformMergedPullRequestForBranch(cwd, branch, _config.runtime);
}

function readLatestCommitSubject(cwd: string): string {
  return readPlatformLatestCommitSubject(cwd, _config.runtime);
}

function readHeadSha(cwd: string): string {
  return readPlatformHeadSha(cwd, _config.runtime);
}

function readCurrentBranch(cwd: string): string {
  return readPlatformCurrentBranch(cwd, _config.runtime);
}

function ensureCleanWorktree(cwd: string): void {
  ensurePlatformCleanWorktree(cwd, _config.runtime);
}

function ensureBranchPushed(cwd: string, branch: string): void {
  ensurePlatformBranchPushed(cwd, branch, _config.runtime);
}

function addWorktree(
  cwd: string,
  worktreePath: string,
  branch: string,
  baseBranch: string,
): void {
  addPlatformWorktree(cwd, worktreePath, branch, baseBranch, _config.runtime);
}

function createPullRequest(
  cwd: string,
  options: {
    base: string;
    body: string;
    head: string;
    title: string;
  },
): string {
  return createPlatformPullRequest(cwd, options, _config.runtime);
}

function editPullRequest(
  cwd: string,
  prNumber: number,
  options: {
    base?: string;
    body?: string;
    title?: string;
  },
): void {
  editPlatformPullRequest(cwd, prNumber, options, _config.runtime);
}

function resolveReviewThread(worktreePath: string, threadId: string): string {
  return resolvePlatformReviewThread(worktreePath, threadId, _config.runtime);
}

function fetchOrigin(cwd: string): void {
  fetchPlatformOrigin(cwd, _config.runtime);
}

function readMergeBase(
  cwd: string,
  branch: string,
  previousBranch: string,
): string {
  return readPlatformMergeBase(cwd, branch, previousBranch, _config.runtime);
}

function rebaseOnto(cwd: string, rebaseTarget: string, oldBase: string): void {
  rebasePlatformOnto(cwd, rebaseTarget, oldBase, _config.runtime);
}

function rebaseOntoDefaultBranch(cwd: string, defaultBranch: string): void {
  rebasePlatformOntoDefaultBranch(cwd, defaultBranch, _config.runtime);
}

function listCommitSubjectsBetween(
  cwd: string,
  reviewedHeadSha: string,
  currentHeadSha: string,
  maxCount: number,
): string[] {
  return listPlatformCommitSubjectsBetween(
    cwd,
    reviewedHeadSha,
    currentHeadSha,
    maxCount,
    _config.runtime,
  );
}

async function emitNotificationWarnings(
  notifier: DeliveryNotifier,
  cwd: string,
  events: DeliveryNotificationEvent[],
): Promise<void> {
  for (const event of events) {
    const warning = await notifyBestEffort(notifier, cwd, event);

    if (warning) {
      console.warn(warning);
    }
  }
}

export async function notifyBestEffort(
  notifier: DeliveryNotifier,
  cwd: string,
  event: DeliveryNotificationEvent,
): Promise<string | undefined> {
  if (!notifier.enabled) {
    return undefined;
  }

  try {
    await sendTelegramMessage(notifier.botToken, notifier.chatId, {
      ...buildNotificationPayload(cwd, event),
    });
    return undefined;
  } catch (error) {
    return `Notification warning: ${formatError(error)}`;
  }
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  payload: NotificationPayload,
): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: payload.text,
        entities: payload.entities,
        disable_web_page_preview: true,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Telegram sendMessage failed with ${response.status}: ${await response.text()}`,
    );
  }
}

function parsePullRequestNumber(prUrl: string): number {
  const match = prUrl.match(/\/pull\/(\d+)$/);

  if (!match?.[1]) {
    throw new Error(`Could not parse PR number from ${prUrl}.`);
  }

  return Number(match[1]);
}

function runProcess(cwd: string, cmd: string[]): string {
  return runPlatformProcess(cwd, cmd, _config.runtime);
}

export function runProcessResult(
  cwd: string,
  cmd: string[],
): {
  exitCode: number;
  stderr: string;
  stdout: string;
} {
  return runPlatformProcessResult(cwd, cmd, _config.runtime);
}

export function derivePlanKey(planPath: string): string {
  return derivePlanKeyImpl(planPath);
}

function relativeToRepo(cwd: string, absolutePath: string): string {
  return resolve(absolutePath).replace(`${resolve(cwd)}/`, '');
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

async function bootstrapWorktreeIfNeeded(worktreePath: string): Promise<void> {
  await bootstrapPlatformWorktreeIfNeeded(
    worktreePath,
    _config.packageManager,
    _config.runtime,
  );
}

export function formatStatus(state: DeliveryState): string {
  return [
    'Delivery Orchestrator',
    `plan_key=${state.planKey}`,
    `plan=${state.planPath}`,
    `state=${state.statePath}`,
    `handoffs=${state.handoffsDirPath}`,
    `review_poll_interval_minutes=${state.reviewPollIntervalMinutes}`,
    `review_poll_max_wait_minutes=${state.reviewPollMaxWaitMinutes}`,
    '',
    ...state.tickets.map((ticket) =>
      [
        `${ticket.id} | status=${ticket.status} | branch=${ticket.branch} | base=${ticket.baseBranch}`,
        `title=${ticket.title}`,
        `worktree=${ticket.worktreePath}`,
        ticket.handoffPath ? `handoff=${ticket.handoffPath}` : undefined,
        ticket.internalReviewCompletedAt
          ? `internal_review_completed_at=${ticket.internalReviewCompletedAt}`
          : undefined,
        ticket.prUrl ? `pr=${ticket.prUrl}` : undefined,
        ticket.reviewArtifactJsonPath
          ? `review_artifact_json=${ticket.reviewArtifactJsonPath}`
          : undefined,
        ticket.reviewArtifactPath
          ? `review_artifact=${ticket.reviewArtifactPath}`
          : undefined,
        ticket.reviewIncompleteAgents?.length
          ? `review_incomplete_agents=${ticket.reviewIncompleteAgents.join(',')}`
          : undefined,
        ticket.reviewVendors && ticket.reviewVendors.length > 0
          ? `review_vendors=${ticket.reviewVendors.join(',')}`
          : undefined,
        ticket.reviewOutcome
          ? `review_outcome=${ticket.reviewOutcome}`
          : undefined,
        ticket.reviewNote ? `review_note=${ticket.reviewNote}` : undefined,
      ]
        .filter((value): value is string => value !== undefined)
        .join('\n'),
    ),
  ].join('\n');
}

function formatRepairSummary(result: RepairStateResult): string {
  return [
    'State Repair',
    result.hadExistingState
      ? 'Existing state file inspected and rebuilt from repo reality.'
      : 'Created fresh state from repo reality.',
    result.backupPath ? `- backup: ${result.backupPath}` : undefined,
    ...result.changes.map((change) => `- ${change}`),
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}

export function formatNotificationMessage(
  cwd: string,
  event: DeliveryNotificationEvent,
): string {
  const header = 'Son of Anton';
  const standaloneHeader = `Son of Anton PR #${
    event.kind === 'standalone_review_started' ||
    event.kind === 'standalone_review_recorded'
      ? event.prNumber
      : ''
  }`.trim();

  switch (event.kind) {
    case 'ticket_started':
      return [
        header,
        `${event.ticketId} underway for ${event.planKey}.`,
        event.ticketTitle,
        `Branch: ${event.branch}`,
      ].join('\n');
    case 'pr_opened':
      return [
        header,
        `${event.ticketId} is up for review in ${event.planKey}.`,
        event.ticketTitle,
        `Branch: ${event.branch}`,
        `PR: ${event.prUrl}`,
      ].join('\n');
    case 'review_window_ready':
      return [
        header,
        `Review window is open for ${event.ticketId}.`,
        event.ticketTitle,
        `Branch: ${event.branch}`,
        `PR: ${event.prUrl}`,
        `Cadence: every ${event.reviewPollIntervalMinutes} minutes up to ${event.reviewPollMaxWaitMinutes} minutes`,
        `First check: ${event.firstCheckAt}`,
        `Final check: ${event.finalCheckAt}`,
      ].join('\n');
    case 'review_recorded':
      return [
        header,
        `${event.ticketId} review triaged.`,
        event.ticketTitle,
        `Branch: ${event.branch}`,
        `Outcome: ${event.outcome}`,
        event.note ? `Note: ${event.note}` : undefined,
        event.prUrl ? `PR: ${event.prUrl}` : undefined,
      ]
        .filter((line): line is string => line !== undefined)
        .join('\n');
    case 'ticket_completed':
      return [
        header,
        `${event.ticketId} cleared.`,
        event.ticketTitle,
        `Branch: ${event.branch}`,
        event.prUrl ? `PR: ${event.prUrl}` : undefined,
      ]
        .filter((line): line is string => line !== undefined)
        .join('\n');
    case 'standalone_review_started':
      return [standaloneHeader, 'AI review started.'].join('\n');
    case 'standalone_review_recorded':
      return [
        standaloneHeader,
        'AI review complete.',
        `Outcome: ${event.outcome}`,
        event.note ? `Note: ${event.note}` : undefined,
      ]
        .filter((line): line is string => line !== undefined)
        .join('\n');
    case 'run_blocked':
      return [
        header,
        `Stopped${event.planKey ? ` in ${event.planKey}` : ''}.`,
        event.command ? `Command: ${event.command}` : undefined,
        `Reason: ${event.reason}`,
      ]
        .filter((line): line is string => line !== undefined)
        .join('\n');
  }
}

function buildNotificationPayload(
  cwd: string,
  event: DeliveryNotificationEvent,
): NotificationPayload {
  const text = formatNotificationMessage(cwd, event);

  if (
    event.kind !== 'standalone_review_started' &&
    event.kind !== 'standalone_review_recorded'
  ) {
    return { text };
  }

  const linkLabel = `PR #${event.prNumber}`;
  const offset = text.indexOf(linkLabel);

  if (offset === -1) {
    return { text };
  }

  return {
    text,
    entities: [
      {
        type: 'text_link',
        offset,
        length: linkLabel.length,
        url: event.prUrl,
      },
    ],
  };
}

function formatNoAiReviewFeedbackNote(maxWaitMinutes: number): string {
  return `No AI review feedback was detected within the ${maxWaitMinutes}-minute polling window.`;
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

export function formatReviewWindowMessage(
  state: DeliveryState,
  ticketId?: string,
): string {
  const ticket = findTicketById(state, ticketId);

  if (!ticket?.prUrl || !ticket.prOpenedAt) {
    return '';
  }

  const openedAt = Date.parse(ticket.prOpenedAt);

  if (Number.isNaN(openedAt)) {
    return '';
  }

  const checks = buildReviewPollCheckMinutes(
    state.reviewPollIntervalMinutes,
    state.reviewPollMaxWaitMinutes,
  );
  const firstCheckAt = new Date(
    openedAt + state.reviewPollIntervalMinutes * 60_000,
  ).toISOString();
  const finalCheckAt = new Date(
    openedAt + state.reviewPollMaxWaitMinutes * 60_000,
  ).toISOString();

  return [
    'AI Review Window',
    `- polling cadence: every ${state.reviewPollIntervalMinutes} minutes up to ${state.reviewPollMaxWaitMinutes} minutes`,
    `- checks at: ${checks.join(', ')} minutes after PR open`,
    `- first check at: ${firstCheckAt}`,
    `- final check at: ${finalCheckAt}`,
    `- if an AI review agent is still clearly in progress at ${state.reviewPollMaxWaitMinutes} minutes, the orchestrator performs one final check at ${computeExtendedReviewPollMaxWaitMinutes(state.reviewPollIntervalMinutes, state.reviewPollMaxWaitMinutes)} minutes`,
    '- if no actionable `ai-code-review` findings are captured by the final applicable check, the orchestrator records `clean` and continues',
  ].join('\n');
}

function formatStandaloneAiReviewResult(
  result: StandaloneAiReviewResult,
): string {
  return [
    'Standalone AI Review',
    `pr=${result.prUrl}`,
    `outcome=${result.outcome}`,
    result.incompleteAgents?.length
      ? `incomplete_agents=${result.incompleteAgents.join(',')}`
      : undefined,
    result.vendors.length > 0
      ? `vendors=${result.vendors.join(',')}`
      : undefined,
    result.artifactJsonPath
      ? `artifact_json=${result.artifactJsonPath}`
      : undefined,
    result.artifactTextPath
      ? `artifact_text=${result.artifactTextPath}`
      : undefined,
    result.actionSummary ? `action_summary=${result.actionSummary}` : undefined,
    result.nonActionSummary
      ? `non_action_summary=${result.nonActionSummary}`
      : undefined,
    `note=${result.note}`,
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
