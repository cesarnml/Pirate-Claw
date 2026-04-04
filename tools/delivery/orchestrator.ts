import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

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
  reviewNonActionSummary?: string;
  reviewOutcome?: ReviewOutcome;
  reviewNote?: string;
  reviewIncompleteAgents?: string[];
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

type PullRequestSummary = {
  baseRefName?: string;
  body?: string;
  createdAt?: string;
  headRefName?: string;
  number: number;
  title?: string;
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

const DEFAULT_REVIEW_POLL_INTERVAL_MINUTES = 2;
const DEFAULT_REVIEW_POLL_MAX_WAIT_MINUTES = 8;
const STANDALONE_AI_REVIEW_SECTION_START = '<!-- ai-review:start -->';
const STANDALONE_AI_REVIEW_SECTION_END = '<!-- ai-review:end -->';

export type AiReviewAgentState = 'started' | 'completed' | 'findings_detected';

export type AiReviewAgentResult = {
  agent: string;
  state: AiReviewAgentState;
  findingsCount?: number;
  note?: string;
};

type AiReviewCommentChannel =
  | 'issue_comment'
  | 'review_summary'
  | 'inline_review';

type AiReviewCommentKind = 'summary' | 'finding' | 'unknown';

type AiReviewComment = {
  authorLogin: string;
  authorType: string;
  body: string;
  channel: AiReviewCommentChannel;
  isOutdated?: boolean;
  isResolved?: boolean;
  kind: AiReviewCommentKind;
  line?: number;
  path?: string;
  updatedAt?: string;
  url?: string;
  vendor: string;
};

type AiReviewFetcherResult = {
  agents: AiReviewAgentResult[];
  artifactText: string;
  comments: AiReviewComment[];
  detected: boolean;
  vendors: string[];
};

type AiReviewTriagerResult = {
  actionSummary?: string;
  note: string;
  nonActionSummary?: string;
  outcome: ReviewResult;
  vendors: string[];
};

type PollReviewDependencies = {
  fetcher?: (worktreePath: string, prNumber: number) => AiReviewFetcherResult;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  triager?: (
    worktreePath: string,
    artifactJsonPath: string,
  ) => AiReviewTriagerResult;
  updatePullRequestBody?: (
    state: DeliveryState,
    ticket: TicketState,
  ) => void | Promise<void>;
};

type StandaloneAiReviewResult = {
  actionSummary?: string;
  artifactJsonPath?: string;
  artifactTextPath?: string;
  incompleteAgents?: string[];
  note: string;
  nonActionSummary?: string;
  outcome: ReviewResult;
  prNumber: number;
  prUrl: string;
  vendors: string[];
};

type StandalonePullRequest = {
  body: string;
  createdAt: string;
  headRefName: string;
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
            'Usage: bun run deliver --plan <plan-path> record-review <ticket-id> <clean|patched|operator_input_needed> [note]',
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

type GitWorktreeEntry = {
  branch?: string;
  path: string;
};

export function parseGitWorktreeList(output: string): GitWorktreeEntry[] {
  const entries: GitWorktreeEntry[] = [];
  let current: GitWorktreeEntry | undefined;

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();

    if (line.length === 0) {
      if (current) {
        entries.push(current);
        current = undefined;
      }
      continue;
    }

    if (line.startsWith('worktree ')) {
      if (current) {
        entries.push(current);
      }

      current = {
        path: line.slice('worktree '.length),
      };
      continue;
    }

    if (line.startsWith('branch ') && current) {
      current.branch = line.slice('branch '.length);
    }
  }

  if (current) {
    entries.push(current);
  }

  return entries;
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
  const worktrees = parseGitWorktreeList(
    runProcess(cwd, ['git', 'worktree', 'list', '--porcelain']),
  );

  return worktrees.find(
    (worktree) =>
      resolve(worktree.path) !== resolve(cwd) &&
      worktree.branch === 'refs/heads/main',
  )?.path;
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
    reviewPollIntervalMinutes: options.reviewPollIntervalMinutes,
    reviewPollMaxWaitMinutes: options.reviewPollMaxWaitMinutes,
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
        internalReviewCompletedAt:
          previous?.internalReviewCompletedAt ??
          inferredTicket?.internalReviewCompletedAt,
        prNumber: previous?.prNumber ?? inferredTicket?.prNumber,
        prUrl: previous?.prUrl ?? inferredTicket?.prUrl,
        prOpenedAt: previous?.prOpenedAt ?? inferredTicket?.prOpenedAt,
        reviewArtifactPath:
          previous?.reviewArtifactPath ?? inferredTicket?.reviewArtifactPath,
        reviewArtifactJsonPath:
          previous?.reviewArtifactJsonPath ??
          inferredTicket?.reviewArtifactJsonPath,
        reviewActionSummary:
          previous?.reviewActionSummary ?? inferredTicket?.reviewActionSummary,
        reviewFetchedAt:
          previous?.reviewFetchedAt ?? inferredTicket?.reviewFetchedAt,
        reviewNonActionSummary:
          previous?.reviewNonActionSummary ??
          inferredTicket?.reviewNonActionSummary,
        reviewIncompleteAgents:
          previous?.reviewIncompleteAgents ??
          inferredTicket?.reviewIncompleteAgents,
        reviewOutcome: previous?.reviewOutcome ?? inferredTicket?.reviewOutcome,
        reviewNote: previous?.reviewNote ?? inferredTicket?.reviewNote,
        reviewVendors: previous?.reviewVendors ?? inferredTicket?.reviewVendors,
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
    case 'internally_reviewed':
      return 2;
    case 'in_review':
      return 3;
    case 'needs_patch':
      return 4;
    case 'operator_input_needed':
      return 5;
    case 'reviewed':
      return 6;
    case 'done':
      return 7;
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
    statePath: `.agents/delivery/${planKey}/state.json`,
    reviewsDirPath: `.agents/delivery/${planKey}/reviews`,
    handoffsDirPath: `.agents/delivery/${planKey}/handoffs`,
    reviewPollIntervalMinutes: DEFAULT_REVIEW_POLL_INTERVAL_MINUTES,
    reviewPollMaxWaitMinutes: DEFAULT_REVIEW_POLL_MAX_WAIT_MINUTES,
  };
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
    'Usage: bun run deliver --plan <plan-path> <command>',
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

async function loadState(
  cwd: string,
  options: OrchestratorOptions,
): Promise<DeliveryState> {
  const { absoluteStatePath, inferred, ticketDefinitions } =
    await loadPlanContext(cwd, options);

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

async function loadPlanContext(
  cwd: string,
  options: OrchestratorOptions,
): Promise<{
  absoluteStatePath: string;
  inferred: DeliveryState;
  ticketDefinitions: TicketDefinition[];
}> {
  const planMarkdown = await readFile(resolve(cwd, options.planPath), 'utf8');
  const ticketDefinitions = parsePlan(planMarkdown, options.planPath);
  const absoluteStatePath = resolve(cwd, options.statePath);
  const inferred = inferStateFromRepo(cwd, ticketDefinitions, options);

  return {
    absoluteStatePath,
    inferred,
    ticketDefinitions,
  };
}

async function repairState(
  cwd: string,
  options: OrchestratorOptions,
): Promise<RepairStateResult> {
  const { absoluteStatePath, inferred, ticketDefinitions } =
    await loadPlanContext(cwd, options);
  const repairedState = syncStateWithPlan(
    undefined,
    ticketDefinitions,
    cwd,
    options,
    inferred,
  );
  const hadExistingState = existsSync(absoluteStatePath);

  if (!hadExistingState) {
    await saveState(cwd, repairedState);

    return {
      state: repairedState,
      changes: [
        'No prior state file existed; wrote clean state from repo reality.',
      ],
      hadExistingState: false,
    };
  }

  const existing = JSON.parse(
    await readFile(absoluteStatePath, 'utf8'),
  ) as DeliveryState;
  const changes = summarizeStateDifferences(existing, repairedState);
  let backupPath: string | undefined;

  if (changes.length > 0) {
    backupPath = await backupStateFile(absoluteStatePath);
  }

  await saveState(cwd, repairedState);

  return {
    state: repairedState,
    backupPath: backupPath ? relativeToRepo(cwd, backupPath) : undefined,
    changes:
      changes.length > 0
        ? changes
        : [
            'Saved state already matched repo reality; rewrote normalized state.',
          ],
    hadExistingState: true,
  };
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
      reviewArtifactJsonPath: undefined,
      reviewActionSummary: undefined,
      reviewFetchedAt: undefined,
      reviewNonActionSummary: undefined,
      reviewOutcome: undefined,
      reviewNote: undefined,
      reviewVendors: undefined,
    };
  });

  return {
    planKey: options.planKey,
    planPath: options.planPath,
    statePath: options.statePath,
    reviewsDirPath: options.reviewsDirPath,
    handoffsDirPath: options.handoffsDirPath,
    reviewPollIntervalMinutes: options.reviewPollIntervalMinutes,
    reviewPollMaxWaitMinutes: options.reviewPollMaxWaitMinutes,
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

export function summarizeStateDifferences(
  existing: DeliveryState,
  repaired: DeliveryState,
): string[] {
  const changes: string[] = [];

  if (existing.planKey !== repaired.planKey) {
    changes.push(`planKey: ${existing.planKey} -> ${repaired.planKey}`);
  }

  if (existing.planPath !== repaired.planPath) {
    changes.push(`planPath: ${existing.planPath} -> ${repaired.planPath}`);
  }

  for (const repairedTicket of repaired.tickets) {
    const existingTicket = existing.tickets.find(
      (candidate) => candidate.id === repairedTicket.id,
    );

    if (!existingTicket) {
      changes.push(`${repairedTicket.id}: missing from existing state`);
      continue;
    }

    if (existingTicket.status !== repairedTicket.status) {
      changes.push(
        `${repairedTicket.id}: status ${existingTicket.status} -> ${repairedTicket.status}`,
      );
    }

    if (existingTicket.branch !== repairedTicket.branch) {
      changes.push(
        `${repairedTicket.id}: branch ${existingTicket.branch} -> ${repairedTicket.branch}`,
      );
    }

    if (existingTicket.baseBranch !== repairedTicket.baseBranch) {
      changes.push(
        `${repairedTicket.id}: base ${existingTicket.baseBranch} -> ${repairedTicket.baseBranch}`,
      );
    }

    if (existingTicket.worktreePath !== repairedTicket.worktreePath) {
      changes.push(
        `${repairedTicket.id}: worktree ${existingTicket.worktreePath} -> ${repairedTicket.worktreePath}`,
      );
    }

    if (existingTicket.prUrl !== repairedTicket.prUrl) {
      changes.push(
        `${repairedTicket.id}: pr ${existingTicket.prUrl ?? 'none'} -> ${repairedTicket.prUrl ?? 'none'}`,
      );
    }
  }

  for (const existingTicket of existing.tickets) {
    if (
      !repaired.tickets.find((candidate) => candidate.id === existingTicket.id)
    ) {
      changes.push(
        `${existingTicket.id}: present in existing state but absent after repair`,
      );
    }
  }

  return changes;
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
        headRefName: pr.headRefName,
        number: pr.number,
        url: pr.url,
        state: pr.state,
      } satisfies PullRequestSummary,
    ]),
  );
}

function resolveStandalonePullRequest(
  cwd: string,
  prNumber?: number,
): StandalonePullRequest {
  const target = prNumber ? String(prNumber) : undefined;
  const stdout = runProcess(cwd, [
    'gh',
    'pr',
    'view',
    ...(target ? [target] : []),
    '--json',
    'number,url,title,body,headRefName,createdAt',
  ]);
  const parsed = JSON.parse(stdout) as {
    body: string;
    createdAt: string;
    headRefName: string;
    number: number;
    title: string;
    url: string;
  };

  return parsed;
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
  const sourceEnvPath = resolve(sourceWorktreePath, '.env');
  const targetEnvPath = resolve(targetWorktreePath, '.env');

  if (!existsSync(sourceEnvPath) || existsSync(targetEnvPath)) {
    return;
  }

  await copyFile(sourceEnvPath, targetEnvPath);
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
            internalReviewCompletedAt: ticket.internalReviewCompletedAt,
            prUrl,
            prNumber,
            prOpenedAt: now,
          }
        : ticket,
    ),
  };
}

export function buildReviewPollCheckMinutes(
  intervalMinutes: number,
  maxWaitMinutes: number,
): number[] {
  if (intervalMinutes <= 0 || maxWaitMinutes <= 0) {
    throw new Error('Review polling interval and max wait must be positive.');
  }

  const checks: number[] = [];

  for (
    let minute = intervalMinutes;
    minute <= maxWaitMinutes;
    minute += intervalMinutes
  ) {
    checks.push(minute);
  }

  return checks;
}

export function resolveReviewPollWindowStart(
  startedAt: string | undefined,
  now: () => number = Date.now,
): { pollWindowStartedAt: number; pollWindowStartedAtIso: string } {
  const parsed = Date.parse(startedAt ?? '');

  if (!Number.isNaN(parsed)) {
    return {
      pollWindowStartedAt: parsed,
      pollWindowStartedAtIso: new Date(parsed).toISOString(),
    };
  }

  const fallback = now();
  return {
    pollWindowStartedAt: fallback,
    pollWindowStartedAtIso: new Date(fallback).toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function parseAiReviewFetcherOutput(
  output: string,
): AiReviewFetcherResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(output);
  } catch (error) {
    throw new Error(
      `AI review fetcher must emit JSON. ${formatError(error)}\n${output.trim()}`.trim(),
      {
        cause: error,
      },
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(
      'AI review fetcher output must be a JSON object with `agents`, `detected`, `artifact_text`, `vendors`, and `comments` fields.',
    );
  }

  if (
    !Array.isArray(parsed.agents) ||
    !parsed.agents.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.agent === 'string' &&
        (entry.state === 'started' ||
          entry.state === 'completed' ||
          entry.state === 'findings_detected') &&
        (typeof entry.findingsCount === 'undefined' ||
          parseOptionalNumber(entry.findingsCount) !== undefined) &&
        (typeof entry.note === 'undefined' ||
          parseOptionalString(entry.note) !== undefined),
    ) ||
    typeof parsed.detected !== 'boolean' ||
    typeof parsed.artifact_text !== 'string' ||
    !Array.isArray(parsed.vendors) ||
    !parsed.vendors.every((value) => typeof value === 'string') ||
    !Array.isArray(parsed.comments)
  ) {
    throw new Error(
      'AI review fetcher output must be JSON with `agents`, boolean `detected`, string `artifact_text`, string[] `vendors`, and array `comments` fields.',
    );
  }

  const comments = parsed.comments.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error('AI review fetcher comments must be JSON objects.');
    }

    if (
      typeof entry.vendor !== 'string' ||
      typeof entry.channel !== 'string' ||
      typeof entry.author_login !== 'string' ||
      typeof entry.author_type !== 'string' ||
      typeof entry.body !== 'string' ||
      typeof entry.kind !== 'string'
    ) {
      throw new Error(
        'AI review fetcher comments must include string `vendor`, `channel`, `author_login`, `author_type`, `body`, and `kind` fields.',
      );
    }

    if (
      entry.channel !== 'issue_comment' &&
      entry.channel !== 'review_summary' &&
      entry.channel !== 'inline_review'
    ) {
      throw new Error(`Unknown AI review comment channel: ${entry.channel}`);
    }

    if (
      entry.kind !== 'summary' &&
      entry.kind !== 'finding' &&
      entry.kind !== 'unknown'
    ) {
      throw new Error(`Unknown AI review comment kind: ${entry.kind}`);
    }

    return {
      authorLogin: entry.author_login,
      authorType: entry.author_type,
      body: entry.body,
      channel: entry.channel,
      isOutdated: parseOptionalBoolean(entry.is_outdated),
      isResolved: parseOptionalBoolean(entry.is_resolved),
      kind: entry.kind,
      line: parseOptionalNumber(entry.line),
      path: parseOptionalString(entry.path),
      updatedAt: parseOptionalString(entry.updated_at),
      url: parseOptionalString(entry.url),
      vendor: entry.vendor,
    } satisfies AiReviewComment;
  });

  return {
    agents: parsed.agents.map((entry) => ({
      agent: entry.agent as string,
      state: entry.state as AiReviewAgentState,
      findingsCount: parseOptionalNumber(entry.findingsCount),
      note: parseOptionalString(entry.note),
    })),
    artifactText: parsed.artifact_text,
    comments,
    detected: parsed.detected,
    vendors: parsed.vendors,
  };
}

function runAiReviewFetcher(
  worktreePath: string,
  prNumber: number,
): AiReviewFetcherResult {
  const fetcher = resolveReviewFetcher();
  const output = runProcess(worktreePath, [fetcher, String(prNumber)]);
  return parseAiReviewFetcherOutput(output);
}

export function parseAiReviewTriagerOutput(
  output: string,
): AiReviewTriagerResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(output);
  } catch (error) {
    throw new Error(
      `AI review triager must emit JSON. ${formatError(error)}\n${output.trim()}`.trim(),
      {
        cause: error,
      },
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(
      'AI review triager output must be a JSON object with `outcome`, `note`, and `vendors` fields.',
    );
  }

  if (
    (parsed.outcome !== 'clean' &&
      parsed.outcome !== 'needs_patch' &&
      parsed.outcome !== 'patched') ||
    typeof parsed.note !== 'string' ||
    !Array.isArray(parsed.vendors) ||
    !parsed.vendors.every((value) => typeof value === 'string')
  ) {
    throw new Error(
      'AI review triager output must be JSON with `outcome`, string `note`, and string[] `vendors` fields.',
    );
  }

  return {
    actionSummary: parseOptionalString(parsed.action_summary),
    note: parsed.note,
    nonActionSummary: parseOptionalString(parsed.non_action_summary),
    outcome: parsed.outcome,
    vendors: parsed.vendors,
  };
}

function runAiReviewTriager(
  worktreePath: string,
  artifactJsonPath: string,
): AiReviewTriagerResult {
  const triager = resolveReviewTriager();
  const output = runProcess(worktreePath, [triager, artifactJsonPath]);
  return parseAiReviewTriagerOutput(output);
}

function isTerminalReviewAgent(
  agent: Pick<AiReviewAgentResult, 'state'>,
): boolean {
  return agent.state === 'completed' || agent.state === 'findings_detected';
}

function hasActionableReviewFindings(result: AiReviewFetcherResult): boolean {
  return result.agents.some((agent) => agent.state === 'findings_detected');
}

function hasInFlightReviewAgents(result: AiReviewFetcherResult): boolean {
  return result.agents.some((agent) => agent.state === 'started');
}

function allDetectedAgentsReadyForTriage(
  result: AiReviewFetcherResult,
): boolean {
  return (
    result.agents.length > 0 &&
    result.agents.every((agent) => isTerminalReviewAgent(agent))
  );
}

function listIncompleteReviewAgents(result: AiReviewFetcherResult): string[] {
  return result.agents
    .filter((agent) => agent.state === 'started')
    .map((agent) => agent.agent);
}

function formatReviewAgentList(agents: string[]): string {
  return agents.join(', ');
}

function formatPartialAiReviewTimeoutNote(
  maxWaitMinutes: number,
  agents: string[],
): string {
  return `AI review reached the ${maxWaitMinutes}-minute limit while waiting on: ${formatReviewAgentList(agents)}. Triage the captured findings and rerun manually if needed.`;
}

function formatIncompleteAiReviewWithoutFindingsNote(
  maxWaitMinutes: number,
  agents: string[],
): string {
  return `AI review reached the ${maxWaitMinutes}-minute limit while waiting on: ${formatReviewAgentList(agents)}. No actionable findings were captured. Rerun manually if needed.`;
}

function computeExtendedReviewPollMaxWaitMinutes(
  intervalMinutes: number,
  maxWaitMinutes: number,
): number {
  return maxWaitMinutes + intervalMinutes;
}

type PollForAiReviewResult =
  | {
      status: 'triage_ready';
      result: AiReviewFetcherResult;
      effectiveMaxWaitMinutes: number;
    }
  | {
      status: 'partial_timeout';
      result: AiReviewFetcherResult;
      incompleteAgents: string[];
      effectiveMaxWaitMinutes: number;
    }
  | {
      status: 'clean_timeout';
      incompleteAgents?: string[];
      effectiveMaxWaitMinutes: number;
    };

async function pollForAiReview(
  worktreePath: string,
  prNumber: number,
  intervalMinutes: number,
  maxWaitMinutes: number,
  pollWindowStartedAt: number,
  dependencies: Pick<PollReviewDependencies, 'fetcher' | 'now' | 'sleep'> = {},
): Promise<PollForAiReviewResult> {
  const now = dependencies.now ?? Date.now;
  const sleepFn = dependencies.sleep ?? sleep;
  const fetcher = dependencies.fetcher ?? runAiReviewFetcher;
  const checks = buildReviewPollCheckMinutes(intervalMinutes, maxWaitMinutes);
  const extendedMaxWaitMinutes = computeExtendedReviewPollMaxWaitMinutes(
    intervalMinutes,
    maxWaitMinutes,
  );
  let extended = false;

  for (let index = 0; index < checks.length; index += 1) {
    const checkMinute = checks[index]!;
    const dueAt = pollWindowStartedAt + checkMinute * 60_000;
    const remaining = dueAt - now();

    if (remaining > 0) {
      await sleepFn(remaining);
    }

    const result = fetcher(worktreePath, prNumber);

    if (!result.detected) {
      continue;
    }

    if (allDetectedAgentsReadyForTriage(result)) {
      return {
        status: 'triage_ready',
        result,
        effectiveMaxWaitMinutes: extended
          ? extendedMaxWaitMinutes
          : maxWaitMinutes,
      };
    }

    if (
      !extended &&
      checkMinute === maxWaitMinutes &&
      hasInFlightReviewAgents(result)
    ) {
      checks.push(extendedMaxWaitMinutes);
      extended = true;
      continue;
    }

    if (
      checkMinute === extendedMaxWaitMinutes &&
      hasInFlightReviewAgents(result)
    ) {
      const incompleteAgents = listIncompleteReviewAgents(result);

      if (hasActionableReviewFindings(result)) {
        return {
          status: 'partial_timeout',
          result,
          incompleteAgents,
          effectiveMaxWaitMinutes: extendedMaxWaitMinutes,
        };
      }

      return {
        status: 'clean_timeout',
        incompleteAgents,
        effectiveMaxWaitMinutes: extendedMaxWaitMinutes,
      };
    }
  }

  return {
    status: 'clean_timeout',
    effectiveMaxWaitMinutes: maxWaitMinutes,
  };
}

async function writeAiReviewArtifacts(
  artifactStemPath: string,
  result: AiReviewFetcherResult,
): Promise<{ artifactJsonPath: string; artifactTextPath: string }> {
  const artifactJsonPath = `${artifactStemPath}.json`;
  const artifactTextPath = `${artifactStemPath}.txt`;

  await mkdir(dirname(artifactJsonPath), { recursive: true });
  await writeFile(
    artifactJsonPath,
    JSON.stringify(
      {
        artifact_text: result.artifactText,
        agents: result.agents.map((agent) => ({
          agent: agent.agent,
          state: agent.state,
          findingsCount: agent.findingsCount ?? null,
          note: agent.note ?? null,
        })),
        detected: result.detected,
        vendors: result.vendors,
        comments: result.comments.map((comment) => ({
          author_login: comment.authorLogin,
          author_type: comment.authorType,
          body: comment.body,
          channel: comment.channel,
          is_outdated: comment.isOutdated ?? null,
          is_resolved: comment.isResolved ?? null,
          kind: comment.kind,
          line: comment.line ?? null,
          path: comment.path ?? null,
          updated_at: comment.updatedAt ?? null,
          url: comment.url ?? null,
          vendor: comment.vendor,
        })),
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  await writeFile(artifactTextPath, result.artifactText, 'utf8');

  return {
    artifactJsonPath,
    artifactTextPath,
  };
}

export async function pollReview(
  state: DeliveryState,
  cwd: string,
  ticketId?: string,
  dependencies: PollReviewDependencies = {},
): Promise<DeliveryState> {
  const target = findTicketById(state, ticketId);

  if (!target || target.status !== 'in_review' || !target.prNumber) {
    throw new Error('No in-review ticket with an open PR was found.');
  }

  const now = dependencies.now ?? Date.now;
  const triager = dependencies.triager ?? runAiReviewTriager;
  const updatePullRequestBodyFn =
    dependencies.updatePullRequestBody ?? updatePullRequestBody;
  const { pollWindowStartedAt, pollWindowStartedAtIso } =
    resolveReviewPollWindowStart(target.prOpenedAt, now);
  const reviewPollResult = await pollForAiReview(
    target.worktreePath,
    target.prNumber,
    state.reviewPollIntervalMinutes,
    state.reviewPollMaxWaitMinutes,
    pollWindowStartedAt,
    dependencies,
  );

  if (
    reviewPollResult.status === 'triage_ready' ||
    reviewPollResult.status === 'partial_timeout'
  ) {
    const detectedReview = reviewPollResult.result;
    const artifacts = await writeAiReviewArtifacts(
      resolve(cwd, state.reviewsDirPath, `${target.id}-ai-review`),
      detectedReview,
    );
    const triage = triager(target.worktreePath, artifacts.artifactJsonPath);
    const reviewVendors =
      triage.vendors.length > 0 ? triage.vendors : detectedReview.vendors;
    const nextStatus =
      triage.outcome === 'needs_patch' ? 'needs_patch' : 'reviewed';
    const nextState: DeliveryState = {
      ...state,
      tickets: state.tickets.map((ticket) =>
        ticket.id === target.id
          ? {
              ...ticket,
              prOpenedAt: ticket.prOpenedAt ?? pollWindowStartedAtIso,
              status: nextStatus,
              reviewActionSummary: triage.actionSummary,
              reviewArtifactJsonPath: relativeToRepo(
                cwd,
                artifacts.artifactJsonPath,
              ),
              reviewArtifactPath: relativeToRepo(
                cwd,
                artifacts.artifactTextPath,
              ),
              reviewFetchedAt: new Date(now()).toISOString(),
              reviewNonActionSummary: triage.nonActionSummary,
              reviewOutcome:
                triage.outcome === 'clean' || triage.outcome === 'patched'
                  ? triage.outcome
                  : undefined,
              reviewNote:
                reviewPollResult.status === 'partial_timeout'
                  ? formatPartialAiReviewTimeoutNote(
                      reviewPollResult.effectiveMaxWaitMinutes,
                      reviewPollResult.incompleteAgents,
                    )
                  : triage.note,
              reviewIncompleteAgents:
                reviewPollResult.status === 'partial_timeout'
                  ? reviewPollResult.incompleteAgents
                  : undefined,
              reviewVendors,
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

    try {
      await updatePullRequestBodyFn(nextState, updatedTarget);
    } catch (error) {
      console.warn(
        `Review was recorded locally for ${updatedTarget.id}, but PR body update failed: ${formatError(error)}`,
      );
    }

    return nextState;
  }

  const nextState: DeliveryState = {
    ...state,
    tickets: state.tickets.map((ticket) =>
      ticket.id === target.id
        ? {
            ...ticket,
            prOpenedAt: ticket.prOpenedAt ?? pollWindowStartedAtIso,
            status: 'reviewed',
            reviewActionSummary: undefined,
            reviewArtifactJsonPath: undefined,
            reviewArtifactPath: undefined,
            reviewNonActionSummary: undefined,
            reviewOutcome: 'clean',
            reviewNote: reviewPollResult.incompleteAgents?.length
              ? formatIncompleteAiReviewWithoutFindingsNote(
                  reviewPollResult.effectiveMaxWaitMinutes,
                  reviewPollResult.incompleteAgents,
                )
              : formatNoAiReviewFeedbackNote(state.reviewPollMaxWaitMinutes),
            reviewIncompleteAgents: reviewPollResult.incompleteAgents,
            reviewVendors: [],
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

  try {
    await updatePullRequestBodyFn(nextState, updatedTarget);
  } catch (error) {
    console.warn(
      `Review was recorded locally for ${updatedTarget.id}, but PR body update failed: ${formatError(error)}`,
    );
  }
  return nextState;
}

async function runStandaloneAiReview(
  cwd: string,
  notifier: DeliveryNotifier,
  prNumber?: number,
): Promise<StandaloneAiReviewResult> {
  const pullRequest = resolveStandalonePullRequest(cwd, prNumber);

  await emitNotificationWarnings(notifier, cwd, [
    buildStandaloneReviewStartedEvent(pullRequest.number, pullRequest.url),
  ]);

  const commandStartedAt = Date.now();
  const reviewPollResult = await pollForAiReview(
    cwd,
    pullRequest.number,
    DEFAULT_REVIEW_POLL_INTERVAL_MINUTES,
    DEFAULT_REVIEW_POLL_MAX_WAIT_MINUTES,
    commandStartedAt,
  );

  if (
    reviewPollResult.status === 'triage_ready' ||
    reviewPollResult.status === 'partial_timeout'
  ) {
    const detectedReview = reviewPollResult.result;
    const artifacts = await writeAiReviewArtifacts(
      resolve(cwd, '.agents/ai-review', `pr-${pullRequest.number}`, 'review'),
      detectedReview,
    );
    const triage = runAiReviewTriager(cwd, artifacts.artifactJsonPath);
    const standaloneResult: StandaloneAiReviewResult = {
      actionSummary: triage.actionSummary,
      artifactJsonPath: relativeToRepo(cwd, artifacts.artifactJsonPath),
      artifactTextPath: relativeToRepo(cwd, artifacts.artifactTextPath),
      incompleteAgents:
        reviewPollResult.status === 'partial_timeout'
          ? reviewPollResult.incompleteAgents
          : undefined,
      note:
        reviewPollResult.status === 'partial_timeout'
          ? formatPartialAiReviewTimeoutNote(
              reviewPollResult.effectiveMaxWaitMinutes,
              reviewPollResult.incompleteAgents,
            )
          : triage.note,
      nonActionSummary: triage.nonActionSummary,
      outcome:
        triage.outcome === 'needs_patch'
          ? 'operator_input_needed'
          : triage.outcome,
      prNumber: pullRequest.number,
      prUrl: pullRequest.url,
      vendors:
        triage.vendors.length > 0 ? triage.vendors : detectedReview.vendors,
    };
    await writeStandaloneAiReviewNote(
      cwd,
      pullRequest.number,
      standaloneResult,
    );
    try {
      updateStandalonePullRequestBody(cwd, pullRequest, standaloneResult);
    } catch (error) {
      console.warn(
        `Standalone AI review was recorded locally for PR #${pullRequest.number}, but PR body update failed: ${formatError(error)}`,
      );
    }
    return standaloneResult;
  }

  const standaloneResult: StandaloneAiReviewResult = {
    incompleteAgents: reviewPollResult.incompleteAgents,
    note: reviewPollResult.incompleteAgents?.length
      ? formatIncompleteAiReviewWithoutFindingsNote(
          reviewPollResult.effectiveMaxWaitMinutes,
          reviewPollResult.incompleteAgents,
        )
      : formatNoAiReviewFeedbackNote(DEFAULT_REVIEW_POLL_MAX_WAIT_MINUTES),
    outcome: 'clean',
    prNumber: pullRequest.number,
    prUrl: pullRequest.url,
    vendors: [],
  };
  await writeStandaloneAiReviewNote(cwd, pullRequest.number, standaloneResult);
  try {
    updateStandalonePullRequestBody(cwd, pullRequest, standaloneResult);
  } catch (error) {
    console.warn(
      `Standalone AI review was recorded locally for PR #${pullRequest.number}, but PR body update failed: ${formatError(error)}`,
    );
  }
  return standaloneResult;
}

async function writeStandaloneAiReviewNote(
  cwd: string,
  prNumber: number,
  result: StandaloneAiReviewResult,
): Promise<void> {
  const notePath = resolve(
    cwd,
    '.agents/ai-review',
    `pr-${prNumber}`,
    'note.md',
  );
  await mkdir(dirname(notePath), { recursive: true });
  await writeFile(
    notePath,
    [
      '# AI Review Note',
      '',
      `- PR: ${result.prUrl}`,
      `- Outcome: \`${result.outcome}\``,
      result.vendors.length > 0
        ? `- Vendors: ${result.vendors.map((vendor) => `\`${vendor}\``).join(', ')}`
        : undefined,
      result.actionSummary
        ? `- Action summary: ${result.actionSummary}`
        : undefined,
      result.nonActionSummary
        ? `- Non-action summary: ${result.nonActionSummary}`
        : undefined,
      result.incompleteAgents?.length
        ? `- Incomplete agents at timeout: ${result.incompleteAgents.map((agent) => `\`${agent}\``).join(', ')}`
        : undefined,
      `- Note: ${result.note}`,
      result.artifactJsonPath
        ? `- Artifact (json): \`${result.artifactJsonPath}\``
        : undefined,
      result.artifactTextPath
        ? `- Artifact (text): \`${result.artifactTextPath}\``
        : undefined,
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n') + '\n',
    'utf8',
  );
}

export async function recordReview(
  state: DeliveryState,
  cwd: string,
  ticketId: string,
  outcome: ReviewResult,
  note?: string,
): Promise<DeliveryState> {
  const target = state.tickets.find((ticket) => ticket.id === ticketId);

  if (!target) {
    throw new Error(`Unknown ticket ${ticketId}.`);
  }

  if (
    target.status !== 'needs_patch' &&
    target.status !== 'in_review' &&
    target.status !== 'operator_input_needed'
  ) {
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
            status:
              outcome === 'operator_input_needed'
                ? 'operator_input_needed'
                : 'reviewed',
            reviewOutcome:
              outcome === 'clean' || outcome === 'patched'
                ? outcome
                : undefined,
            reviewNote: note ?? ticket.reviewNote,
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
    | 'internalReviewCompletedAt'
    | 'reviewActionSummary'
    | 'reviewIncompleteAgents'
    | 'status'
    | 'reviewOutcome'
    | 'reviewNote'
    | 'reviewNonActionSummary'
    | 'reviewVendors'
  >,
): string {
  const lines = [
    '## Summary',
    '',
    `- delivery ticket: \`${ticket.id} ${ticket.title}\``,
    `- ticket file: \`${ticket.ticketFile}\``,
    `- stacked base branch: \`${ticket.baseBranch}\``,
  ];

  if (ticket.internalReviewCompletedAt) {
    lines.push(
      `- internal review: completed at \`${ticket.internalReviewCompletedAt}\``,
    );
  }

  if (
    ticket.reviewOutcome ||
    ticket.status === 'needs_patch' ||
    ticket.status === 'operator_input_needed'
  ) {
    lines.push('', '## AI Review Follow-Up', '');

    if (ticket.reviewOutcome === 'clean') {
      lines.push(
        ticket.reviewNote ===
          formatNoAiReviewFeedbackNote(state.reviewPollMaxWaitMinutes)
          ? `- No \`ai-code-review\` feedback was detected during the ${state.reviewPollMaxWaitMinutes}-minute polling window.`
          : '- `ai-code-review` triage found no prudent follow-up changes.',
      );
    }

    if (ticket.status === 'needs_patch') {
      lines.push(
        '- `ai-code-review` triage found actionable follow-up work that still needs patching.',
      );
    }

    if (ticket.reviewOutcome === 'patched') {
      lines.push(
        '- `ai-code-review` triage led to prudent follow-up patches that are now included in this branch.',
      );
    }

    if (ticket.status === 'operator_input_needed') {
      lines.push(
        '- `ai-code-review` stopped for operator input before follow-up could be completed safely.',
      );
    }

    if (ticket.reviewNote) {
      lines.push(`- follow-up note: ${ticket.reviewNote}`);
    }

    if (ticket.reviewVendors && ticket.reviewVendors.length > 0) {
      lines.push(
        `- vendors: ${ticket.reviewVendors.map((vendor) => `\`${vendor}\``).join(', ')}`,
      );
    }

    if (ticket.reviewActionSummary) {
      lines.push(`- action summary: ${ticket.reviewActionSummary}`);
    }

    if (ticket.reviewNonActionSummary) {
      lines.push(`- non-action summary: ${ticket.reviewNonActionSummary}`);
    }

    if (ticket.reviewIncompleteAgents?.length) {
      lines.push(
        `- incomplete agents at timeout: \`${ticket.reviewIncompleteAgents.join(', ')}\``,
      );
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

function buildStandaloneReviewStartedEvent(
  prNumber: number,
  prUrl: string,
): DeliveryNotificationEvent {
  return {
    kind: 'standalone_review_started',
    prNumber,
    prUrl,
    reviewPollIntervalMinutes: DEFAULT_REVIEW_POLL_INTERVAL_MINUTES,
    reviewPollMaxWaitMinutes: DEFAULT_REVIEW_POLL_MAX_WAIT_MINUTES,
  };
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

export function buildStandaloneAiReviewSection(
  result: Pick<
    StandaloneAiReviewResult,
    | 'actionSummary'
    | 'artifactJsonPath'
    | 'artifactTextPath'
    | 'note'
    | 'nonActionSummary'
    | 'outcome'
    | 'vendors'
  >,
): string {
  const lines = [STANDALONE_AI_REVIEW_SECTION_START, '## AI Review', ''];

  if (result.outcome === 'clean') {
    lines.push(
      result.note ===
        formatNoAiReviewFeedbackNote(DEFAULT_REVIEW_POLL_MAX_WAIT_MINUTES)
        ? '- no `ai-code-review` feedback was detected during the 8-minute polling window.'
        : '- detected `ai-code-review` feedback did not merit follow-up changes.',
    );
  } else if (result.outcome === 'operator_input_needed') {
    lines.push(
      '- `ai-code-review` completed, but follow-up still needs operator attention.',
    );
  } else {
    lines.push(
      '- `ai-code-review` triage led to prudent follow-up patches that are now included in the branch.',
    );
  }

  lines.push(`- outcome: \`${result.outcome}\``);
  lines.push(`- note: ${result.note}`);

  if (result.vendors.length > 0) {
    lines.push(
      `- vendors: ${result.vendors.map((vendor) => `\`${vendor}\``).join(', ')}`,
    );
  }

  if (result.actionSummary) {
    lines.push(`- action summary: ${result.actionSummary}`);
  }

  if (result.nonActionSummary) {
    lines.push(`- non-action summary: ${result.nonActionSummary}`);
  }

  if (result.artifactJsonPath) {
    lines.push(`- artifact (json): \`${result.artifactJsonPath}\``);
  }

  if (result.artifactTextPath) {
    lines.push(`- artifact (text): \`${result.artifactTextPath}\``);
  }

  lines.push(STANDALONE_AI_REVIEW_SECTION_END);
  return lines.join('\n');
}

export function mergeStandaloneAiReviewSection(
  body: string,
  section: string,
): string {
  const pattern = new RegExp(
    `${STANDALONE_AI_REVIEW_SECTION_START}[\\s\\S]*?${STANDALONE_AI_REVIEW_SECTION_END}`,
  );

  if (pattern.test(body)) {
    return body.replace(pattern, section);
  }

  return body.trimEnd().length > 0
    ? `${body.trimEnd()}\n\n${section}\n`
    : `${section}\n`;
}

function updateStandalonePullRequestBody(
  cwd: string,
  pullRequest: StandalonePullRequest,
  result: StandaloneAiReviewResult,
): void {
  const nextBody = mergeStandaloneAiReviewSection(
    pullRequest.body,
    buildStandaloneAiReviewSection(result),
  );

  runProcess(cwd, [
    'gh',
    'pr',
    'edit',
    String(pullRequest.number),
    '--body',
    nextBody,
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

async function backupStateFile(absoluteStatePath: string): Promise<string> {
  const backupPath = absoluteStatePath.replace(
    /\.json$/,
    `.stale-${new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z')}.json`,
  );

  await writeFile(
    backupPath,
    await readFile(absoluteStatePath, 'utf8'),
    'utf8',
  );
  return backupPath;
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

function formatNoAiReviewFeedbackNote(maxWaitMinutes: number): string {
  return `No AI review feedback was detected within the ${maxWaitMinutes}-minute polling window.`;
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
