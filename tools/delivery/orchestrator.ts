import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { getUsage, parseCliArgs, resolveOptionsForCommand } from './cli';
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
  replyToReviewComment as replyPlatformToReviewComment,
  resolveGitHubRepo as resolvePlatformGitHubRepo,
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
  buildRunBlockedEvent,
  buildStandaloneReviewRecordedEvent,
  emitNotificationWarnings,
  eventsForAdvanceCommand,
  eventsForOpenPrCommand,
  eventsForPollReviewCommand,
  eventsForRecordReviewCommand,
  eventsForStartCommand,
  formatNotificationMessage,
  formatReviewWindowMessage,
  notifyBestEffort,
  resolveNotifier,
  type DeliveryNotifier,
} from './notifications';
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
import {
  advanceToNextTicket,
  buildTicketHandoff,
  canAdvanceTicket,
  findNextPendingTicket,
  findTicketByBranch,
  openPullRequest as openPullRequestImpl,
  recordPostVerifySelfAudit as recordPostVerifySelfAuditImpl,
  restackTicket as restackTicketImpl,
  startTicket as startTicketImpl,
} from './ticket-flow';

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
export {
  type AiReviewLifecycleHooks,
  DEFAULT_REVIEW_POLLING_PROFILE,
  type PollForAiReviewResult,
  type ReviewPollingProfile,
  computeExtendedReviewPollMaxWaitMinutes,
  pollForAiReview,
  resolveDeliveryReviewPollingProfile,
  runAiReviewLifecycleWithAdapters,
} from './review';
export {
  buildTicketHandoff,
  canAdvanceTicket,
  eventsForAdvanceCommand,
  eventsForOpenPrCommand,
  eventsForPollReviewCommand,
  eventsForRecordReviewCommand,
  eventsForStartCommand,
  findNextPendingTicket,
  findTicketByBranch,
  formatNotificationMessage,
  formatReviewWindowMessage,
  notifyBestEffort,
  resolveNotifier,
};

export type TicketStatus =
  | 'pending'
  | 'in_progress'
  | 'post_verify_self_audit_complete'
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
  postVerifySelfAuditCompletedAt?: string;
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
  databaseId?: number;
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
    const usage = getUsage(
      generateRunDeliverInvocation(_config.packageManager),
    );
    parsed = parseCliArgs(argv, usage);
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
    const options = await resolveOptionsForCommand({
      command: parsed.command,
      createOptions,
      cwd,
      inferPlanPathFromBranch,
      planPath: parsed.planPath,
      readCurrentBranch,
    });
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
      case 'post-verify-self-audit':
      case 'internal-review': {
        if (parsed.command === 'internal-review') {
          console.error(
            'Note: `internal-review` is deprecated; use `post-verify-self-audit`.',
          );
        }
        const nextState = await recordPostVerifySelfAudit(
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
        const nextState = await advanceToNextTicketImpl(state, cwd, startNext);
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
        console.error(usage);
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

export function createOptions(input: {
  planPath?: string;
}): OrchestratorOptions {
  return createOptionsImpl(input);
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
  return startTicketImpl(state, cwd, ticketId, {
    addWorktree,
    bootstrapWorktreeIfNeeded,
    copyLocalEnvIfPresent,
    relativeToRepo,
  });
}

export async function copyLocalEnvIfPresent(
  sourceWorktreePath: string,
  targetWorktreePath: string,
): Promise<void> {
  await copyPlatformEnvIfPresent(sourceWorktreePath, targetWorktreePath);
}

export async function recordPostVerifySelfAudit(
  state: DeliveryState,
  ticketId?: string,
): Promise<DeliveryState> {
  return recordPostVerifySelfAuditImpl(state, ticketId);
}

/** @deprecated Use `recordPostVerifySelfAudit`. */
export async function recordInternalReview(
  state: DeliveryState,
  ticketId?: string,
): Promise<DeliveryState> {
  return recordPostVerifySelfAuditImpl(state, ticketId);
}

export async function openPullRequest(
  state: DeliveryState,
  cwd: string,
  ticketId?: string,
): Promise<DeliveryState> {
  return openPullRequestImpl(state, cwd, ticketId, {
    assertReviewerFacingMarkdown,
    buildPullRequestBody,
    buildPullRequestTitle,
    createPullRequest,
    editPullRequest,
    ensureBranchPushed,
    findOpenPullRequest,
    parsePullRequestNumber,
    readLatestCommitSubject,
    resolveGitHubRepo: resolveGitHubRepoForOrchestrator,
  });
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
    replyToReviewThread:
      dependencies.replyToReviewThread ?? replyToReviewThreadForOrchestrator,
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
    replyToReviewThread:
      dependencies.replyToReviewThread ?? replyToReviewThreadForOrchestrator,
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
    replyToReviewThread:
      dependencies.replyToReviewThread ?? replyToReviewThreadForOrchestrator,
    resolveReviewFetcher,
    resolveReviewThread,
    resolveReviewTriager,
    runProcess,
    updatePullRequestBody:
      dependencies.updatePullRequestBody ?? updatePullRequestBody,
  });
}

async function advanceToNextTicketImpl(
  state: DeliveryState,
  cwd: string,
  startNext: boolean,
): Promise<DeliveryState> {
  return advanceToNextTicket(state, cwd, startNext, {
    startTicket,
    updatePullRequestBody,
  });
}

async function restackTicket(
  state: DeliveryState,
  cwd: string,
  ticketId?: string,
): Promise<DeliveryState> {
  return restackTicketImpl(state, cwd, ticketId, {
    buildPullRequestBody,
    defaultBranch: _config.defaultBranch,
    editPullRequest,
    ensureCleanWorktree,
    fetchOrigin,
    findOpenPullRequest,
    hasMergedPullRequestForBranch,
    readCurrentBranch,
    readMergeBase,
    rebaseOnto,
    rebaseOntoDefaultBranch,
    resolveGitHubRepo: resolveGitHubRepoForOrchestrator,
  });
}

function preferDeliveryBranch(branches: string[]): string {
  return (
    branches.find((branch) => branch.startsWith('agents/')) ?? branches[0]!
  );
}

function updatePullRequestBody(
  state: DeliveryState,
  ticket: TicketState,
): void {
  return updatePrMetadataPullRequestBody(state, ticket, {
    editPullRequest,
    listCommitSubjectsBetween,
    readHeadSha,
    resolveGitHubRepo: resolveGitHubRepoForOrchestrator,
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
    resolveGitHubRepo: resolveGitHubRepoForOrchestrator,
  });
}

function resolveGitHubRepoForOrchestrator(cwd: string) {
  return resolvePlatformGitHubRepo(cwd, _config.runtime);
}

const REPO_CACHE_BY_WORKTREE = new Map<
  string,
  ReturnType<typeof resolveGitHubRepoForOrchestrator>
>();

function replyToReviewThreadForOrchestrator(
  worktreePath: string,
  databaseId: number,
  body: string,
): void {
  const cached = REPO_CACHE_BY_WORKTREE.get(worktreePath);
  const repo =
    cached ?? resolvePlatformGitHubRepo(worktreePath, _config.runtime);
  if (!cached) {
    REPO_CACHE_BY_WORKTREE.set(worktreePath, repo);
  }
  if (!repo) {
    return;
  }

  try {
    replyPlatformToReviewComment(
      worktreePath,
      repo.owner,
      repo.name,
      databaseId,
      body,
      _config.runtime,
    );
  } catch {
    // Best-effort; thread resolution still proceeds.
  }
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
        ticket.postVerifySelfAuditCompletedAt
          ? `post_verify_self_audit_completed_at=${ticket.postVerifySelfAuditCompletedAt}`
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
