import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
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
  handoffPath?: string;
  handoffGeneratedAt?: string;
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
  handoffsDirPath: string;
  reviewWaitMinutes: number;
  tickets: TicketState[];
};

export type OrchestratorOptions = {
  planPath: string;
  planKey: string;
  statePath: string;
  reviewsDirPath: string;
  handoffsDirPath: string;
  reviewWaitMinutes: number;
};

type PullRequestSummary = {
  number: number;
  url: string;
  state: string;
};

type PullRequestDetail = PullRequestSummary & {
  baseRefName?: string;
  mergedAt?: string | null;
};

type BranchMatch = {
  branch: string;
  source: 'ticket-id' | 'derived';
};

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
      reviewWaitMinutes: number;
      dueAt: string;
    }
  | {
      kind: 'review_recorded';
      planKey: string;
      ticketId: string;
      ticketTitle: string;
      branch: string;
      outcome: ReviewOutcome;
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

const DEFAULT_REVIEW_WAIT_MINUTES = 5;

export async function runDeliveryOrchestrator(
  argv: string[],
  cwd: string,
): Promise<number> {
  const notifier = resolveNotifier();
  let parsed:
    | {
        command: string;
        positionals: string[];
        flags: Set<string>;
        planPath?: string;
      }
    | undefined;

  try {
    parsed = parseCliArgs(argv);
    const options = await resolveOptionsForCommand(
      cwd,
      parsed.command,
      parsed.planPath,
    );
    parsed = {
      ...parsed,
      planPath: options.planPath,
    };
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
    handoffsDirPath: options.handoffsDirPath,
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
        handoffPath: previous?.handoffPath ?? inferredTicket?.handoffPath,
        handoffGeneratedAt:
          previous?.handoffGeneratedAt ?? inferredTicket?.handoffGeneratedAt,
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
  if (!input.planPath) {
    throw new Error(
      'Pass --plan <plan-path>. Phase aliases are no longer supported.',
    );
  }

  const planPath = normalizeRepoPath(input.planPath);
  const planKey = derivePlanKey(planPath);

  return {
    planPath,
    planKey,
    statePath: `.codex/delivery/${planKey}/state.json`,
    reviewsDirPath: `.codex/delivery/${planKey}/reviews`,
    handoffsDirPath: `.codex/delivery/${planKey}/handoffs`,
    reviewWaitMinutes: DEFAULT_REVIEW_WAIT_MINUTES,
  };
}

function parseCliArgs(argv: string[]): {
  command: string;
  positionals: string[];
  flags: Set<string>;
  planPath?: string;
} {
  let planPath: string | undefined;
  const flags = new Set<string>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--plan') {
      planPath = argv[index + 1];
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
    'Usage: bun run deliver --plan <plan-path> <command>',
    '',
    'Commands:',
    '  sync',
    '  status',
    '  start [ticket-id]',
    '  open-pr [ticket-id]',
    '  fetch-review [ticket-id]',
    '  record-review <ticket-id> <clean|needs_patch|patched> [note]',
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
    : state.tickets.find((ticket) => ticket.status === 'in_review');
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

export async function inferPlanPathFromBranch(
  cwd: string,
  branch: string,
): Promise<string> {
  const planPaths = await listImplementationPlans(cwd);
  const planIndex: Array<{ planPath: string; tickets: TicketDefinition[] }> =
    [];

  for (const planPath of planPaths) {
    const markdown = await readFile(resolve(cwd, planPath), 'utf8');
    planIndex.push({
      planPath,
      tickets: parsePlan(markdown, planPath),
    });
  }

  return resolvePlanPathForBranch(planIndex, branch);
}

export function resolvePlanPathForBranch(
  planIndex: Array<{ planPath: string; tickets: TicketDefinition[] }>,
  branch: string,
): string {
  const matches: string[] = [];

  for (const plan of planIndex) {
    if (
      plan.tickets.some(
        (ticket) => findExistingBranch([branch], ticket)?.branch === branch,
      )
    ) {
      matches.push(plan.planPath);
    }
  }

  if (matches.length === 1) {
    return matches[0]!;
  }

  if (matches.length === 0) {
    throw new Error(
      `Could not infer a delivery plan for ${branch}. Pass --plan <plan-path>.`,
    );
  }

  throw new Error(
    `Multiple delivery plans match ${branch}: ${matches.join(', ')}. Pass --plan <plan-path>.`,
  );
}

async function listImplementationPlans(cwd: string): Promise<string[]> {
  const deliveryRoot = resolve(cwd, 'docs/02-delivery');
  const entries = await readdir(deliveryRoot, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      relativeToRepo(
        cwd,
        resolve(deliveryRoot, entry.name, 'implementation-plan.md'),
      ),
    )
    .filter((planPath) => existsSync(resolve(cwd, planPath)))
    .sort();
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
  const pullRequests = listPullRequests(cwd);
  const branchCatalog = [
    ...new Set([...localBranches, ...remoteBranches, ...pullRequests.keys()]),
  ];

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
    const pr =
      pullRequests.get(branch) ??
      findPullRequestForTicket(pullRequests, definition);
    const nextBranch = ticketDefinitions[index + 1]
      ? (findExistingBranch(branchCatalog, ticketDefinitions[index + 1]!)
          ?.branch ?? deriveBranchName(ticketDefinitions[index + 1]!))
      : undefined;
    const nextBranchExists =
      nextBranch !== undefined && branchCatalog.includes(nextBranch);

    let status: TicketStatus = 'pending';

    if (branchExists && nextBranchExists) {
      status = 'done';
    } else if (pr) {
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
      handoffPath: undefined,
      handoffGeneratedAt: undefined,
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
    handoffsDirPath: options.handoffsDirPath,
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
    'open',
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

function findPullRequestForTicket(
  pullRequests: Map<string, PullRequestSummary>,
  definition: Pick<TicketDefinition, 'id'>,
): PullRequestSummary | undefined {
  const ticketIdToken = definition.id.toLowerCase().replace('.', '-');

  for (const [headRefName, summary] of pullRequests.entries()) {
    const normalized = headRefName.toLowerCase();

    if (
      normalized.includes(`/${ticketIdToken}`) ||
      normalized.includes(`-${ticketIdToken}`) ||
      normalized.endsWith(ticketIdToken)
    ) {
      return summary;
    }
  }

  return undefined;
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

  ensureBranchPushed(target.worktreePath, target.branch);

  const title = buildPullRequestTitle(
    target,
    readLatestCommitSubject(target.worktreePath),
  );
  const body = buildPullRequestBody(state, target);
  const existingPullRequest = findOpenPullRequest(
    target.worktreePath,
    target.branch,
  );
  let prUrl: string;
  let prNumber: number;

  if (existingPullRequest) {
    runProcess(target.worktreePath, [
      'gh',
      'pr',
      'edit',
      String(existingPullRequest.number),
      '--title',
      title,
      '--body',
      body,
    ]);
    prUrl = existingPullRequest.url;
    prNumber = existingPullRequest.number;
  } else {
    prUrl = runProcess(target.worktreePath, [
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
  const target = findTicketById(state, ticketId);

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

  runProcess(cwd, ['git', 'fetch', 'origin']);

  const targetIndex = state.tickets.findIndex(
    (ticket) => ticket.id === target.id,
  );
  const previous = targetIndex > 0 ? state.tickets[targetIndex - 1] : undefined;

  let nextBaseBranch = 'main';
  let rebaseTarget = 'origin/main';

  if (previous) {
    const oldBase = runProcess(cwd, [
      'git',
      'merge-base',
      target.branch,
      previous.branch,
    ]).trim();

    if (!oldBase) {
      throw new Error(
        `Could not determine the shared ancestor between ${target.branch} and ${previous.branch}.`,
      );
    }

    if (!hasMergedPullRequestForBranch(cwd, previous.branch)) {
      nextBaseBranch = previous.branch;
      rebaseTarget = previous.branch;
    }

    runProcess(cwd, ['git', 'rebase', '--onto', rebaseTarget, oldBase]);
  } else {
    runProcess(cwd, ['git', 'rebase', 'origin/main']);
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
    runProcess(cwd, [
      'gh',
      'pr',
      'edit',
      String(pullRequest.number),
      '--base',
      nextBaseBranch,
      '--body',
      buildPullRequestBody(nextState, updatedTarget),
    ]);
  }

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
    'id' | 'title' | 'branch' | 'reviewOutcome' | 'reviewNote' | 'prUrl'
  >,
): DeliveryNotificationEvent | undefined {
  if (!ticket.reviewOutcome) {
    return undefined;
  }

  return {
    kind: 'review_recorded',
    planKey: state.planKey,
    ticketId: ticket.id,
    ticketTitle: ticket.title,
    branch: ticket.branch,
    outcome: ticket.reviewOutcome,
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
    reviewWaitMinutes: state.reviewWaitMinutes,
    dueAt: new Date(openedAt + state.reviewWaitMinutes * 60_000).toISOString(),
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

    if (previous.reviewArtifactPath) {
      lines.push(`- Review artifact: \`${previous.reviewArtifactPath}\``);
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

  runProcess(ticket.worktreePath, [
    'gh',
    'pr',
    'edit',
    String(ticket.prNumber),
    '--body',
    buildPullRequestBody(state, ticket),
  ]);
}

function findOpenPullRequest(
  cwd: string,
  branch: string,
): PullRequestSummary | undefined {
  const stdout = runProcess(cwd, [
    'gh',
    'pr',
    'list',
    '--state',
    'open',
    '--head',
    branch,
    '--json',
    'number,url,state',
  ]);
  const parsed = JSON.parse(stdout) as Array<PullRequestSummary>;
  return parsed[0];
}

function findMergedPullRequest(
  cwd: string,
  branch: string,
): PullRequestDetail | undefined {
  const stdout = runProcess(cwd, [
    'gh',
    'pr',
    'list',
    '--state',
    'merged',
    '--head',
    branch,
    '--limit',
    '1',
    '--json',
    'number,url,state,baseRefName,mergedAt',
  ]);
  const parsed = JSON.parse(stdout) as Array<PullRequestDetail>;
  return parsed[0];
}

function hasMergedPullRequestForBranch(cwd: string, branch: string): boolean {
  return findMergedPullRequest(cwd, branch) !== undefined;
}

function readLatestCommitSubject(cwd: string): string {
  return runProcess(cwd, ['git', 'log', '-1', '--pretty=%s']).trim();
}

function readCurrentBranch(cwd: string): string {
  const branch = runProcess(cwd, ['git', 'branch', '--show-current']).trim();

  if (!branch) {
    throw new Error('Restack requires an attached branch checkout.');
  }

  return branch;
}

function ensureCleanWorktree(cwd: string): void {
  const status = runProcess(cwd, ['git', 'status', '--short']).trim();

  if (status) {
    throw new Error(
      'Restack requires a clean worktree. Commit, stash, or discard local changes first.',
    );
  }
}

function ensureBranchPushed(cwd: string, branch: string): void {
  const localSha = runGitLines(cwd, ['git', 'rev-parse', branch])[0];
  const remoteRef = runProcessResult(cwd, [
    'git',
    'ls-remote',
    '--heads',
    'origin',
    branch,
  ]);

  if (remoteRef.exitCode !== 0) {
    throw new Error(
      formatCommandFailure(
        ['git', 'ls-remote', '--heads', 'origin', branch],
        remoteRef,
      ),
    );
  }

  const remoteSha = remoteRef.stdout.trim().split(/\s+/)[0] || undefined;

  if (!remoteSha) {
    runProcess(cwd, ['git', 'push', '-u', 'origin', branch]);
    return;
  }

  if (remoteSha !== localSha) {
    runProcess(cwd, ['git', 'push', 'origin', branch]);
  }

  const upstream = runProcessResult(cwd, [
    'git',
    'branch',
    '--set-upstream-to',
    `origin/${branch}`,
    branch,
  ]);

  if (
    upstream.exitCode !== 0 &&
    !upstream.stderr.includes('is already set up to track')
  ) {
    throw new Error(
      formatCommandFailure(
        ['git', 'branch', '--set-upstream-to', `origin/${branch}`, branch],
        upstream,
      ),
    );
  }
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
    await sendTelegramMessage(
      notifier.botToken,
      notifier.chatId,
      formatNotificationMessage(cwd, event),
    );
    return undefined;
  } catch (error) {
    return `Notification warning: ${formatError(error)}`;
  }
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
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
        text,
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
  const result = runProcessResult(cwd, cmd);

  if (result.exitCode !== 0) {
    throw new Error(formatCommandFailure(cmd, result));
  }

  return result.stdout;
}

function runProcessResult(
  cwd: string,
  cmd: string[],
): {
  exitCode: number;
  stderr: string;
  stdout: string;
} {
  const result = Bun.spawnSync(cmd, {
    cwd,
    stderr: 'pipe',
    stdout: 'pipe',
    env: process.env,
  });

  return {
    exitCode: result.exitCode,
    stderr: new TextDecoder().decode(result.stderr).trim(),
    stdout: new TextDecoder().decode(result.stdout),
  };
}

function formatCommandFailure(
  cmd: string[],
  result: {
    stderr: string;
    stdout: string;
  },
): string {
  return [
    `Command failed: ${cmd.join(' ')}`,
    result.stderr.trim(),
    result.stdout.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}

function normalizeRepoPath(value: string): string {
  return value.replace(/^\.?\//, '');
}

export function derivePlanKey(planPath: string): string {
  const normalizedPlanPath = normalizeRepoPath(planPath);

  if (basename(normalizedPlanPath).toLowerCase() === 'implementation-plan.md') {
    return slugify(basename(dirname(normalizedPlanPath)));
  }

  return normalizedPlanPath
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

async function bootstrapWorktreeIfNeeded(worktreePath: string): Promise<void> {
  if (
    !existsSync(resolve(worktreePath, 'package.json')) ||
    !existsSync(resolve(worktreePath, 'bun.lock')) ||
    existsSync(resolve(worktreePath, 'node_modules'))
  ) {
    return;
  }

  runProcess(worktreePath, ['bun', 'install']);

  const packageJson = JSON.parse(
    await readFile(resolve(worktreePath, 'package.json'), 'utf8'),
  ) as {
    scripts?: Record<string, string>;
  };

  if (packageJson.scripts?.['hooks:install']) {
    runProcess(worktreePath, ['bun', 'run', 'hooks:install']);
  }
}

function formatStatus(state: DeliveryState): string {
  return [
    'Delivery Orchestrator',
    `plan_key=${state.planKey}`,
    `plan=${state.planPath}`,
    `state=${state.statePath}`,
    `handoffs=${state.handoffsDirPath}`,
    `review_wait_minutes=${state.reviewWaitMinutes}`,
    '',
    ...state.tickets.map((ticket) =>
      [
        `${ticket.id} | status=${ticket.status} | branch=${ticket.branch} | base=${ticket.baseBranch}`,
        `title=${ticket.title}`,
        `worktree=${ticket.worktreePath}`,
        ticket.handoffPath ? `handoff=${ticket.handoffPath}` : undefined,
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

function deriveRepoDisplayName(cwd: string): string {
  return basename(resolve(cwd))
    .replace(/_p\d+(_\d+)?$/, '')
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

export function formatNotificationMessage(
  cwd: string,
  event: DeliveryNotificationEvent,
): string {
  const header = `${deriveRepoDisplayName(cwd)} Delivery`;

  switch (event.kind) {
    case 'ticket_started':
      return [
        header,
        `Started ${event.planKey} ${event.ticketId}`,
        event.ticketTitle,
        `Branch: ${event.branch}`,
      ].join('\n');
    case 'pr_opened':
      return [
        header,
        `PR opened for ${event.planKey} ${event.ticketId}`,
        event.ticketTitle,
        `Branch: ${event.branch}`,
        `PR: ${event.prUrl}`,
      ].join('\n');
    case 'review_window_ready':
      return [
        header,
        `Review window started for ${event.planKey} ${event.ticketId}`,
        event.ticketTitle,
        `Branch: ${event.branch}`,
        `PR: ${event.prUrl}`,
        `Wait: ${event.reviewWaitMinutes} minutes`,
        `Due: ${event.dueAt}`,
      ].join('\n');
    case 'review_recorded':
      return [
        header,
        `Review recorded for ${event.planKey} ${event.ticketId}`,
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
        `Completed ${event.planKey} ${event.ticketId}`,
        event.ticketTitle,
        `Branch: ${event.branch}`,
        event.prUrl ? `PR: ${event.prUrl}` : undefined,
      ]
        .filter((line): line is string => line !== undefined)
        .join('\n');
    case 'run_blocked':
      return [
        header,
        `Run blocked${event.planKey ? ` for ${event.planKey}` : ''}`,
        event.command ? `Command: ${event.command}` : undefined,
        `Reason: ${event.reason}`,
      ]
        .filter((line): line is string => line !== undefined)
        .join('\n');
  }
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

  const dueAt = new Date(
    openedAt + state.reviewWaitMinutes * 60_000,
  ).toISOString();

  return [
    'AI Review Window',
    `- wait window: ${state.reviewWaitMinutes} minutes`,
    `- review due at: ${dueAt}`,
    `- if no \`qodo-code-review\` feedback appears by then, record the review as \`clean\` and continue`,
  ].join('\n');
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
