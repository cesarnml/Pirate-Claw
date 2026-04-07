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
import {
  assertReviewerFacingMarkdown,
  buildExternalAiReviewSection,
  buildPullRequestBody,
  buildPullRequestTitle,
  buildReviewMetadataRefreshBody,
  buildStandaloneAiReviewSection,
  buildStandaloneReviewStartedEvent,
  mergeStandaloneAiReviewSection,
  updatePullRequestBody as updatePrMetadataPullRequestBody,
  updateStandalonePullRequestBody as updateStandalonePrMetadataPullRequestBody,
} from './pr-metadata';
import {
  buildReviewPollCheckMinutes,
  parseAiReviewFetcherOutput,
  parseAiReviewTriagerOutput,
  parseResolveReviewThreadOutput,
  recordTicketReview,
  resolveReviewPollWindowStart,
  runStandaloneAiReviewLifecycle,
  runTicketReviewLifecycle,
  type StandaloneAiReviewDependencies,
  type TicketReviewDependencies,
} from './review';

export { parseGitWorktreeList } from './platform';
export {
  assertReviewerFacingMarkdown,
  buildExternalAiReviewSection,
  buildPullRequestBody,
  buildPullRequestTitle,
  buildReviewPollCheckMinutes,
  buildReviewMetadataRefreshBody,
  buildStandaloneAiReviewSection,
  mergeStandaloneAiReviewSection,
  parseAiReviewFetcherOutput,
  parseAiReviewTriagerOutput,
  parseResolveReviewThreadOutput,
  resolveReviewPollWindowStart,
};

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

export type AiReviewAgentState = 'started' | 'completed' | 'findings_detected';

export type AiReviewAgentResult = {
  agent: string;
  state: AiReviewAgentState;
  findingsCount?: number;
  note?: string;
};

export type AiReviewCommentChannel =
  | 'issue_comment'
  | 'review_summary'
  | 'inline_review';

export type AiReviewCommentKind = 'summary' | 'finding' | 'unknown';

export type AiReviewComment = {
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

export type AiReviewThreadResolutionStatus =
  | 'resolved'
  | 'already_resolved'
  | 'failed'
  | 'unresolvable';

export type AiReviewThreadResolution = {
  message?: string;
  status: AiReviewThreadResolutionStatus;
  threadId: string;
  url?: string;
  vendor: string;
};

export type AiReviewFetcherResult = {
  agents: AiReviewAgentResult[];
  artifactText: string;
  comments: AiReviewComment[];
  detected: boolean;
  reviewedHeadSha?: string;
  vendors: string[];
};

export type AiReviewTriagerResult = {
  actionSummary?: string;
  note: string;
  nonActionSummary?: string;
  outcome: ReviewResult;
  vendors: string[];
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

export type StandalonePullRequest = {
  body: string;
  createdAt: string;
  headRefName: string;
  headRefOid: string;
  number: number;
  title: string;
  url: string;
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
  const body = buildPullRequestBody(state, target);
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

export async function pollReview(
  state: DeliveryState,
  cwd: string,
  ticketId?: string,
  dependencies: Partial<TicketReviewDependencies> = {},
): Promise<DeliveryState> {
  return runTicketReviewLifecycle(state, cwd, ticketId, {
    ...dependencies,
    relativeToRepo,
    resolveReviewFetcher,
    resolveReviewThread,
    resolveReviewTriager,
    runProcess,
    updatePullRequestBody:
      dependencies.updatePullRequestBody ?? updatePullRequestBody,
  });
}

export async function runStandaloneAiReview(
  cwd: string,
  notifier: DeliveryNotifier,
  prNumber?: number,
  dependencies: Partial<StandaloneAiReviewDependencies> = {},
): Promise<StandaloneAiReviewResult> {
  const pullRequest =
    dependencies.pullRequest ?? resolveStandalonePullRequest(cwd, prNumber);

  await emitNotificationWarnings(notifier, cwd, [
    buildStandaloneReviewStartedEvent(pullRequest.number, pullRequest.url),
  ]);

  return runStandaloneAiReviewLifecycle(cwd, prNumber, {
    ...dependencies,
    pullRequest,
    relativeToRepo,
    resolveReviewFetcher,
    resolveReviewThread,
    resolveReviewTriager,
    resolveStandalonePullRequest,
    runProcess,
    updatePullRequestBody:
      dependencies.updatePullRequestBody ?? updateStandalonePullRequestBody,
  });
}

export async function recordReview(
  state: DeliveryState,
  cwd: string,
  ticketId: string,
  outcome: ReviewResult,
  note?: string,
  dependencies: Partial<TicketReviewDependencies> = {},
): Promise<DeliveryState> {
  return recordTicketReview(state, cwd, ticketId, outcome, note, {
    ...dependencies,
    relativeToRepo,
    resolveReviewFetcher,
    resolveReviewThread,
    resolveReviewTriager,
    runProcess,
    updatePullRequestBody:
      dependencies.updatePullRequestBody ?? updatePullRequestBody,
  });
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
    editPullRequest(cwd, pullRequest.number, {
      base: nextBaseBranch,
      body: buildPullRequestBody(nextState, updatedTarget),
    });
  }

  return nextState;
}

function preferDeliveryBranch(branches: string[]): string {
  return (
    branches.find((branch) => branch.startsWith('agents/')) ?? branches[0]!
  );
}

function computeExtendedReviewPollMaxWaitMinutes(
  intervalMinutes: number,
  maxWaitMinutes: number,
): number {
  return maxWaitMinutes + intervalMinutes;
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
  return updatePrMetadataPullRequestBody(state, ticket, {
    editPullRequest,
    listCommitSubjectsBetween,
    readHeadSha,
  });
}

function updateStandalonePullRequestBody(
  cwd: string,
  pullRequest: StandalonePullRequest,
  result: StandaloneAiReviewResult,
): void {
  return updateStandalonePrMetadataPullRequestBody(cwd, pullRequest, result, {
    editPullRequest,
    listCommitSubjectsBetween,
  });
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
