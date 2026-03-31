import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
  prNumber?: number;
  prUrl?: string;
  prOpenedAt?: string;
  reviewArtifactPath?: string;
  reviewFetchedAt?: string;
  reviewOutcome?: ReviewOutcome;
  reviewNote?: string;
};

export type DeliveryState = {
  planKey: string;
  planPath: string;
  statePath: string;
  reviewsDirPath: string;
  reviewWaitMinutes: number;
  tickets: TicketState[];
};

export type OrchestratorOptions = {
  planPath: string;
  planKey: string;
  statePath: string;
  reviewsDirPath: string;
  reviewWaitMinutes: number;
};

type PullRequestSummary = {
  number: number;
  url: string;
  state: string;
};

type BranchMatch = {
  branch: string;
  source: 'ticket-id' | 'derived';
};

const DEFAULT_REVIEW_WAIT_MINUTES = 5;

export async function runDeliveryOrchestrator(
  argv: string[],
  cwd: string,
): Promise<number> {
  try {
    const parsed = parseCliArgs(argv);
    const state = await loadState(cwd, parsed.options);

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
        return 0;
      }
      case 'open-pr': {
        const nextState = await openPullRequest(
          state,
          cwd,
          parsed.positionals[0],
        );
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState));
        return 0;
      }
      case 'fetch-review': {
        const nextState = await fetchReview(state, cwd, parsed.positionals[0]);
        await saveState(cwd, nextState);
        console.log(formatStatus(nextState));
        return 0;
      }
      case 'record-review': {
        const [ticketId, outcome, ...noteParts] = parsed.positionals;

        if (
          !ticketId ||
          (outcome !== 'clean' &&
            outcome !== 'needs_patch' &&
            outcome !== 'patched')
        ) {
          throw new Error(
            'Usage: bun run deliver --plan <plan-path> record-review <ticket-id> <clean|needs_patch|patched> [note]',
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
        return 0;
      }
      case 'advance': {
        const startNext = !parsed.flags.has('no-start-next');
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

export function parsePlan(
  markdown: string,
  planPath: string,
): TicketDefinition[] {
  const ticketOrderSection = markdown.match(
    /## Ticket Order\s+([\s\S]*?)\n## Ticket Files/,
  )?.[1];
  const ticketFilesSection = markdown.match(
    /## Ticket Files\s+([\s\S]*?)\n## Exit Condition/,
  )?.[1];

  if (!ticketOrderSection || !ticketFilesSection) {
    throw new Error(`Could not parse ticket order from ${planPath}.`);
  }

  const titles = [
    ...ticketOrderSection.matchAll(/`([A-Z0-9.]+)\s+([^`]+)`/g),
  ].map((match) => ({
    id: match[1] ?? '',
    title: match[2] ?? '',
  }));
  const files = [...ticketFilesSection.matchAll(/`([^`]+)`/g)].map(
    (match) => match[1] ?? '',
  );

  if (titles.length === 0 || titles.length !== files.length) {
    throw new Error(
      `Ticket order and ticket file sections are inconsistent in ${planPath}.`,
    );
  }

  const planDir = dirname(planPath);

  return titles.map((ticket, index) => ({
    ...ticket,
    slug: slugify(ticket.title),
    ticketFile: join(planDir, files[index] ?? ''),
  }));
}

export function syncStateWithPlan(
  existing: DeliveryState | undefined,
  ticketDefinitions: TicketDefinition[],
  cwd: string,
  options: OrchestratorOptions,
  inferred?: DeliveryState,
): DeliveryState {
  const existingById = new Map(
    existing?.tickets.map((ticket) => [ticket.id, ticket]),
  );
  const inferredById = new Map(
    inferred?.tickets.map((ticket) => [ticket.id, ticket]),
  );

  return {
    planKey: options.planKey,
    planPath: options.planPath,
    statePath: options.statePath,
    reviewsDirPath: options.reviewsDirPath,
    reviewWaitMinutes: options.reviewWaitMinutes,
    tickets: ticketDefinitions.map((definition, index) => {
      const previous = existingById.get(definition.id);
      const inferredTicket = inferredById.get(definition.id);
      const previousTicket = ticketDefinitions[index - 1];
      const resolvedBranch = selectBranchValue(
        previous?.branch,
        inferredTicket?.branch,
        deriveBranchName(definition),
      );
      const inferredBaseBranch =
        index === 0
          ? 'main'
          : selectBranchValue(
              existingById.get(previousTicket?.id ?? '')?.branch,
              inferredById.get(previousTicket?.id ?? '')?.branch,
              deriveBranchName(previousTicket!),
            );

      return {
        id: definition.id,
        title: definition.title,
        slug: definition.slug,
        ticketFile: definition.ticketFile,
        status: selectStatusValue(previous?.status, inferredTicket?.status),
        branch: resolvedBranch,
        baseBranch:
          index === 0
            ? 'main'
            : selectBranchValue(
                previous?.baseBranch,
                inferredTicket?.baseBranch,
                inferredBaseBranch,
              ),
        worktreePath:
          previous?.worktreePath ??
          inferredTicket?.worktreePath ??
          deriveWorktreePath(cwd, definition.id),
        prNumber: previous?.prNumber ?? inferredTicket?.prNumber,
        prUrl: previous?.prUrl ?? inferredTicket?.prUrl,
        prOpenedAt: previous?.prOpenedAt ?? inferredTicket?.prOpenedAt,
        reviewArtifactPath:
          previous?.reviewArtifactPath ?? inferredTicket?.reviewArtifactPath,
        reviewFetchedAt:
          previous?.reviewFetchedAt ?? inferredTicket?.reviewFetchedAt,
        reviewOutcome: previous?.reviewOutcome ?? inferredTicket?.reviewOutcome,
        reviewNote: previous?.reviewNote ?? inferredTicket?.reviewNote,
      };
    }),
  };
}

function selectStatusValue(
  currentStatus: TicketStatus | undefined,
  inferredStatus: TicketStatus | undefined,
): TicketStatus {
  if (!currentStatus) {
    return inferredStatus ?? 'pending';
  }

  if (!inferredStatus) {
    return currentStatus;
  }

  return statusRank(inferredStatus) > statusRank(currentStatus)
    ? inferredStatus
    : currentStatus;
}

function statusRank(status: TicketStatus): number {
  switch (status) {
    case 'pending':
      return 0;
    case 'in_progress':
      return 1;
    case 'in_review':
      return 2;
    case 'review_fetched':
      return 3;
    case 'reviewed':
      return 4;
    case 'done':
      return 5;
  }
}

function selectBranchValue(
  currentBranch: string | undefined,
  inferredBranch: string | undefined,
  fallbackBranch: string,
): string {
  if (inferredBranch) {
    return inferredBranch;
  }

  return currentBranch ?? fallbackBranch;
}

export function findNextPendingTicket(
  state: DeliveryState,
): TicketState | undefined {
  return state.tickets.find((ticket) => ticket.status === 'pending');
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

export function createOptions(input: {
  phase?: string;
  planPath?: string;
}): OrchestratorOptions {
  const alias = resolvePhaseAlias(input.phase);
  const planPath = normalizeRepoPath(input.planPath ?? alias.planPath);
  const planKey = alias.planKey ?? derivePlanKey(planPath);

  return {
    planPath,
    planKey,
    statePath: `.codex/delivery/${planKey}/state.json`,
    reviewsDirPath: `.codex/delivery/${planKey}/reviews`,
    reviewWaitMinutes: DEFAULT_REVIEW_WAIT_MINUTES,
  };
}

function resolvePhaseAlias(phase?: string): {
  planPath: string;
  planKey?: string;
} {
  if (!phase) {
    return {
      planPath: 'docs/02-delivery/phase-02/implementation-plan.md',
      planKey: 'phase-02',
    };
  }

  if (phase === 'phase-02') {
    return {
      planPath: 'docs/02-delivery/phase-02/implementation-plan.md',
      planKey: 'phase-02',
    };
  }

  throw new Error(`Unknown phase alias "${phase}". Pass --plan instead.`);
}

function parseCliArgs(argv: string[]): {
  command: string;
  positionals: string[];
  flags: Set<string>;
  options: OrchestratorOptions;
} {
  let phase: string | undefined;
  let planPath: string | undefined;
  const flags = new Set<string>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--phase') {
      phase = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === '--plan') {
      planPath = argv[index + 1];
      index += 1;
      continue;
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
    options: createOptions({ phase, planPath }),
  };
}

function getUsage(): string {
  return [
    'Usage: bun run deliver --phase <phase-key> <command>',
    '   or: bun run deliver --plan <plan-path> <command>',
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

async function loadState(
  cwd: string,
  options: OrchestratorOptions,
): Promise<DeliveryState> {
  const planMarkdown = await readFile(resolve(cwd, options.planPath), 'utf8');
  const ticketDefinitions = parsePlan(planMarkdown, options.planPath);
  const absoluteStatePath = resolve(cwd, options.statePath);
  const inferred = inferStateFromRepo(cwd, ticketDefinitions, options);

  if (!existsSync(absoluteStatePath)) {
    return syncStateWithPlan(
      undefined,
      ticketDefinitions,
      cwd,
      options,
      inferred,
    );
  }

  const existing = JSON.parse(
    await readFile(absoluteStatePath, 'utf8'),
  ) as DeliveryState;

  return syncStateWithPlan(existing, ticketDefinitions, cwd, options, inferred);
}

async function saveState(cwd: string, state: DeliveryState): Promise<void> {
  const absoluteStatePath = resolve(cwd, state.statePath);
  await mkdir(dirname(absoluteStatePath), { recursive: true });
  await writeFile(
    absoluteStatePath,
    JSON.stringify(state, null, 2) + '\n',
    'utf8',
  );
}

function inferStateFromRepo(
  cwd: string,
  ticketDefinitions: TicketDefinition[],
  options: OrchestratorOptions,
): DeliveryState {
  const remoteBranches = runGitLines(cwd, [
    'git',
    'branch',
    '-r',
    '--format=%(refname:short)',
  ]).map((line) => line.replace(/^origin\//, ''));
  const localBranches = runGitLines(cwd, [
    'git',
    'branch',
    '--format=%(refname:short)',
  ]);
  const branchCatalog = [...new Set([...localBranches, ...remoteBranches])];
  const pullRequests = listPullRequests(cwd);

  const tickets = ticketDefinitions.map((definition, index) => {
    const branch =
      findExistingBranch(branchCatalog, definition)?.branch ??
      deriveBranchName(definition);
    const baseBranch =
      index === 0
        ? 'main'
        : (findExistingBranch(branchCatalog, ticketDefinitions[index - 1]!)
            ?.branch ?? deriveBranchName(ticketDefinitions[index - 1]!));
    const branchExists = branchCatalog.includes(branch);
    const pr = pullRequests.get(branch);
    const nextBranch = ticketDefinitions[index + 1]
      ? (findExistingBranch(branchCatalog, ticketDefinitions[index + 1]!)
          ?.branch ?? deriveBranchName(ticketDefinitions[index + 1]!))
      : undefined;
    const nextBranchExists =
      nextBranch !== undefined && branchCatalog.includes(nextBranch);

    let status: TicketStatus = 'pending';

    if (branchExists && nextBranchExists) {
      status = 'done';
    } else if (branchExists && pr) {
      status = 'in_review';
    } else if (branchExists) {
      status = 'in_progress';
    }

    return {
      ...definition,
      status,
      branch,
      baseBranch,
      worktreePath: deriveWorktreePath(cwd, definition.id),
      prNumber: pr?.number,
      prUrl: pr?.url,
      prOpenedAt: undefined,
      reviewArtifactPath: undefined,
      reviewFetchedAt: undefined,
      reviewOutcome: undefined,
      reviewNote: undefined,
    };
  });

  return {
    planKey: options.planKey,
    planPath: options.planPath,
    statePath: options.statePath,
    reviewsDirPath: options.reviewsDirPath,
    reviewWaitMinutes: options.reviewWaitMinutes,
    tickets,
  };
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
      branch: preferCodexBranch(ticketIdMatches),
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

function listPullRequests(cwd: string): Map<string, PullRequestSummary> {
  const stdout = runProcess(cwd, [
    'gh',
    'pr',
    'list',
    '--state',
    'all',
    '--limit',
    '100',
    '--json',
    'number,url,headRefName,state',
  ]);
  const parsed = JSON.parse(stdout) as Array<{
    number: number;
    url: string;
    headRefName: string;
    state: string;
  }>;

  return new Map(
    parsed.map((pr) => [
      pr.headRefName,
      {
        number: pr.number,
        url: pr.url,
        state: pr.state,
      } satisfies PullRequestSummary,
    ]),
  );
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
  state: DeliveryState,
  cwd: string,
  ticketId?: string,
): Promise<DeliveryState> {
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

  const title = `${state.planKey}: ${target.title} [${target.id}]`;
  const body = buildPullRequestBody(state, target);

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
  state: DeliveryState,
  cwd: string,
  ticketId?: string,
): Promise<DeliveryState> {
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
    const dueAt = openedAt + state.reviewWaitMinutes * 60_000;
    const remaining = dueAt - Date.now();

    if (remaining > 0) {
      await sleep(remaining);
    }
  }

  const fetcher = resolveReviewFetcher();
  const artifactPath = resolve(
    cwd,
    state.reviewsDirPath,
    `${target.id}-qodo.txt`,
  );
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

async function recordReview(
  state: DeliveryState,
  cwd: string,
  ticketId: string,
  outcome: ReviewOutcome,
  note?: string,
): Promise<DeliveryState> {
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

function runGitLines(cwd: string, cmd: string[]): string[] {
  return runProcess(cwd, cmd)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function preferCodexBranch(branches: string[]): string {
  return branches.find((branch) => branch.startsWith('codex/')) ?? branches[0]!;
}

export function buildPullRequestBody(
  state: DeliveryState,
  ticket: Pick<
    TicketState,
    | 'id'
    | 'title'
    | 'ticketFile'
    | 'baseBranch'
    | 'reviewOutcome'
    | 'reviewNote'
  >,
): string {
  const lines = [
    '## Summary',
    '',
    `- delivery ticket: \`${ticket.id} ${ticket.title}\``,
    `- ticket file: \`${ticket.ticketFile}\``,
    `- stacked base branch: \`${ticket.baseBranch}\``,
  ];

  if (ticket.reviewOutcome) {
    lines.push('', '## AI Review Follow-Up', '');

    if (ticket.reviewOutcome === 'clean') {
      lines.push(
        '- `qodo-code-review` triage found no prudent follow-up changes.',
      );
    }

    if (ticket.reviewOutcome === 'needs_patch') {
      lines.push(
        '- `qodo-code-review` triage found actionable follow-up work that still needs patching.',
      );
    }

    if (ticket.reviewOutcome === 'patched') {
      lines.push(
        '- `qodo-code-review` triage led to prudent follow-up patches that are now included in this branch.',
      );
    }

    if (ticket.reviewNote) {
      lines.push(`- follow-up note: ${ticket.reviewNote}`);
    }
  }

  lines.push('', '## Verification', '', '- `bun run ci`');

  return lines.join('\n');
}

function updatePullRequestBody(
  state: DeliveryState,
  ticket: TicketState,
): void {
  if (!ticket.prNumber) {
    return;
  }

  runProcess(ticket.worktreePath, [
    'gh',
    'pr',
    'edit',
    String(ticket.prNumber),
    '--body',
    buildPullRequestBody(state, ticket),
  ]);
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

function normalizeRepoPath(value: string): string {
  return value.replace(/^\.?\//, '');
}

function derivePlanKey(planPath: string): string {
  return planPath
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-md$/, '');
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

function formatStatus(state: DeliveryState): string {
  return [
    'Delivery Orchestrator',
    `plan_key=${state.planKey}`,
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
