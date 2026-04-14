import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { PullRequestSummary } from './platform';
import type { ReviewActionCommit } from './pr-metadata';
import type {
  CodexPreflightOutcome,
  DeliveryState,
  InternalReviewPatchCommit,
  ReviewOutcome,
  ReviewPolicyStageValue,
  TicketState,
} from './orchestrator';

function validateInternalReviewPatchCommits(input: {
  outcome: ReviewOutcome | CodexPreflightOutcome;
  patchCommits: InternalReviewPatchCommit[] | undefined;
  stageLabel: string;
}): void {
  const patchCount = input.patchCommits?.length ?? 0;
  if (input.outcome === 'patched' && patchCount === 0) {
    throw new Error(
      `${input.stageLabel} recorded as patched requires at least one patch commit.`,
    );
  }

  if (input.outcome !== 'patched' && patchCount > 0) {
    throw new Error(
      `${input.stageLabel} patch commits are only allowed when outcome is \`patched\`.`,
    );
  }
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

export function buildTicketHandoff(
  state: DeliveryState,
  ticket: Pick<
    TicketState,
    'id' | 'title' | 'ticketFile' | 'branch' | 'baseBranch' | 'worktreePath'
  >,
  modifiedSectionsNote?: string,
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
    '- Do not read ahead during the AI review wait window. The wait is free (LLM idle during subprocess sleep). Be sabaai sabaai.',
  ];

  if (modifiedSectionsNote) {
    lines.push('', '## Modified Sections', '');
    lines.push(
      'Read only the file sections listed here — do not re-read full files.',
    );
    lines.push('');
    lines.push(modifiedSectionsNote);
  }

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

export async function writeTicketHandoff(
  state: DeliveryState,
  cwd: string,
  ticketId: string,
  dependencies: {
    relativeToRepo: (cwd: string, absolutePath: string) => string;
  },
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

  const modifiedSectionsNote = await extractScopeSection(
    resolve(cwd, ticket.ticketFile),
  );

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(
    absolutePath,
    buildTicketHandoff(state, ticket, modifiedSectionsNote),
    'utf8',
  );

  return {
    relativePath: dependencies.relativeToRepo(cwd, absolutePath),
    generatedAt,
  };
}

async function extractScopeSection(
  ticketFilePath: string,
): Promise<string | undefined> {
  try {
    const content = await readFile(ticketFilePath, 'utf8');
    const lines = content.split('\n');
    const startIdx = lines.findIndex((line) => /^##\s+Scope/.test(line));

    if (startIdx === -1) {
      return undefined;
    }

    const sectionLines: string[] = [];

    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (/^##\s/.test(line)) {
        break;
      }
      sectionLines.push(line);
    }

    const body = sectionLines.join('\n').trim();
    return body.length > 0 ? body : undefined;
  } catch {
    return undefined;
  }
}

export async function startTicket(
  state: DeliveryState,
  cwd: string,
  ticketId: string | undefined,
  dependencies: {
    addWorktree: (
      cwd: string,
      worktreePath: string,
      branch: string,
      baseBranch: string,
    ) => void;
    bootstrapWorktreeIfNeeded: (worktreePath: string) => Promise<void>;
    copyLocalEnvIfPresent: (
      sourceWorktreePath: string,
      targetWorktreePath: string,
    ) => Promise<void>;
    relativeToRepo: (cwd: string, absolutePath: string) => string;
  },
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
    dependencies.addWorktree(
      cwd,
      target.worktreePath,
      target.branch,
      target.baseBranch,
    );
  }

  await dependencies.copyLocalEnvIfPresent(cwd, target.worktreePath);
  await dependencies.bootstrapWorktreeIfNeeded(target.worktreePath);

  const handoff = await writeTicketHandoff(state, cwd, target.id, {
    relativeToRepo: dependencies.relativeToRepo,
  });

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

export function recordPostVerifySelfAudit(
  state: DeliveryState,
  ticketId?: string,
  outcome?: ReviewOutcome,
  patchCommits?: InternalReviewPatchCommit[],
  now: () => string = () => new Date().toISOString(),
): DeliveryState {
  const target =
    (ticketId
      ? state.tickets.find((ticket) => ticket.id === ticketId)
      : state.tickets.find((ticket) => ticket.status === 'in_progress')) ??
    undefined;

  if (!target) {
    throw new Error(
      'No in-progress ticket found to mark post-verify self-audit complete.',
    );
  }

  if (target.status === 'post_verify_self_audit_complete') {
    return state;
  }

  if (target.status !== 'in_progress') {
    throw new Error(
      `Ticket ${target.id} must be in progress before post-verify self-audit can be recorded.`,
    );
  }

  const completedAt = now();
  const resolvedOutcome: ReviewOutcome = outcome ?? 'clean';
  validateInternalReviewPatchCommits({
    outcome: resolvedOutcome,
    patchCommits,
    stageLabel: 'Self-audit',
  });

  return {
    ...state,
    tickets: state.tickets.map((ticket) =>
      ticket.id === target.id
        ? {
            ...ticket,
            status: 'post_verify_self_audit_complete',
            postVerifySelfAuditCompletedAt: completedAt,
            selfAuditOutcome: resolvedOutcome,
            selfAuditPatchCommits: patchCommits,
          }
        : ticket,
    ),
  };
}

/** @deprecated Use `recordPostVerifySelfAudit`. */
export const recordInternalReview = recordPostVerifySelfAudit;

export function recordCodexPreflight(
  state: DeliveryState,
  outcome?: 'clean' | 'patched',
  isDocOnly?: boolean,
  policy: ReviewPolicyStageValue = 'skip_doc_only',
  patchCommits?: InternalReviewPatchCommit[],
  now: () => string = () => new Date().toISOString(),
): DeliveryState {
  const target = state.tickets.find(
    (ticket) => ticket.status === 'post_verify_self_audit_complete',
  );

  if (!target) {
    throw new Error(
      'No ticket at post_verify_self_audit_complete status found to record Codex preflight.',
    );
  }

  const docOnly = isDocOnly ?? !!target.docOnly;
  let resolvedOutcome: CodexPreflightOutcome;

  if (policy === 'skip_doc_only' && docOnly) {
    resolvedOutcome = 'skipped';
  } else if (outcome === 'clean' || outcome === 'patched') {
    resolvedOutcome = outcome;
  } else {
    throw new Error(
      `Ticket ${target.id} requires a Codex preflight outcome. Pass \`clean\` or \`patched\`.`,
    );
  }
  validateInternalReviewPatchCommits({
    outcome: resolvedOutcome,
    patchCommits,
    stageLabel: 'Codex preflight',
  });

  const completedAt = now();

  return {
    ...state,
    tickets: state.tickets.map((ticket) =>
      ticket.id === target.id
        ? {
            ...ticket,
            status: 'codex_preflight_complete',
            codexPreflightOutcome: resolvedOutcome,
            codexPreflightCompletedAt: completedAt,
            codexPreflightPatchCommits: patchCommits,
          }
        : ticket,
    ),
  };
}

export function openPullRequest(
  state: DeliveryState,
  cwd: string,
  ticketId: string | undefined,
  dependencies: {
    assertReviewerFacingMarkdown: (markdown: string) => void;
    buildPullRequestBody: (
      state: DeliveryState,
      ticket: TicketState,
      options?: {
        actionCommits?: ReviewActionCommit[];
        currentHeadSha?: string;
        githubRepo?: { defaultBranch: string; name: string; owner: string };
      },
    ) => string;
    buildPullRequestTitle: (
      ticket: Pick<TicketState, 'id' | 'title'>,
      commitSubject?: string,
    ) => string;
    codexPreflightPolicy?: ReviewPolicyStageValue;
    createPullRequest: (
      cwd: string,
      options: {
        base: string;
        body: string;
        head: string;
        title: string;
      },
    ) => string;
    editPullRequest: (
      cwd: string,
      prNumber: number,
      options: {
        base?: string;
        body?: string;
        title?: string;
      },
    ) => void;
    ensureBranchPushed: (cwd: string, branch: string) => void;
    findOpenPullRequest: (
      cwd: string,
      branch: string,
    ) => PullRequestSummary | undefined;
    parsePullRequestNumber: (prUrl: string) => number;
    readLatestCommitSubject: (cwd: string) => string;
    resolveGitHubRepo?: (
      cwd: string,
    ) => { defaultBranch: string; name: string; owner: string } | undefined;
  },
): DeliveryState {
  const target =
    (ticketId
      ? state.tickets.find((ticket) => ticket.id === ticketId)
      : (state.tickets.find(
          (ticket) => ticket.status === 'codex_preflight_complete',
        ) ??
        state.tickets.find(
          (ticket) => ticket.status === 'post_verify_self_audit_complete',
        ) ??
        state.tickets.find((ticket) => ticket.status === 'in_review'))) ??
    undefined;

  if (!target) {
    throw new Error('No ticket in a PR-openable state found to open as a PR.');
  }

  if (target.status === 'in_progress') {
    throw new Error(
      `Ticket ${target.id} must complete post-verify self-audit before opening a PR.`,
    );
  }

  if (
    target.status === 'post_verify_self_audit_complete' &&
    dependencies.codexPreflightPolicy !== undefined &&
    dependencies.codexPreflightPolicy !== 'disabled'
  ) {
    throw new Error(
      `Ticket ${target.id} requires Codex preflight before opening a PR. Run \`bun run deliver codex-preflight <clean|patched>\` after completing the Codex review step. If codex-plugin-cc is unavailable, set codexPreflight to "disabled" in orchestrator.config.json to bypass.`,
    );
  }

  if (
    target.status !== 'post_verify_self_audit_complete' &&
    target.status !== 'codex_preflight_complete' &&
    target.status !== 'in_review'
  ) {
    throw new Error(
      `Ticket ${target.id} is not in a PR-openable state. Current status: ${target.status}.`,
    );
  }

  dependencies.ensureBranchPushed(target.worktreePath, target.branch);

  const title = dependencies.buildPullRequestTitle(
    target,
    dependencies.readLatestCommitSubject(target.worktreePath),
  );
  const body = dependencies.buildPullRequestBody(state, target, {
    githubRepo: dependencies.resolveGitHubRepo?.(target.worktreePath),
  });
  dependencies.assertReviewerFacingMarkdown(body);
  const existingPullRequest = dependencies.findOpenPullRequest(
    target.worktreePath,
    target.branch,
  );
  let prUrl: string;
  let prNumber: number;

  if (existingPullRequest) {
    dependencies.editPullRequest(
      target.worktreePath,
      existingPullRequest.number,
      {
        body,
        title,
      },
    );
    prUrl = existingPullRequest.url;
    prNumber = existingPullRequest.number;
  } else {
    prUrl = dependencies.createPullRequest(target.worktreePath, {
      base: target.baseBranch,
      body,
      head: target.branch,
      title,
    });
    prNumber = dependencies.parsePullRequestNumber(prUrl);
  }

  const now = new Date().toISOString();

  return {
    ...state,
    tickets: state.tickets.map((ticket) =>
      ticket.id === target.id
        ? {
            ...ticket,
            status: 'in_review',
            prUrl,
            prNumber,
            prOpenedAt: ticket.prOpenedAt ?? now,
          }
        : ticket,
    ),
  };
}

export async function advanceToNextTicket(
  state: DeliveryState,
  cwd: string,
  dependencies: {
    updatePullRequestBody: (state: DeliveryState, ticket: TicketState) => void;
  },
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

  dependencies.updatePullRequestBody(state, current);

  return {
    ...state,
    tickets: state.tickets.map((ticket) =>
      ticket.id === current.id ? { ...ticket, status: 'done' } : ticket,
    ),
  };
}

export function restackTicket(
  state: DeliveryState,
  cwd: string,
  ticketId: string | undefined,
  dependencies: {
    buildPullRequestBody: (
      state: DeliveryState,
      ticket: TicketState,
      options?: {
        actionCommits?: ReviewActionCommit[];
        currentHeadSha?: string;
        githubRepo?: { defaultBranch: string; name: string; owner: string };
      },
    ) => string;
    defaultBranch: string;
    editPullRequest: (
      cwd: string,
      prNumber: number,
      options: {
        base?: string;
        body?: string;
        title?: string;
      },
    ) => void;
    ensureCleanWorktree: (cwd: string) => void;
    fetchOrigin: (cwd: string) => void;
    findOpenPullRequest: (
      cwd: string,
      branch: string,
    ) => PullRequestSummary | undefined;
    hasMergedPullRequestForBranch: (cwd: string, branch: string) => boolean;
    readCurrentBranch: (cwd: string) => string;
    readMergeBase: (
      cwd: string,
      branch: string,
      previousBranch: string,
    ) => string;
    rebaseOnto: (cwd: string, rebaseTarget: string, oldBase: string) => void;
    rebaseOntoDefaultBranch: (cwd: string, defaultBranch: string) => void;
    resolveGitHubRepo?: (
      cwd: string,
    ) => { defaultBranch: string; name: string; owner: string } | undefined;
  },
): DeliveryState {
  dependencies.ensureCleanWorktree(cwd);
  const currentBranch = dependencies.readCurrentBranch(cwd);
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

  dependencies.fetchOrigin(cwd);

  const targetIndex = state.tickets.findIndex(
    (ticket) => ticket.id === target.id,
  );
  const previous = targetIndex > 0 ? state.tickets[targetIndex - 1] : undefined;

  let nextBaseBranch = dependencies.defaultBranch;
  let rebaseTarget = `origin/${dependencies.defaultBranch}`;

  if (previous) {
    const oldBase = dependencies.readMergeBase(
      cwd,
      target.branch,
      previous.branch,
    );

    if (!oldBase) {
      throw new Error(
        `Could not determine the shared ancestor between ${target.branch} and ${previous.branch}.`,
      );
    }

    if (!dependencies.hasMergedPullRequestForBranch(cwd, previous.branch)) {
      nextBaseBranch = previous.branch;
      rebaseTarget = previous.branch;
    }

    dependencies.rebaseOnto(cwd, rebaseTarget, oldBase);
  } else {
    dependencies.rebaseOntoDefaultBranch(cwd, dependencies.defaultBranch);
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

  const pullRequest = dependencies.findOpenPullRequest(cwd, target.branch);

  if (pullRequest) {
    dependencies.editPullRequest(cwd, pullRequest.number, {
      base: nextBaseBranch,
      body: dependencies.buildPullRequestBody(nextState, updatedTarget, {
        githubRepo: dependencies.resolveGitHubRepo?.(cwd),
      }),
    });
  }

  return nextState;
}
