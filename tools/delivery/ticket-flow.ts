import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { PullRequestSummary } from './platform';
import type { DeliveryState, TicketState } from './orchestrator';

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

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buildTicketHandoff(state, ticket), 'utf8');

  return {
    relativePath: dependencies.relativeToRepo(cwd, absolutePath),
    generatedAt,
  };
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

export function recordInternalReview(
  state: DeliveryState,
  ticketId?: string,
  now: () => string = () => new Date().toISOString(),
): DeliveryState {
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

  const completedAt = now();

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

export function openPullRequest(
  state: DeliveryState,
  cwd: string,
  ticketId: string | undefined,
  dependencies: {
    assertReviewerFacingMarkdown: (markdown: string) => void;
    buildPullRequestBody: (state: DeliveryState, ticket: TicketState) => string;
    buildPullRequestTitle: (
      ticket: Pick<TicketState, 'id' | 'title'>,
      commitSubject?: string,
    ) => string;
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
  },
): DeliveryState {
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

  dependencies.ensureBranchPushed(target.worktreePath, target.branch);

  const title = dependencies.buildPullRequestTitle(
    target,
    dependencies.readLatestCommitSubject(target.worktreePath),
  );
  const body = dependencies.buildPullRequestBody(state, target);
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
  startNext: boolean,
  dependencies: {
    startTicket: (
      state: DeliveryState,
      cwd: string,
      ticketId?: string,
    ) => Promise<DeliveryState>;
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

  nextState = await dependencies.startTicket(nextState, cwd, nextTicket.id);
  return nextState;
}

export function restackTicket(
  state: DeliveryState,
  cwd: string,
  ticketId: string | undefined,
  dependencies: {
    buildPullRequestBody: (state: DeliveryState, ticket: TicketState) => string;
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
      body: dependencies.buildPullRequestBody(nextState, updatedTarget),
    });
  }

  return nextState;
}
