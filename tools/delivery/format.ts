import { resolve } from 'node:path';

import { readReviewArtifacts } from './review-artifacts';
import { generateRunDeliverInvocation } from './runtime-config';
import type { TicketBoundaryMode } from './config';
import type { ResolvedOrchestratorConfig } from './runtime-config';
import type {
  AiReviewComment,
  AiReviewThreadResolution,
  DeliveryState,
  StandaloneAiReviewResult,
  TicketState,
} from './types';

export type RepairStateResult = {
  state: DeliveryState;
  backupPath?: string;
  changes: string[];
  hadExistingState: boolean;
};

export function resolveEffectiveAdvanceBoundaryMode(
  mode: TicketBoundaryMode,
): 'cook' | 'gated' {
  return mode === 'glide' ? 'gated' : mode;
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

export function formatStatus(
  state: DeliveryState,
  config: ResolvedOrchestratorConfig,
): string {
  return [
    'Delivery Orchestrator',
    `plan_key=${state.planKey}`,
    `plan=${state.planPath}`,
    `state=${state.statePath}`,
    `handoffs=${state.handoffsDirPath}`,
    `review_poll_interval_minutes=${state.reviewPollIntervalMinutes}`,
    `review_poll_max_wait_minutes=${state.reviewPollMaxWaitMinutes}`,
    `boundary_mode=${config.ticketBoundaryMode}`,
    `review_policy=selfAudit:${config.reviewPolicy.selfAudit} codexPreflight:${config.reviewPolicy.codexPreflight} externalReview:${config.reviewPolicy.externalReview}`,
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
  config: ResolvedOrchestratorConfig,
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
    config.ticketBoundaryMode,
  );
  const invocation = `${generateRunDeliverInvocation(config.packageManager)} --plan ${state.planPath} start`;
  const resumePrompt = `Immediately execute \`${invocation}\`, read the locally materialized handoff artifact in the started worktree as the source of truth for context, and implement ${nextPending.id}.`;

  if (effectiveMode === 'cook') {
    const startedTicket = nextState.tickets.find(
      (ticket) => ticket.id === nextPending.id,
    );
    const nextHandoffAbsolutePath =
      startedTicket?.handoffPath && startedTicket.worktreePath
        ? resolve(startedTicket.worktreePath, startedTicket.handoffPath)
        : undefined;

    return [
      'continuation_mode=cook',
      `COOK CONTINUATION started ${nextPending.id}.`,
      startedTicket?.worktreePath
        ? `next_worktree=${startedTicket.worktreePath}`
        : undefined,
      startedTicket?.handoffPath
        ? `next_handoff=${startedTicket.handoffPath}`
        : undefined,
      nextHandoffAbsolutePath
        ? `next_handoff_absolute=${nextHandoffAbsolutePath}`
        : undefined,
      'Read the locally materialized handoff artifact from `next_handoff_absolute` and continue implementation in the started ticket worktree.',
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n');
  }

  return [
    'context_reset_required=true',
    config.ticketBoundaryMode === 'glide' ? 'glide_fallback=gated' : undefined,
    config.ticketBoundaryMode === 'glide'
      ? `GLIDE FALLBACK before starting ${nextPending.id}.`
      : `GATED BOUNDARY before starting ${nextPending.id}.`,
    config.ticketBoundaryMode === 'glide'
      ? 'Host/runtime self-reset is not supported here, so Son-of-Anton is using gated boundary behavior instead.'
      : undefined,
    'Reset context now. Prefer /clear for minimum token use; use /compact only if you intentionally want compressed carry-forward context.',
    `resume_prompt=${resumePrompt}`,
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}

export function formatCurrentTicketStatus(
  state: DeliveryState,
  config: ResolvedOrchestratorConfig,
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
    `boundary_mode=${config.ticketBoundaryMode}`,
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

export function formatRepairSummary(result: RepairStateResult): string {
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

export function formatStandaloneAiReviewResult(
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
