import { getUsage, parseCliArgs, resolveOptionsForCommand } from './cli';
import { ensureEnvReady as ensureEnvReadyImpl } from './env';
import {
  generateRunDeliverInvocation,
  loadOrchestratorConfig,
  resolveOrchestratorConfig,
} from './runtime-config';
import type {
  ResolvedOrchestratorConfig,
  ReviewPolicyStageValue,
  TicketBoundaryMode,
} from './config';
import type {
  DeliveryState,
  InternalReviewPatchCommit,
  OrchestratorOptions,
  ReviewOutcome,
  ReviewResult,
  StandaloneAiReviewResult,
  TicketDefinition,
  TicketState,
} from './types';
import {
  createDeliveryOrchestratorContext,
  type DeliveryOrchestratorContext,
} from './context';
import {
  copyLocalBootstrapFilesIfPresent as copyPlatformBootstrapFilesIfPresent,
  copyLocalEnvIfPresent as copyPlatformEnvIfPresent,
  findPrimaryWorktreePath as findPlatformPrimaryWorktreePath,
  isLocalBranchDocOnly as isPlatformLocalBranchDocOnly,
  type Runtime,
} from './platform';
import {
  createOptions as createOptionsImpl,
  deriveBranchName,
  derivePlanKey as derivePlanKeyImpl,
  deriveWorktreePath,
  findExistingBranch,
  inferPlanPathFromBranch as inferPlanPathFromBranchImpl,
  parsePlan as parsePlanImpl,
  relativeToRepo,
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
  formatReviewWindowMessage,
  resolveNotifier,
  type DeliveryNotifier,
} from './notifications';
import {
  assertReviewerFacingMarkdown,
  buildPullRequestBody,
  buildPullRequestTitle,
  buildStandaloneReviewStartedEvent,
} from './pr-metadata';
import {
  formatAdvanceBoundaryGuidance,
  formatCurrentTicketStatus,
  formatRepairSummary,
  formatStandaloneAiReviewResult,
  formatStatus,
  resolveEffectiveAdvanceBoundaryMode,
  type RepairStateResult,
} from './format';
import {
  recordTicketReview,
  runReconcileLateTicketReview,
  runStandaloneAiReviewLifecycle,
  runTicketReviewLifecycle,
  type StandaloneAiReviewDependencies,
  type TicketReviewDependencies,
} from './review';
import {
  advanceToNextTicket,
  materializeTicketContext,
  openPullRequest as openPullRequestImpl,
  recordCodexPreflight as recordCodexPreflightImpl,
  recordPostVerifySelfAudit as recordPostVerifySelfAuditImpl,
  restackTicket as restackTicketImpl,
  startTicket as startTicketImpl,
} from './ticket-flow';

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
    const initialConfig = resolveOrchestratorConfig(rawConfig, cwd);
    await ensureEnvReadyImpl(cwd, (worktreePath) =>
      findPrimaryWorktreePath(worktreePath, initialConfig),
    );
    const usage = getUsage(
      generateRunDeliverInvocation(initialConfig.packageManager),
    );
    parsed = parseCliArgs(argv, usage);
    const resolvedConfig = resolveOrchestratorConfig(
      {
        ...rawConfig,
        ticketBoundaryMode: parsed.boundaryMode ?? rawConfig.ticketBoundaryMode,
      },
      cwd,
    );
    const context = createDeliveryOrchestratorContext(resolvedConfig);
    const platform = context.platform;
    const notifier = resolveNotifier();
    if (parsed.command === 'ai-review') {
      const result = await runStandaloneAiReview(
        cwd,
        notifier,
        context,
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
      inferPlanPathFromBranch: (worktreePath, branch) =>
        inferPlanPathFromBranch(worktreePath, branch, context.config),
      planPath: parsed.planPath,
      readCurrentBranch: platform.readCurrentBranch,
    });
    parsed = {
      ...parsed,
      planPath: options.planPath,
    };

    if (parsed.command === 'repair-state') {
      const repaired = await repairState(cwd, options, context.config);
      console.log(
        [
          formatStatus(repaired.state, context.config),
          formatRepairSummary(repaired),
        ]
          .filter(Boolean)
          .join('\n\n'),
      );
      return 0;
    }

    const state = await loadState(cwd, options, context.config);

    switch (parsed.command) {
      case 'sync': {
        await saveState(cwd, state);
        console.log(formatStatus(state, context.config));
        return 0;
      }
      case 'status': {
        console.log(formatStatus(state, context.config));
        return 0;
      }
      case 'start': {
        const nextState = await startTicket(
          state,
          cwd,
          context,
          parsed.positionals[0],
        );
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState, context.config));
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
                context,
                auditPatchCommitArgs,
                '[self-audit]',
                'Self-audit',
              )
            : undefined;
        const nextState = await recordPostVerifySelfAudit(
          state,
          auditTicketId,
          auditOutcome,
          context.config,
          {},
          auditPatchCommits,
        );
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState, context.config));
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
              context.config.runtime,
            )
          : false;
        const preflightNote =
          preflightOutcome === 'clean' ? parsed.positionals[1] : undefined;
        if (preflightOutcome === 'clean' && !isDocOnly && !preflightNote) {
          throw new Error(
            'codex-preflight clean requires a note summarizing what Codex reviewed and concluded. Usage: codex-preflight clean "<note>"',
          );
        }
        if (preflightOutcome === 'patched' && parsed.positionals.length > 1) {
          throw new Error(
            'Codex preflight patch commits are only allowed when outcome is `patched`.',
          );
        }
        const nextState = recordCodexPreflight(
          state,
          preflightOutcome,
          isDocOnly,
          context.config.reviewPolicy.codexPreflight,
          preflightOutcome === 'patched'
            ? resolveInternalReviewPatchCommits(
                preflightTarget?.worktreePath ?? cwd,
                context,
                parsed.positionals.slice(1),
                '[codexPreflight]',
                'Codex preflight',
              )
            : undefined,
          preflightNote,
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
        console.log(formatStatus(nextState, context.config));
        return 0;
      }
      case 'open-pr': {
        const nextState = await openPullRequest(
          state,
          cwd,
          context,
          parsed.positionals[0],
        );
        await saveState(cwd, nextState);
        console.log(
          [
            formatStatus(nextState, context.config),
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
          shouldAutoRecordReviewSkippedForPollReview(
            context.config.reviewPolicy.externalReview,
            pollTarget,
          )
        ) {
          const skipNote =
            context.config.reviewPolicy.externalReview === 'disabled'
              ? 'external AI review disabled by policy'
              : 'doc-only PR; external AI review skipped by policy';
          console.log(
            context.config.reviewPolicy.externalReview === 'disabled'
              ? `externalReview=disabled for ${pollTarget.id}: skipping AI review window, recording skipped`
              : `doc_only=true for ${pollTarget.id} under externalReview=skip_doc_only: skipping AI review window, recording skipped`,
          );
          const docOnlyState = await recordReview(
            state,
            cwd,
            context,
            pollTarget.id,
            'skipped',
            skipNote,
          );
          await saveState(cwd, docOnlyState);
          console.log(
            formatCurrentTicketStatus(
              docOnlyState,
              context.config,
              pollTicketId,
            ),
          );
          await emitNotificationWarnings(
            notifier,
            cwd,
            eventsForPollReviewCommand(docOnlyState, pollTicketId),
          );
          return 0;
        }

        const nextState = await pollReview(state, cwd, context, pollTicketId);
        await saveState(cwd, nextState);
        console.log(
          formatCurrentTicketStatus(nextState, context.config, pollTicketId),
        );
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
            `Usage: ${context.invocation} --plan <plan-path> reconcile-late-review <ticket-id>`,
          );
        }

        const nextState = await reconcileLateReview(
          state,
          cwd,
          context,
          ticketId,
        );
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState, context.config));
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
            `Usage: ${context.invocation} --plan <plan-path> record-review <ticket-id> <clean|patched|operator_input_needed> [note]`,
          );
        }

        const nextState = await recordReview(
          state,
          cwd,
          context,
          ticketId,
          outcome,
          noteParts.join(' ').trim() || undefined,
        );
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState, context.config));
        await emitNotificationWarnings(
          notifier,
          cwd,
          eventsForRecordReviewCommand(nextState, ticketId),
        );
        return 0;
      }
      case 'advance': {
        const advancedState = await advanceToNextTicketImpl(
          state,
          cwd,
          context,
        );
        const nextState = await applyAdvanceBoundaryMode(
          state,
          advancedState,
          cwd,
          context,
        );
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState, context.config));
        const boundaryGuidance = formatAdvanceBoundaryGuidance(
          state,
          advancedState,
          nextState,
          context.config,
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
          context,
          parsed.positionals[0],
        );
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState, context.config));
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

export function findPrimaryWorktreePath(
  cwd: string,
  config: ResolvedOrchestratorConfig,
): string | undefined {
  return findPlatformPrimaryWorktreePath(
    cwd,
    config.defaultBranch,
    config.runtime,
  );
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
  config: ResolvedOrchestratorConfig,
  inferred?: DeliveryState,
): DeliveryState {
  return syncStateFromScratchImpl(ticketDefinitions, options, inferred, {
    cwd,
    defaultBranch: config.defaultBranch,
    deriveBranchName,
    deriveWorktreePath,
  });
}

export function syncStateFromExisting(
  existing: DeliveryState,
  ticketDefinitions: TicketDefinition[],
  cwd: string,
  options: OrchestratorOptions,
  config: ResolvedOrchestratorConfig,
  inferred?: DeliveryState,
): DeliveryState {
  return syncStateFromExistingImpl(
    existing,
    ticketDefinitions,
    options,
    inferred,
    {
      cwd,
      defaultBranch: config.defaultBranch,
      deriveBranchName,
      deriveWorktreePath,
    },
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
  config: ResolvedOrchestratorConfig,
): Promise<DeliveryState> {
  return loadStateImpl(cwd, options, {
    cwd,
    defaultBranch: config.defaultBranch,
    runtime: config.runtime,
    deriveBranchName,
    deriveWorktreePath,
    findExistingBranch,
  });
}

async function repairState(
  cwd: string,
  options: OrchestratorOptions,
  config: ResolvedOrchestratorConfig,
): Promise<RepairStateResult> {
  return repairStateImpl(cwd, options, {
    cwd,
    defaultBranch: config.defaultBranch,
    runtime: config.runtime,
    deriveBranchName,
    deriveWorktreePath,
    findExistingBranch,
  });
}

export async function inferPlanPathFromBranch(
  cwd: string,
  branch: string,
  config: ResolvedOrchestratorConfig,
): Promise<string> {
  return inferPlanPathFromBranchImpl(
    cwd,
    branch,
    config.planRoot,
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

async function startTicket(
  state: DeliveryState,
  cwd: string,
  context: DeliveryOrchestratorContext,
  ticketId?: string,
): Promise<DeliveryState> {
  const platform = context.platform;
  return startTicketImpl(state, cwd, ticketId, {
    addWorktree: platform.addWorktree,
    bootstrapWorktreeIfNeeded: platform.bootstrapWorktreeIfNeeded,
    copyLocalBootstrapFilesIfPresent,
    materializeTicketContext,
    relativeToRepo,
  });
}

export async function copyLocalBootstrapFilesIfPresent(
  sourceWorktreePath: string,
  targetWorktreePath: string,
): Promise<void> {
  await copyPlatformBootstrapFilesIfPresent(
    sourceWorktreePath,
    targetWorktreePath,
  );
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
  config?: ResolvedOrchestratorConfig,
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
  if (!config) {
    throw new Error('recordPostVerifySelfAudit requires explicit config.');
  }

  const target =
    (ticketId
      ? state.tickets.find((ticket) => ticket.id === ticketId)
      : state.tickets.find((ticket) => ticket.status === 'in_progress')) ??
    undefined;
  const selfAuditPolicy =
    dependencies.selfAuditPolicy ?? config.reviewPolicy.selfAudit;
  const isDocOnly =
    target &&
    selfAuditPolicy !== 'disabled' &&
    (dependencies.isLocalBranchDocOnly ?? isPlatformLocalBranchDocOnly)(
      target.worktreePath,
      target.baseBranch,
      config.runtime,
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

export function recordCodexPreflight(
  state: DeliveryState,
  outcome?: 'clean' | 'patched',
  isDocOnly?: boolean,
  policy?: ReviewPolicyStageValue,
  patchCommits?: InternalReviewPatchCommit[],
  note?: string,
): DeliveryState {
  if (!policy) {
    throw new Error('recordCodexPreflight requires an explicit policy.');
  }

  return recordCodexPreflightImpl(
    state,
    outcome,
    isDocOnly,
    policy,
    patchCommits,
    note,
  );
}

export function shouldAutoRecordReviewSkippedForPollReview(
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
  context: DeliveryOrchestratorContext,
  rawShas: string[],
  suffix: '[self-audit]' | '[codexPreflight]',
  stageLabel: string,
): InternalReviewPatchCommit[] {
  const platform = context.platform;
  return normalizeUniquePatchCommitShas(rawShas).map((sha) => {
    const subject = platform.readCommitSubject(cwd, sha);
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
  context: DeliveryOrchestratorContext,
  ticketId?: string,
): Promise<DeliveryState> {
  const resolvedTicketId = ticketId;
  const platform = context.platform;
  const nextState = openPullRequestImpl(state, cwd, resolvedTicketId, {
    assertReviewerFacingMarkdown,
    buildPullRequestBody,
    buildPullRequestTitle,
    codexPreflightPolicy: context.config.reviewPolicy.codexPreflight,
    createPullRequest: platform.createPullRequest,
    editPullRequest: platform.editPullRequest,
    ensureBranchPushed: platform.ensureBranchPushed,
    findOpenPullRequest: platform.findOpenPullRequest,
    readLatestCommitSubject: platform.readLatestCommitSubject,
    reportProgress: (message: string) => console.log(message),
    resolveGitHubRepo: platform.resolveGitHubRepoForOrchestrator,
  });

  // Detect doc-only PRs to skip the external AI review window.
  // Recompute on every open-pr call so that a PR that gains code changes
  // after an initial docs-only push has its docOnly flag cleared.
  const reviewTicket =
    (resolvedTicketId
      ? nextState.tickets.find((t) => t.id === resolvedTicketId)
      : nextState.tickets.find((t) => t.status === 'in_review')) ?? undefined;

  if (reviewTicket) {
    const docOnly = isPlatformLocalBranchDocOnly(
      reviewTicket.worktreePath,
      reviewTicket.baseBranch,
      context.config.runtime,
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
  context: DeliveryOrchestratorContext,
  ticketId?: string,
  maybeDependencies?: Partial<TicketReviewDependencies>,
  dependencies: Partial<TicketReviewDependencies> = {},
): Promise<DeliveryState> {
  const resolvedDependencies =
    typeof maybeDependencies === 'object' ? maybeDependencies : dependencies;
  const platform = context.platform;
  return runTicketReviewLifecycle(state, cwd, ticketId, {
    ...resolvedDependencies,
    relativeToRepo,
    replyToReviewThread:
      resolvedDependencies.replyToReviewThread ??
      platform.replyToReviewThreadForOrchestrator,
    resolveReviewFetcher,
    resolveReviewThread: platform.resolveReviewThread,
    resolveReviewTriager,
    runProcess: platform.runProcess,
    updatePullRequestBody:
      resolvedDependencies.updatePullRequestBody ??
      platform.updatePullRequestBody,
  });
}

export async function reconcileLateReview(
  state: DeliveryState,
  cwd: string,
  context: DeliveryOrchestratorContext,
  ticketId: string,
  maybeDependencies?: Partial<TicketReviewDependencies>,
  dependencies: Partial<TicketReviewDependencies> = {},
): Promise<DeliveryState> {
  const resolvedDependencies =
    typeof maybeDependencies === 'object' ? maybeDependencies : dependencies;
  if (!ticketId) {
    throw new Error('Missing ticket id for reconcile-late-review.');
  }
  const platform = context.platform;
  return runReconcileLateTicketReview(state, cwd, ticketId, {
    ...resolvedDependencies,
    relativeToRepo,
    replyToReviewThread:
      resolvedDependencies.replyToReviewThread ??
      platform.replyToReviewThreadForOrchestrator,
    resolveReviewFetcher,
    resolveReviewThread: platform.resolveReviewThread,
    resolveReviewTriager,
    runProcess: platform.runProcess,
    updatePullRequestBody:
      resolvedDependencies.updatePullRequestBody ??
      platform.updatePullRequestBody,
  });
}

export async function runStandaloneAiReview(
  cwd: string,
  notifier: DeliveryNotifier,
  context: DeliveryOrchestratorContext,
  prNumber?: number,
  maybeDependencies?: Partial<StandaloneAiReviewDependencies>,
  dependencies: Partial<StandaloneAiReviewDependencies> = {},
): Promise<StandaloneAiReviewResult> {
  const resolvedDependencies =
    typeof maybeDependencies === 'object' ? maybeDependencies : dependencies;
  const platform = context.platform;
  const pullRequest =
    resolvedDependencies.pullRequest ??
    platform.resolveStandalonePullRequest(cwd, prNumber);

  await emitNotificationWarnings(notifier, cwd, [
    buildStandaloneReviewStartedEvent(pullRequest.number, pullRequest.url),
  ]);

  return runStandaloneAiReviewLifecycle(cwd, prNumber, {
    ...resolvedDependencies,
    pullRequest,
    relativeToRepo,
    replyToReviewThread:
      resolvedDependencies.replyToReviewThread ??
      platform.replyToReviewThreadForOrchestrator,
    resolveReviewFetcher,
    resolveReviewThread: platform.resolveReviewThread,
    resolveReviewTriager,
    resolveStandalonePullRequest: platform.resolveStandalonePullRequest,
    runProcess: platform.runProcess,
    updatePullRequestBody:
      resolvedDependencies.updatePullRequestBody ??
      platform.updateStandalonePullRequestBody,
  });
}

export async function recordReview(
  state: DeliveryState,
  cwd: string,
  context: DeliveryOrchestratorContext,
  ticketId: string,
  outcome: ReviewResult,
  note?: string,
  maybeDependencies?: Partial<TicketReviewDependencies>,
  dependencies: Partial<TicketReviewDependencies> = {},
): Promise<DeliveryState> {
  const resolvedDependencies =
    typeof maybeDependencies === 'object' ? maybeDependencies : dependencies;
  const platform = context.platform;
  return recordTicketReview(state, cwd, ticketId, outcome, note, {
    ...(resolvedDependencies as Partial<TicketReviewDependencies>),
    relativeToRepo,
    replyToReviewThread:
      resolvedDependencies.replyToReviewThread ??
      platform.replyToReviewThreadForOrchestrator,
    resolveReviewFetcher,
    resolveReviewThread: platform.resolveReviewThread,
    resolveReviewTriager,
    runProcess: platform.runProcess,
    updatePullRequestBody:
      resolvedDependencies.updatePullRequestBody ??
      platform.updatePullRequestBody,
  });
}

async function advanceToNextTicketImpl(
  state: DeliveryState,
  cwd: string,
  context: DeliveryOrchestratorContext,
): Promise<DeliveryState> {
  const platform = context.platform;
  return advanceToNextTicket(state, cwd, {
    updatePullRequestBody: platform.updatePullRequestBody,
  });
}

export async function applyAdvanceBoundaryMode(
  state: DeliveryState,
  advancedState: DeliveryState,
  cwd: string,
  context: DeliveryOrchestratorContext,
  dependencies: {
    startTicket: (
      state: DeliveryState,
      cwd: string,
      ticketId?: string,
    ) => Promise<DeliveryState>;
  } = {
    startTicket: (state, cwd, ticketId) =>
      startTicket(state, cwd, context, ticketId),
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
    context.config.ticketBoundaryMode,
  );

  if (effectiveMode !== 'cook') {
    return advancedState;
  }

  return dependencies.startTicket(advancedState, cwd, nextPending.id);
}

async function restackTicket(
  state: DeliveryState,
  cwd: string,
  context: DeliveryOrchestratorContext,
  ticketId?: string,
): Promise<DeliveryState> {
  const platform = context.platform;
  return restackTicketImpl(state, cwd, ticketId, {
    buildPullRequestBody,
    defaultBranch: context.config.defaultBranch,
    editPullRequest: platform.editPullRequest,
    ensureCleanWorktree: platform.ensureCleanWorktree,
    fetchOrigin: platform.fetchOrigin,
    findOpenPullRequest: platform.findOpenPullRequest,
    hasMergedPullRequestForBranch: platform.hasMergedPullRequestForBranch,
    readCurrentBranch: platform.readCurrentBranch,
    readMergeBase: platform.readMergeBase,
    rebaseOnto: platform.rebaseOnto,
    rebaseOntoDefaultBranch: platform.rebaseOntoDefaultBranch,
    resolveGitHubRepo: platform.resolveGitHubRepoForOrchestrator,
  });
}

export function derivePlanKey(planPath: string): string {
  return derivePlanKeyImpl(planPath);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
