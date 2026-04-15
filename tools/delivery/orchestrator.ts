import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { getUsage, parseCliArgs, resolveOptionsForCommand } from './cli';
import {
  loadOrchestratorConfig as loadOrchestratorConfigImpl,
  resolveOrchestratorConfig as resolveOrchestratorConfigImpl,
  type OrchestratorConfig,
  type ReviewPolicyStageValue,
  type ResolvedOrchestratorConfig,
  type TicketBoundaryMode,
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
  isLocalBranchDocOnly as isPlatformLocalBranchDocOnly,
  listCommitSubjectsBetween as listPlatformCommitSubjectsBetween,
  readCommitSubject as readPlatformCommitSubject,
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
  type Runtime,
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
  syncStateFromExisting as syncStateFromExistingImpl,
  syncStateFromScratch as syncStateFromScratchImpl,
} from './state';
import {
  buildRunBlockedEvent,
  buildStandaloneReviewRecordedEvent,
  emitNotificationWarnings,
  eventsForAdvanceCommand,
  eventsForOpenPrCommand,
  eventsForPollReviewCommand,
  eventsForReconcileLateReviewCommand,
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
import { readReviewArtifacts } from './review-artifacts';
import {
  buildReviewPollCheckMinutes,
  parseAiReviewFetcherOutput,
  parseAiReviewTriagerOutput,
  parseResolveReviewThreadOutput,
  recordTicketReview,
  resolveReviewPollWindowStart,
  runReconcileLateTicketReview,
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
  recordCodexPreflight as recordCodexPreflightImpl,
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
  RECONCILE_REVIEW_POLLING_PROFILE,
  type PollForAiReviewResult,
  type ReviewPollingProfile,
  computeExtendedReviewPollMaxWaitMinutes,
  pollForAiReview,
  resolveDeliveryReviewPollingProfile,
  runAiReviewLifecycleWithAdapters,
  runReconcileLateTicketReview,
} from './review';
export {
  buildTicketHandoff,
  canAdvanceTicket,
  eventsForAdvanceCommand,
  eventsForOpenPrCommand,
  eventsForPollReviewCommand,
  eventsForReconcileLateReviewCommand,
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
  | 'codex_preflight_complete'
  | 'in_review'
  | 'needs_patch'
  | 'operator_input_needed'
  | 'reviewed'
  | 'done';

export type ReviewOutcome = 'clean' | 'patched' | 'skipped';
export type ReviewResult =
  | ReviewOutcome
  | 'needs_patch'
  | 'operator_input_needed';

export type CodexPreflightOutcome = 'clean' | 'patched' | 'skipped';

export type InternalReviewPatchCommit = {
  sha: string;
  subject: string;
};

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
  selfAuditOutcome?: ReviewOutcome;
  selfAuditPatchCommits?: InternalReviewPatchCommit[];
  codexPreflightOutcome?: CodexPreflightOutcome;
  codexPreflightCompletedAt?: string;
  codexPreflightPatchCommits?: InternalReviewPatchCommit[];
  docOnly?: boolean;
  prNumber?: number;
  prUrl?: string;
  prOpenedAt?: string;
  reviewFetchArtifactPath?: string;
  reviewTriageArtifactPath?: string;
  reviewHeadSha?: string;
  reviewRecordedAt?: string;
  reviewOutcome?: ReviewResult;
  // Legacy compatibility fields: current write paths do not persist these.
  reviewArtifactJsonPath?: string;
  reviewArtifactPath?: string;
  reviewActionSummary?: string;
  reviewComments?: AiReviewComment[];
  reviewIncompleteAgents?: string[];
  reviewNonActionSummary?: string;
  reviewNote?: string;
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

export type {
  ResolvedReviewPolicy,
  ReviewPolicy,
  ReviewPolicyStageValue,
} from './config';

let _config: ResolvedOrchestratorConfig = {
  defaultBranch: 'main',
  planRoot: 'docs',
  runtime: 'bun',
  packageManager: 'npm',
  ticketBoundaryMode: 'cook',
  reviewPolicy: {
    selfAudit: 'skip_doc_only',
    codexPreflight: 'skip_doc_only',
    externalReview: 'skip_doc_only',
  },
};

export function initOrchestratorConfig(
  config: Omit<ResolvedOrchestratorConfig, 'reviewPolicy'> & {
    reviewPolicy?: ResolvedOrchestratorConfig['reviewPolicy'];
  },
): void {
  _config = {
    ..._config,
    ...config,
    reviewPolicy: config.reviewPolicy ?? {
      selfAudit: 'skip_doc_only',
      codexPreflight: 'skip_doc_only',
      externalReview: 'skip_doc_only',
    },
  };
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

export {
  inferPackageManager,
  VALID_REVIEW_POLICY_STAGE_VALUES,
} from './config';

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
  // Legacy compatibility field: not populated by the current fetcher contract.
  artifactText?: string;
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
  fetchArtifactPath?: string;
  note: string;
  outcome: ReviewResult;
  prNumber: number;
  prUrl: string;
  reviewedHeadSha?: string;
  recordedAt?: string;
  triageArtifactPath?: string;
  // Legacy compatibility fields: current write paths do not persist these.
  actionSummary?: string;
  artifactJsonPath?: string;
  artifactTextPath?: string;
  comments?: AiReviewComment[];
  incompleteAgents?: string[];
  nonActionSummary?: string;
  threadResolutions?: AiReviewThreadResolution[];
  vendors?: string[];
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
        boundaryMode?: TicketBoundaryMode;
      }
    | undefined;

  try {
    const rawConfig = await loadOrchestratorConfig(cwd);
    await ensureEnvReady(cwd);
    const usage = getUsage(
      generateRunDeliverInvocation(
        resolveOrchestratorConfig(rawConfig, cwd).packageManager,
      ),
    );
    parsed = parseCliArgs(argv, usage);
    _config = resolveOrchestratorConfig(
      {
        ...rawConfig,
        ticketBoundaryMode: parsed.boundaryMode ?? rawConfig.ticketBoundaryMode,
      },
      cwd,
    );
    const notifier = resolveNotifier();
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
        const { auditOutcome, auditTicketId, auditPatchCommitArgs } =
          parseSelfAuditArgs(parsed.positionals);
        if (auditOutcome !== 'patched' && auditPatchCommitArgs.length > 0) {
          throw new Error(
            'Self-audit patch commits are only allowed when outcome is `patched`.',
          );
        }
        const auditPatchCommits =
          auditOutcome === 'patched'
            ? resolveInternalReviewPatchCommits(
                (
                  state.tickets.find((ticket) => ticket.id === auditTicketId) ??
                  state.tickets.find(
                    (ticket) => ticket.status === 'in_progress',
                  ) ??
                  state.tickets[0]
                )?.worktreePath ?? cwd,
                auditPatchCommitArgs,
                '[self-audit]',
                'Self-audit',
              )
            : undefined;
        const nextState = await recordPostVerifySelfAudit(
          state,
          auditTicketId,
          auditOutcome,
          {},
          auditPatchCommits,
        );
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState));
        return 0;
      }
      case 'codex-preflight': {
        const preflightPositional = parsed.positionals[0];
        const preflightOutcome =
          preflightPositional === 'clean' || preflightPositional === 'patched'
            ? preflightPositional
            : undefined;
        const preflightTarget = state.tickets.find(
          (t) => t.status === 'post_verify_self_audit_complete',
        );
        const isDocOnly = preflightTarget
          ? isPlatformLocalBranchDocOnly(
              preflightTarget.worktreePath,
              preflightTarget.baseBranch,
              _config.runtime,
            )
          : false;
        if (preflightOutcome !== 'patched' && parsed.positionals.length > 1) {
          throw new Error(
            'Codex preflight patch commits are only allowed when outcome is `patched`.',
          );
        }
        const nextState = recordCodexPreflight(
          state,
          preflightOutcome,
          isDocOnly,
          _config.reviewPolicy.codexPreflight,
          preflightOutcome === 'patched'
            ? resolveInternalReviewPatchCommits(
                preflightTarget?.worktreePath ?? cwd,
                parsed.positionals.slice(1),
                '[codexPreflight]',
                'Codex preflight',
              )
            : undefined,
        );
        const justRecordedPreflight = nextState.tickets.find(
          (t) =>
            t.status === 'codex_preflight_complete' &&
            state.tickets.find((prev) => prev.id === t.id)?.status ===
              'post_verify_self_audit_complete',
        );
        if (justRecordedPreflight?.codexPreflightOutcome === 'skipped') {
          console.log('Doc-only ticket — Codex preflight auto-skipped.');
        }
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
        const pollTicketId = parsed.positionals[0];
        const pollTarget = pollTicketId
          ? state.tickets.find((t) => t.id === pollTicketId)
          : state.tickets.find((t) => t.status === 'in_review');

        if (
          pollTarget &&
          shouldAutoRecordCleanForPollReview(
            _config.reviewPolicy.externalReview,
            pollTarget,
          )
        ) {
          const skipNote =
            _config.reviewPolicy.externalReview === 'disabled'
              ? 'external AI review disabled by policy'
              : 'doc-only PR; external AI review skipped by policy';
          console.log(
            _config.reviewPolicy.externalReview === 'disabled'
              ? `externalReview=disabled for ${pollTarget.id}: skipping AI review window, recording clean`
              : `doc_only=true for ${pollTarget.id} under externalReview=skip_doc_only: skipping AI review window, recording clean`,
          );
          const docOnlyState = await recordReview(
            state,
            cwd,
            pollTarget.id,
            'clean',
            skipNote,
          );
          await saveState(cwd, docOnlyState);
          console.log(formatCurrentTicketStatus(docOnlyState, pollTicketId));
          await emitNotificationWarnings(
            notifier,
            cwd,
            eventsForPollReviewCommand(docOnlyState, pollTicketId),
          );
          return 0;
        }

        const nextState = await pollReview(state, cwd, pollTicketId);
        await saveState(cwd, nextState);
        console.log(formatCurrentTicketStatus(nextState, pollTicketId));
        await emitNotificationWarnings(
          notifier,
          cwd,
          eventsForPollReviewCommand(nextState, pollTicketId),
        );
        return 0;
      }
      case 'reconcile-late-review': {
        const ticketId = parsed.positionals[0];

        if (!ticketId) {
          throw new Error(
            `Usage: ${generateRunDeliverInvocation(_config.packageManager)} --plan <plan-path> reconcile-late-review <ticket-id>`,
          );
        }

        const nextState = await reconcileLateReview(state, cwd, ticketId);
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState));
        await emitNotificationWarnings(
          notifier,
          cwd,
          eventsForReconcileLateReviewCommand(nextState, ticketId),
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
        const advancedState = await advanceToNextTicketImpl(state, cwd);
        const nextState = await applyAdvanceBoundaryMode(
          state,
          advancedState,
          cwd,
        );
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState));
        const boundaryGuidance = formatAdvanceBoundaryGuidance(
          state,
          advancedState,
          nextState,
        );

        if (boundaryGuidance) {
          console.log('');
          console.log(boundaryGuidance);
        }

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

export function syncStateFromScratch(
  ticketDefinitions: TicketDefinition[],
  cwd: string,
  options: OrchestratorOptions,
  inferred?: DeliveryState,
): DeliveryState {
  return syncStateFromScratchImpl(ticketDefinitions, options, inferred, {
    cwd,
    defaultBranch: _config.defaultBranch,
    deriveBranchName,
    deriveWorktreePath,
  });
}

export function syncStateFromExisting(
  existing: DeliveryState,
  ticketDefinitions: TicketDefinition[],
  cwd: string,
  options: OrchestratorOptions,
  inferred?: DeliveryState,
): DeliveryState {
  return syncStateFromExistingImpl(
    existing,
    ticketDefinitions,
    options,
    inferred,
    {
      cwd,
      defaultBranch: _config.defaultBranch,
      deriveBranchName,
      deriveWorktreePath,
    },
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
  outcome?: ReviewOutcome,
  dependencies: {
    isLocalBranchDocOnly?: (
      cwd: string,
      baseBranch: string,
      runtime: Runtime,
    ) => boolean;
    selfAuditPolicy?: ReviewPolicyStageValue;
  } = {},
  patchCommits?: InternalReviewPatchCommit[],
): Promise<DeliveryState> {
  const target =
    (ticketId
      ? state.tickets.find((ticket) => ticket.id === ticketId)
      : state.tickets.find((ticket) => ticket.status === 'in_progress')) ??
    undefined;
  const selfAuditPolicy =
    dependencies.selfAuditPolicy ?? _config.reviewPolicy.selfAudit;
  const isDocOnly =
    target &&
    selfAuditPolicy !== 'disabled' &&
    (dependencies.isLocalBranchDocOnly ?? isPlatformLocalBranchDocOnly)(
      target.worktreePath,
      target.baseBranch,
      _config.runtime,
    );

  if (selfAuditPolicy === 'skip_doc_only' && isDocOnly) {
    return recordPostVerifySelfAuditImpl(state, ticketId, 'skipped', undefined);
  }

  if (selfAuditPolicy === 'required' && isDocOnly && outcome === undefined) {
    throw new Error(
      `Ticket ${target.id} requires an explicit self-audit outcome. Pass \`clean\` or \`patched\`.`,
    );
  }

  return recordPostVerifySelfAuditImpl(state, ticketId, outcome, patchCommits);
}

/** @deprecated Use `recordPostVerifySelfAudit`. */
export async function recordInternalReview(
  state: DeliveryState,
  ticketId?: string,
): Promise<DeliveryState> {
  return recordPostVerifySelfAudit(state, ticketId);
}

export function recordCodexPreflight(
  state: DeliveryState,
  outcome?: 'clean' | 'patched',
  isDocOnly?: boolean,
  policy: ReviewPolicyStageValue = _config.reviewPolicy.codexPreflight,
  patchCommits?: InternalReviewPatchCommit[],
): DeliveryState {
  return recordCodexPreflightImpl(
    state,
    outcome,
    isDocOnly,
    policy,
    patchCommits,
  );
}

export function shouldAutoRecordCleanForPollReview(
  policy: ReviewPolicyStageValue,
  ticket?: Pick<TicketState, 'docOnly'>,
): boolean {
  return (
    policy === 'disabled' ||
    (policy === 'skip_doc_only' && ticket?.docOnly === true)
  );
}

function normalizeUniquePatchCommitShas(rawShas: string[]): string[] {
  return [...new Set(rawShas.map((sha) => sha.trim()).filter(Boolean))];
}

function parseSelfAuditArgs(positionals: string[]): {
  auditOutcome?: ReviewOutcome;
  auditPatchCommitArgs: string[];
  auditTicketId?: string;
} {
  const positional0 = positionals[0];
  const positional1 = positionals[1];
  const auditOutcome: ReviewOutcome | undefined =
    positional0 === 'clean' || positional0 === 'patched'
      ? positional0
      : positional1 === 'clean' || positional1 === 'patched'
        ? positional1
        : undefined;
  const auditTicketId =
    positional0 !== 'clean' && positional0 !== 'patched'
      ? positional0
      : undefined;
  const auditPatchCommitArgs = auditTicketId
    ? positionals.slice(2)
    : positionals.slice(1);
  return { auditOutcome, auditTicketId, auditPatchCommitArgs };
}

function resolveInternalReviewPatchCommits(
  cwd: string,
  rawShas: string[],
  suffix: '[self-audit]' | '[codexPreflight]',
  stageLabel: string,
): InternalReviewPatchCommit[] {
  return normalizeUniquePatchCommitShas(rawShas).map((sha) => {
    const subject = readCommitSubject(cwd, sha);
    if (!subject.endsWith(` ${suffix}`)) {
      throw new Error(
        `${stageLabel} patch commit ${sha.slice(0, 12)} must end with " ${suffix}" (note the space).`,
      );
    }
    return { sha, subject };
  });
}

export async function openPullRequest(
  state: DeliveryState,
  cwd: string,
  ticketId?: string,
): Promise<DeliveryState> {
  const nextState = openPullRequestImpl(state, cwd, ticketId, {
    assertReviewerFacingMarkdown,
    buildPullRequestBody,
    buildPullRequestTitle,
    codexPreflightPolicy: _config.reviewPolicy.codexPreflight,
    createPullRequest,
    editPullRequest,
    ensureBranchPushed,
    findOpenPullRequest,
    parsePullRequestNumber,
    readLatestCommitSubject,
    resolveGitHubRepo: resolveGitHubRepoForOrchestrator,
  });

  // Detect doc-only PRs to skip the external AI review window.
  // Recompute on every open-pr call so that a PR that gains code changes
  // after an initial docs-only push has its docOnly flag cleared.
  const reviewTicket =
    (ticketId
      ? nextState.tickets.find((t) => t.id === ticketId)
      : nextState.tickets.find((t) => t.status === 'in_review')) ?? undefined;

  if (reviewTicket) {
    const docOnly = isPlatformLocalBranchDocOnly(
      reviewTicket.worktreePath,
      reviewTicket.baseBranch,
      _config.runtime,
    );

    return {
      ...nextState,
      tickets: nextState.tickets.map((t) =>
        t.id === reviewTicket.id ? { ...t, docOnly: docOnly || undefined } : t,
      ),
    };
  }

  return nextState;
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

export async function reconcileLateReview(
  state: DeliveryState,
  cwd: string,
  ticketId: string,
  dependencies: Partial<TicketReviewDependencies> = {},
): Promise<DeliveryState> {
  return runReconcileLateTicketReview(state, cwd, ticketId, {
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
): Promise<DeliveryState> {
  return advanceToNextTicket(state, cwd, {
    updatePullRequestBody,
  });
}

export function resolveEffectiveAdvanceBoundaryMode(
  mode: TicketBoundaryMode,
): 'cook' | 'gated' {
  return mode === 'glide' ? 'gated' : mode;
}

export async function applyAdvanceBoundaryMode(
  state: DeliveryState,
  advancedState: DeliveryState,
  cwd: string,
  dependencies: {
    startTicket: (
      state: DeliveryState,
      cwd: string,
      ticketId?: string,
    ) => Promise<DeliveryState>;
  } = {
    startTicket,
  },
): Promise<DeliveryState> {
  const nextPending = advancedState.tickets.find(
    (ticket) =>
      ticket.status === 'pending' &&
      state.tickets.find((previous) => previous.id === ticket.id)?.status ===
        'pending',
  );

  if (!nextPending) {
    return advancedState;
  }

  const effectiveMode = resolveEffectiveAdvanceBoundaryMode(
    _config.ticketBoundaryMode,
  );

  if (effectiveMode !== 'cook') {
    return advancedState;
  }

  return dependencies.startTicket(advancedState, cwd, nextPending.id);
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

function readCommitSubject(cwd: string, sha: string): string {
  return readPlatformCommitSubject(cwd, sha, _config.runtime);
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

function loadTicketReviewSnapshot(ticket: TicketState): {
  actionSummary?: string;
  comments?: AiReviewComment[];
  incompleteAgents?: string[];
  note?: string;
  nonActionSummary?: string;
  threadResolutions?: AiReviewThreadResolution[];
  vendors?: string[];
} {
  const artifacts = readReviewArtifacts({
    fetchArtifactPath:
      (ticket.reviewFetchArtifactPath ?? ticket.reviewArtifactJsonPath)
        ? resolve(
            ticket.reviewFetchArtifactPath ?? ticket.reviewArtifactJsonPath!,
          )
        : undefined,
    triageArtifactPath:
      (ticket.reviewTriageArtifactPath ?? ticket.reviewArtifactJsonPath)
        ? resolve(
            ticket.reviewTriageArtifactPath ?? ticket.reviewArtifactJsonPath!,
          )
        : undefined,
  });

  return {
    actionSummary:
      artifacts.triage?.actionSummary ?? ticket.reviewActionSummary,
    comments: artifacts.fetch?.comments ?? ticket.reviewComments,
    incompleteAgents:
      artifacts.triage?.incompleteAgents ?? ticket.reviewIncompleteAgents,
    note: artifacts.triage?.note ?? ticket.reviewNote,
    nonActionSummary:
      artifacts.triage?.nonActionSummary ?? ticket.reviewNonActionSummary,
    threadResolutions:
      artifacts.triage?.threadResolutions ?? ticket.reviewThreadResolutions,
    vendors: artifacts.fetch?.vendors ?? ticket.reviewVendors,
  };
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
    `boundary_mode=${_config.ticketBoundaryMode}`,
    `review_policy=selfAudit:${_config.reviewPolicy.selfAudit} codexPreflight:${_config.reviewPolicy.codexPreflight} externalReview:${_config.reviewPolicy.externalReview}`,
    '',
    ...state.tickets.map((ticket) =>
      [
        `${ticket.id} | status=${ticket.status} | branch=${ticket.branch} | base=${ticket.baseBranch}`,
        `title=${ticket.title}`,
        `worktree=${ticket.worktreePath}`,
        ticket.handoffPath ? `handoff=${ticket.handoffPath}` : undefined,
        ticket.postVerifySelfAuditCompletedAt
          ? `post_verify_self_audit=completed at ${ticket.postVerifySelfAuditCompletedAt}${ticket.selfAuditOutcome ? ` (${ticket.selfAuditOutcome})` : ''}`
          : undefined,
        ticket.codexPreflightCompletedAt
          ? `codex_preflight=completed at ${ticket.codexPreflightCompletedAt} (${ticket.codexPreflightOutcome ?? 'unknown'})`
          : undefined,
        ticket.prUrl ? `pr=${ticket.prUrl}` : undefined,
        ticket.reviewFetchArtifactPath
          ? `review_fetch_artifact=${ticket.reviewFetchArtifactPath}`
          : undefined,
        ticket.reviewTriageArtifactPath
          ? `review_triage_artifact=${ticket.reviewTriageArtifactPath}`
          : undefined,
        ticket.reviewRecordedAt
          ? `review_recorded_at=${ticket.reviewRecordedAt}`
          : undefined,
        ticket.reviewOutcome
          ? `review_outcome=${ticket.reviewOutcome}`
          : undefined,
      ]
        .filter((value): value is string => value !== undefined)
        .join('\n'),
    ),
  ].join('\n');
}

export function formatAdvanceBoundaryGuidance(
  state: DeliveryState,
  advancedState: DeliveryState,
  nextState: DeliveryState,
): string | undefined {
  const nextPending = advancedState.tickets.find(
    (t) =>
      t.status === 'pending' &&
      state.tickets.find((prev) => prev.id === t.id)?.status === 'pending',
  );
  const justDone = advancedState.tickets.find(
    (t) =>
      t.status === 'done' &&
      state.tickets.find((prev) => prev.id === t.id)?.status !== 'done',
  );

  if (!justDone || !nextPending) {
    return undefined;
  }

  const effectiveMode = resolveEffectiveAdvanceBoundaryMode(
    _config.ticketBoundaryMode,
  );
  const invocation = `${generateRunDeliverInvocation(_config.packageManager)} --plan ${state.planPath} start`;
  const resumePrompt = `Immediately execute \`${invocation}\`, read the generated handoff artifact as the source of truth for context, and implement ${nextPending.id}.`;

  if (effectiveMode === 'cook') {
    const startedTicket = nextState.tickets.find(
      (ticket) => ticket.id === nextPending.id,
    );

    return [
      'continuation_mode=cook',
      `COOK CONTINUATION started ${nextPending.id}.`,
      startedTicket?.handoffPath
        ? `next_handoff=${startedTicket.handoffPath}`
        : undefined,
      'Read the generated handoff artifact and continue implementation in the started ticket worktree.',
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n');
  }

  return [
    'context_reset_required=true',
    _config.ticketBoundaryMode === 'glide' ? 'glide_fallback=gated' : undefined,
    _config.ticketBoundaryMode === 'glide'
      ? `GLIDE FALLBACK before starting ${nextPending.id}.`
      : `GATED BOUNDARY before starting ${nextPending.id}.`,
    _config.ticketBoundaryMode === 'glide'
      ? 'Host/runtime self-reset is not supported here, so Son-of-Anton is using gated boundary behavior instead.'
      : undefined,
    'Reset context now. Prefer /clear for minimum token use; use /compact only if you intentionally want compressed carry-forward context.',
    `resume_prompt=${resumePrompt}`,
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}

/**
 * Prints only the active ticket's state block — not the full stack.
 * Used by poll-review so accumulated prior-ticket metadata is not added to
 * session context on every check.
 */
export function formatCurrentTicketStatus(
  state: DeliveryState,
  ticketId?: string,
): string {
  const ticket =
    (ticketId
      ? state.tickets.find((t) => t.id === ticketId)
      : (state.tickets.find((t) => t.status === 'in_review') ??
        state.tickets.find((t) => t.status === 'needs_patch') ??
        state.tickets.find((t) => t.status === 'operator_input_needed') ??
        state.tickets.find((t) => t.status === 'reviewed'))) ?? undefined;

  const header = [
    'Delivery Orchestrator',
    `plan_key=${state.planKey}`,
    `plan=${state.planPath}`,
    `boundary_mode=${_config.ticketBoundaryMode}`,
  ].join('\n');

  if (!ticket) {
    return header;
  }

  const review = loadTicketReviewSnapshot(ticket);
  const actionableFindings = (review.comments ?? []).filter(
    (c) => c.kind !== 'summary' && !c.isOutdated && !c.isResolved,
  );

  const findingsBlock =
    actionableFindings.length > 0
      ? [
          `findings (${actionableFindings.length}):`,
          ...actionableFindings.map((c) => {
            const boldMatch = c.body.match(/\*\*([^*]+)\*\*/);
            const title = boldMatch
              ? boldMatch[1]!.trim()
              : c.body.slice(0, 120).replace(/\n/g, ' ').trim();
            const location = c.path
              ? c.line != null
                ? `${c.path}:${c.line}`
                : c.path
              : '(no file)';
            return `  [${c.vendor}] ${location} — ${title}`;
          }),
        ].join('\n')
      : undefined;

  const ticketLines = [
    `${ticket.id} | status=${ticket.status} | branch=${ticket.branch} | base=${ticket.baseBranch}`,
    `title=${ticket.title}`,
    ticket.prUrl ? `pr=${ticket.prUrl}` : undefined,
    ticket.docOnly ? `doc_only=true` : undefined,
    review.vendors && review.vendors.length > 0
      ? `review_vendors=${review.vendors.join(',')}`
      : undefined,
    ticket.reviewOutcome ? `review_outcome=${ticket.reviewOutcome}` : undefined,
    review.actionSummary
      ? `review_action_summary=${review.actionSummary}`
      : undefined,
    findingsBlock,
    review.note ? `review_note=${review.note}` : undefined,
    review.incompleteAgents?.length
      ? `review_incomplete_agents=${review.incompleteAgents.join(',')}`
      : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join('\n');

  return [header, '', ticketLines].join('\n');
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
    result.recordedAt ? `recorded_at=${result.recordedAt}` : undefined,
    result.fetchArtifactPath
      ? `fetch_artifact=${result.fetchArtifactPath}`
      : undefined,
    result.triageArtifactPath
      ? `triage_artifact=${result.triageArtifactPath}`
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
