import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

export type TicketStatus =
  | 'pending'
  | 'in_progress'
  | 'in_review'
  | 'review_fetched'
  | 'reviewed'
  | 'done';

export type ReviewOutcome = 'clean' | 'needs_patch' | 'patched';

export type Phase02TicketState = {
  id: string;
  title: string;
  slug: string;
  ticketFile: string;
  status: TicketStatus;
  branch: string;
  baseBranch: string;
  worktreePath: string;
  prNumber?: number;
  prUrl?: string;
  prOpenedAt?: string;
  reviewArtifactPath?: string;
  reviewFetchedAt?: string;
  reviewOutcome?: ReviewOutcome;
  reviewNote?: string;
};

export type Phase02State = {
  phase: 'phase-02';
  planPath: string;
  statePath: string;
  reviewWaitMinutes: number;
  tickets: Phase02TicketState[];
};

type TicketDefinition = {
  id: string;
  title: string;
  slug: string;
  ticketFile: string;
};

const PHASE02_PLAN_PATH = 'docs/02-delivery/phase-02/implementation-plan.md';
const STATE_FILE_PATH = '.codex/phase02/state.json';
const REVIEWS_DIR_PATH = '.codex/phase02/reviews';
const REVIEW_WAIT_MINUTES = 5;

export async function runPhase02Orchestrator(
  argv: string[],
  cwd: string,
): Promise<number> {
  const [command, ...rest] = argv;

  if (!command) {
    console.error(getUsage());
    return 1;
  }

  try {
    const state = await loadState(cwd);

    switch (command) {
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
        const ticketId = rest[0];
        const nextState = await startTicket(state, cwd, ticketId);
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState));
        return 0;
      }
      case 'open-pr': {
        const ticketId = rest[0];
        const nextState = await openPullRequest(state, cwd, ticketId);
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState));
        return 0;
      }
      case 'fetch-review': {
        const ticketId = rest[0];
        const nextState = await fetchReview(state, cwd, ticketId);
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState));
        return 0;
      }
      case 'record-review': {
        const [ticketId, outcome, ...noteParts] = rest;

        if (
          !ticketId ||
          (outcome !== 'clean' &&
            outcome !== 'needs_patch' &&
            outcome !== 'patched')
        ) {
          throw new Error(
            'Usage: bun run phase02 record-review <ticket-id> <clean|needs_patch|patched> [note]',
          );
        }

        const nextState = recordReview(
          state,
          ticketId,
          outcome,
          noteParts.join(' ').trim() || undefined,
        );
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState));
        return 0;
      }
      case 'advance': {
        const startNext = !rest.includes('--no-start-next');
        const nextState = await advanceToNextTicket(state, cwd, startNext);
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
    console.error(formatError(error));
    return 1;
  }
}

export function parsePhase02Plan(markdown: string): TicketDefinition[] {
  const ticketOrderSection = markdown.match(
    /## Ticket Order\s+([\s\S]*?)\n## Ticket Files/,
  )?.[1];
  const ticketFilesSection = markdown.match(
    /## Ticket Files\s+([\s\S]*?)\n## Exit Condition/,
  )?.[1];

  if (!ticketOrderSection || !ticketFilesSection) {
    throw new Error(`Could not parse ticket order from ${PHASE02_PLAN_PATH}.`);
  }

  const titles = [...ticketOrderSection.matchAll(/`(P2\.\d+)\s+([^`]+)`/g)].map(
    (match) => ({
      id: match[1] ?? '',
      title: match[2] ?? '',
    }),
  );
  const files = [...ticketFilesSection.matchAll(/`([^`]+)`/g)].map(
    (match) => match[1] ?? '',
  );

  if (titles.length === 0 || titles.length !== files.length) {
    throw new Error(
      `Ticket order and ticket file sections are inconsistent in ${PHASE02_PLAN_PATH}.`,
    );
  }

  return titles.map((ticket, index) => ({
    ...ticket,
    slug: slugify(ticket.title),
    ticketFile: `docs/02-delivery/phase-02/${files[index]}`,
  }));
}

export function syncStateWithPlan(
  existing: Phase02State | undefined,
  ticketDefinitions: TicketDefinition[],
  cwd: string,
): Phase02State {
  const existingById = new Map(
    existing?.tickets.map((ticket) => [ticket.id, ticket]),
  );

  return {
    phase: 'phase-02',
    planPath: PHASE02_PLAN_PATH,
    statePath: STATE_FILE_PATH,
    reviewWaitMinutes: REVIEW_WAIT_MINUTES,
    tickets: ticketDefinitions.map((definition, index) => {
      const previous = existingById.get(definition.id);
      const baseBranch =
        index === 0
          ? 'main'
          : (existingById.get(ticketDefinitions[index - 1]?.id ?? '')?.branch ??
            deriveBranchName(ticketDefinitions[index - 1]!));

      return {
        id: definition.id,
        title: definition.title,
        slug: definition.slug,
        ticketFile: definition.ticketFile,
        status: previous?.status ?? 'pending',
        branch: previous?.branch ?? deriveBranchName(definition),
        baseBranch: previous?.baseBranch ?? baseBranch,
        worktreePath:
          previous?.worktreePath ?? deriveWorktreePath(cwd, definition.id),
        prNumber: previous?.prNumber,
        prUrl: previous?.prUrl,
        prOpenedAt: previous?.prOpenedAt,
        reviewArtifactPath: previous?.reviewArtifactPath,
        reviewFetchedAt: previous?.reviewFetchedAt,
        reviewOutcome: previous?.reviewOutcome,
        reviewNote: previous?.reviewNote,
      };
    }),
  };
}

export function findNextPendingTicket(
  state: Phase02State,
): Phase02TicketState | undefined {
  return state.tickets.find((ticket) => ticket.status === 'pending');
}

export function canAdvanceTicket(ticket: Phase02TicketState): boolean {
  return (
    ticket.status === 'reviewed' &&
    (ticket.reviewOutcome === 'clean' || ticket.reviewOutcome === 'patched')
  );
}

export function deriveBranchName(
  definition: Pick<TicketDefinition, 'id' | 'slug'>,
): string {
  return `codex/${definition.id.toLowerCase().replace('.', '-')}-${definition.slug}`;
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
  if (process.env.QODO_REVIEW_FETCHER) {
    return process.env.QODO_REVIEW_FETCHER;
  }

  const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
  return join(
    codexHome,
    'skills/qodo-pr-review/scripts/fetch_qodo_pr_comments.sh',
  );
}

function getUsage(): string {
  return [
    'Usage: bun run phase02 <command>',
    '',
    'Commands:',
    '  sync',
    '  status',
    '  start [ticket-id]',
    '  open-pr [ticket-id]',
    '  fetch-review [ticket-id]',
    '  record-review <ticket-id> <clean|needs_patch|patched> [note]',
    '  advance [--no-start-next]',
  ].join('\n');
}

async function loadState(cwd: string): Promise<Phase02State> {
  const planMarkdown = await readFile(resolve(cwd, PHASE02_PLAN_PATH), 'utf8');
  const ticketDefinitions = parsePhase02Plan(planMarkdown);
  const absoluteStatePath = resolve(cwd, STATE_FILE_PATH);

  if (!existsSync(absoluteStatePath)) {
    return syncStateWithPlan(undefined, ticketDefinitions, cwd);
  }

  const existing = JSON.parse(
    await readFile(absoluteStatePath, 'utf8'),
  ) as Phase02State;

  return syncStateWithPlan(existing, ticketDefinitions, cwd);
}

async function saveState(cwd: string, state: Phase02State): Promise<void> {
  const absoluteStatePath = resolve(cwd, STATE_FILE_PATH);
  await mkdir(dirname(absoluteStatePath), { recursive: true });
  await writeFile(
    absoluteStatePath,
    JSON.stringify(state, null, 2) + '\n',
    'utf8',
  );
}

async function startTicket(
  state: Phase02State,
  cwd: string,
  ticketId?: string,
): Promise<Phase02State> {
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
    throw new Error('No pending phase-02 ticket found.');
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
    runProcess(cwd, [
      'git',
      'worktree',
      'add',
      target.worktreePath,
      '-b',
      target.branch,
      target.baseBranch,
    ]);
  }

  return {
    ...state,
    tickets: state.tickets.map((ticket) =>
      ticket.id === target.id ? { ...ticket, status: 'in_progress' } : ticket,
    ),
  };
}

async function openPullRequest(
  state: Phase02State,
  cwd: string,
  ticketId?: string,
): Promise<Phase02State> {
  const target =
    (ticketId
      ? state.tickets.find((ticket) => ticket.id === ticketId)
      : state.tickets.find((ticket) => ticket.status === 'in_progress')) ??
    undefined;

  if (!target) {
    throw new Error('No in-progress ticket found to open as a PR.');
  }

  runProcess(target.worktreePath, [
    'git',
    'push',
    '-u',
    'origin',
    target.branch,
  ]);

  const title = `phase02: ${target.title} [${target.id}]`;
  const body = [
    '## Summary',
    '',
    `- phase-02 ticket: \`${target.id} ${target.title}\``,
    `- ticket file: \`${target.ticketFile}\``,
    `- stacked base branch: \`${target.baseBranch}\``,
    '',
    '## Verification',
    '',
    '- `bun run ci`',
  ].join('\n');

  const prUrl = runProcess(target.worktreePath, [
    'gh',
    'pr',
    'create',
    '--base',
    target.baseBranch,
    '--head',
    target.branch,
    '--title',
    title,
    '--body',
    body,
  ]).trim();

  const prNumber = parsePullRequestNumber(prUrl);
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
            prOpenedAt: now,
          }
        : ticket,
    ),
  };
}

async function fetchReview(
  state: Phase02State,
  cwd: string,
  ticketId?: string,
): Promise<Phase02State> {
  const target =
    (ticketId
      ? state.tickets.find((ticket) => ticket.id === ticketId)
      : state.tickets.find((ticket) => ticket.status === 'in_review')) ??
    undefined;

  if (!target || !target.prNumber) {
    throw new Error('No in-review ticket with an open PR was found.');
  }

  const openedAt = Date.parse(target.prOpenedAt ?? '');
  if (!Number.isNaN(openedAt)) {
    const dueAt = openedAt + REVIEW_WAIT_MINUTES * 60_000;
    const remaining = dueAt - Date.now();

    if (remaining > 0) {
      await sleep(remaining);
    }
  }

  const fetcher = resolveReviewFetcher();
  const artifactPath = resolve(cwd, REVIEWS_DIR_PATH, `${target.id}-qodo.txt`);
  await mkdir(dirname(artifactPath), { recursive: true });
  const output = runProcess(target.worktreePath, [
    fetcher,
    String(target.prNumber),
  ]);
  await writeFile(artifactPath, output, 'utf8');

  return {
    ...state,
    tickets: state.tickets.map((ticket) =>
      ticket.id === target.id
        ? {
            ...ticket,
            status: 'review_fetched',
            reviewArtifactPath: relativeToRepo(cwd, artifactPath),
            reviewFetchedAt: new Date().toISOString(),
          }
        : ticket,
    ),
  };
}

function recordReview(
  state: Phase02State,
  ticketId: string,
  outcome: ReviewOutcome,
  note?: string,
): Phase02State {
  const target = state.tickets.find((ticket) => ticket.id === ticketId);

  if (!target) {
    throw new Error(`Unknown ticket ${ticketId}.`);
  }

  if (target.status !== 'review_fetched' && target.status !== 'in_review') {
    throw new Error(
      `Ticket ${ticketId} must be in review before recording an outcome.`,
    );
  }

  return {
    ...state,
    tickets: state.tickets.map((ticket) =>
      ticket.id === ticketId
        ? {
            ...ticket,
            status: 'reviewed',
            reviewOutcome: outcome,
            reviewNote: note,
          }
        : ticket,
    ),
  };
}

async function advanceToNextTicket(
  state: Phase02State,
  cwd: string,
  startNext: boolean,
): Promise<Phase02State> {
  const current = state.tickets.find((ticket) => ticket.status === 'reviewed');

  if (!current) {
    throw new Error('No reviewed ticket is ready to advance.');
  }

  if (!canAdvanceTicket(current)) {
    throw new Error(
      `Ticket ${current.id} cannot advance until review is recorded as clean or patched.`,
    );
  }

  let nextState: Phase02State = {
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

function parsePullRequestNumber(prUrl: string): number {
  const match = prUrl.match(/\/pull\/(\d+)$/);

  if (!match?.[1]) {
    throw new Error(`Could not parse PR number from ${prUrl}.`);
  }

  return Number(match[1]);
}

function runProcess(cwd: string, cmd: string[]): string {
  const result = Bun.spawnSync(cmd, {
    cwd,
    stderr: 'pipe',
    stdout: 'pipe',
    env: process.env,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      [
        `Command failed: ${cmd.join(' ')}`,
        new TextDecoder().decode(result.stderr).trim(),
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return new TextDecoder().decode(result.stdout);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function relativeToRepo(cwd: string, absolutePath: string): string {
  return resolve(absolutePath).replace(`${resolve(cwd)}/`, '');
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

function formatStatus(state: Phase02State): string {
  return [
    'Phase 02 Orchestrator',
    `plan=${state.planPath}`,
    `state=${state.statePath}`,
    `review_wait_minutes=${state.reviewWaitMinutes}`,
    '',
    ...state.tickets.map((ticket) =>
      [
        `${ticket.id} | status=${ticket.status} | branch=${ticket.branch} | base=${ticket.baseBranch}`,
        `title=${ticket.title}`,
        `worktree=${ticket.worktreePath}`,
        ticket.prUrl ? `pr=${ticket.prUrl}` : undefined,
        ticket.reviewArtifactPath
          ? `review_artifact=${ticket.reviewArtifactPath}`
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

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
