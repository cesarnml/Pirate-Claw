import {
  createOptions,
  formatStatus,
  initOrchestratorConfig,
  loadOrchestratorConfig,
  loadState,
  resolveOrchestratorConfig,
  runProcessResult,
  saveState,
  type DeliveryState,
  type TicketState,
} from './orchestrator';

type StackedCloseoutArgs = {
  planPath: string;
};

type PullRequestSnapshot = {
  baseRefName?: string;
  headRefName?: string;
  mergedAt?: string | null;
  number: number;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  title: string;
  url: string;
};

type MergeResponse = {
  merged: boolean;
  message?: string;
  sha?: string;
};

type CloseoutSummary = {
  merged: Array<{ prNumber: number; ticketId: string; url: string }>;
  replaced: Array<{
    originalPrNumber: number;
    replacementPrNumber: number;
    ticketId: string;
    url: string;
  }>;
  skippedMerged: Array<{ prNumber: number; ticketId: string; url: string }>;
};

export function parseStackedCloseoutArgs(argv: string[]): StackedCloseoutArgs {
  let planPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--plan') {
      planPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (value?.startsWith('--')) {
      throw new Error(getUsage());
    }
  }

  if (!planPath?.trim()) {
    throw new Error(getUsage());
  }

  return {
    planPath: planPath.trim(),
  };
}

export function getCloseoutTicketChain(state: DeliveryState): TicketState[] {
  const incomplete = state.tickets.filter((ticket) => ticket.status !== 'done');

  if (incomplete.length > 0) {
    throw new Error(
      `stacked-closeout requires the full phase to be done first. Incomplete tickets: ${incomplete.map((ticket) => `${ticket.id}=${ticket.status}`).join(', ')}`,
    );
  }

  const missingPr = state.tickets.filter(
    (ticket) => !ticket.prNumber || !ticket.prUrl,
  );

  if (missingPr.length > 0) {
    throw new Error(
      `stacked-closeout requires tracked PR metadata for every ticket. Missing PRs: ${missingPr.map((ticket) => ticket.id).join(', ')}`,
    );
  }

  return state.tickets;
}

function getUsage(): string {
  return 'Usage: bun run stacked-closeout --plan <plan-path>';
}

function runProcess(cwd: string, cmd: string[]): string {
  const result = runProcessResult(cwd, cmd);
  if (result.exitCode !== 0) {
    const stderr = result.stderr || result.stdout || 'unknown command failure';
    throw new Error(`${cmd.join(' ')} failed: ${stderr}`);
  }

  return result.stdout.trim();
}

function ensureCleanWorktree(cwd: string): void {
  const status = runProcess(cwd, ['git', 'status', '--short']).trim();
  if (status.length > 0) {
    throw new Error(
      `Worktree ${cwd} is not clean. Commit or stash changes before stacked-closeout.`,
    );
  }
}

function readJson<T>(cwd: string, cmd: string[]): T {
  return JSON.parse(runProcess(cwd, cmd)) as T;
}

function resolveRepoSlug(cwd: string): string {
  return runProcess(cwd, [
    'gh',
    'repo',
    'view',
    '--json',
    'nameWithOwner',
    '--jq',
    '.nameWithOwner',
  ]);
}

function findPullRequestsForBranch(
  cwd: string,
  branch: string,
): PullRequestSnapshot[] {
  return readJson<PullRequestSnapshot[]>(cwd, [
    'gh',
    'pr',
    'list',
    '--state',
    'all',
    '--head',
    branch,
    '--json',
    'number,title,state,baseRefName,headRefName,url,mergedAt',
  ]).sort((left, right) => right.number - left.number);
}

function resolvePullRequestForTicket(
  cwd: string,
  ticket: TicketState,
): PullRequestSnapshot {
  const byBranch = findPullRequestsForBranch(cwd, ticket.branch);
  const matched =
    byBranch.find((pr) => pr.number === ticket.prNumber) ?? byBranch[0];

  if (!matched) {
    throw new Error(
      `Could not find a pull request for ${ticket.id} on branch ${ticket.branch}.`,
    );
  }

  return matched;
}

function fetchPullRequestHeadSha(
  cwd: string,
  repo: string,
  prNumber: number,
): string {
  return runProcess(cwd, [
    'gh',
    'api',
    `repos/${repo}/pulls/${prNumber}`,
    '--jq',
    '.head.sha',
  ]);
}

function mergePullRequest(
  cwd: string,
  repo: string,
  pr: PullRequestSnapshot,
): MergeResponse {
  const sha = fetchPullRequestHeadSha(cwd, repo, pr.number);

  return readJson<MergeResponse>(cwd, [
    'gh',
    'api',
    '-X',
    'PUT',
    `repos/${repo}/pulls/${pr.number}/merge`,
    '-f',
    'merge_method=squash',
    '-f',
    `sha=${sha}`,
    '-f',
    `commit_title=${pr.title}`,
  ]);
}

function deleteRemoteBranch(cwd: string, repo: string, branch: string): void {
  const result = runProcessResult(cwd, [
    'gh',
    'api',
    '-X',
    'DELETE',
    `repos/${repo}/git/refs/heads/${branch}`,
  ]);

  if (result.exitCode === 0) {
    return;
  }

  const message = `${result.stderr}\n${result.stdout}`;
  if (message.includes('Reference does not exist')) {
    return;
  }

  throw new Error(
    `Failed to delete remote branch ${branch}: ${message.trim()}`,
  );
}

function fetchOriginMain(cwd: string): void {
  runProcess(cwd, ['git', 'fetch', 'origin', 'main']);
}

function rebaseChildOntoMain(child: TicketState, parent: TicketState): void {
  ensureCleanWorktree(child.worktreePath);
  fetchOriginMain(child.worktreePath);
  const oldBase = runProcess(child.worktreePath, [
    'git',
    'merge-base',
    child.branch,
    parent.branch,
  ]).trim();

  if (!oldBase) {
    throw new Error(
      `Could not determine the shared ancestor between ${child.branch} and ${parent.branch}.`,
    );
  }

  runProcess(child.worktreePath, [
    'git',
    'rebase',
    '--onto',
    'origin/main',
    oldBase,
  ]);
}

function forcePushBranch(ticket: TicketState): void {
  runProcess(ticket.worktreePath, [
    'git',
    'push',
    '--force-with-lease',
    'origin',
    ticket.branch,
  ]);
}

function buildReplacementPullRequestBody(
  ticket: TicketState,
  previousNumber: number,
): string {
  return [
    `Replacement for auto-closed stacked PR #${previousNumber} after parent branch merge.`,
    '',
    `Content is the rebased ${ticket.id} branch against current main.`,
  ].join('\n');
}

function createReplacementPullRequest(
  ticket: TicketState,
  previous: PullRequestSnapshot,
): PullRequestSnapshot {
  const url = runProcess(ticket.worktreePath, [
    'gh',
    'pr',
    'create',
    '--base',
    'main',
    '--head',
    ticket.branch,
    '--title',
    previous.title,
    '--body',
    buildReplacementPullRequestBody(ticket, previous.number),
  ]);
  const number = Number(url.match(/\/pull\/(\d+)$/)?.[1]);

  if (!number) {
    throw new Error(`Could not parse replacement PR number from ${url}.`);
  }

  return {
    ...previous,
    number,
    baseRefName: 'main',
    state: 'OPEN',
    url,
  };
}

function retargetChildPullRequest(
  child: TicketState,
  currentPr: PullRequestSnapshot,
): PullRequestSnapshot {
  const refreshed = resolvePullRequestForTicket(child.worktreePath, child);

  if (refreshed.state === 'OPEN') {
    runProcess(child.worktreePath, [
      'gh',
      'pr',
      'edit',
      String(refreshed.number),
      '--base',
      'main',
    ]);
    return {
      ...refreshed,
      baseRefName: 'main',
    };
  }

  return createReplacementPullRequest(child, currentPr);
}

function updateTicketPr(
  state: DeliveryState,
  ticketId: string,
  pr: PullRequestSnapshot,
): DeliveryState {
  return {
    ...state,
    tickets: state.tickets.map((ticket) =>
      ticket.id === ticketId
        ? {
            ...ticket,
            baseBranch: ticket.id === ticketId ? 'main' : ticket.baseBranch,
            prNumber: pr.number,
            prUrl: pr.url,
          }
        : ticket,
    ),
  };
}

function formatCloseoutSummary(
  summary: CloseoutSummary,
  state: DeliveryState,
): string {
  const lines = [formatStatus(state), '', 'Stacked Closeout Summary'];

  for (const merged of summary.merged) {
    lines.push(
      `- merged ${merged.ticketId}: PR #${merged.prNumber} (${merged.url})`,
    );
  }

  for (const skipped of summary.skippedMerged) {
    lines.push(
      `- already merged ${skipped.ticketId}: PR #${skipped.prNumber} (${skipped.url})`,
    );
  }

  for (const replaced of summary.replaced) {
    lines.push(
      `- replaced ${replaced.ticketId}: PR #${replaced.originalPrNumber} -> PR #${replaced.replacementPrNumber} (${replaced.url})`,
    );
  }

  return lines.join('\n');
}

export async function runStackedCloseout(
  argv: string[],
  cwd: string,
): Promise<number> {
  try {
    const parsed = parseStackedCloseoutArgs(argv);
    const rawConfig = await loadOrchestratorConfig(cwd);
    initOrchestratorConfig(resolveOrchestratorConfig(rawConfig, cwd));
    const options = createOptions({ planPath: parsed.planPath });
    let state = await loadState(cwd, options);
    const tickets = getCloseoutTicketChain(state);
    const repo = resolveRepoSlug(cwd);
    const summary: CloseoutSummary = {
      merged: [],
      replaced: [],
      skippedMerged: [],
    };

    for (let index = 0; index < tickets.length; index += 1) {
      const current = state.tickets[index]!;
      const next = state.tickets[index + 1];
      const currentPr = resolvePullRequestForTicket(
        current.worktreePath,
        current,
      );

      if (currentPr.state === 'MERGED') {
        summary.skippedMerged.push({
          prNumber: currentPr.number,
          ticketId: current.id,
          url: currentPr.url,
        });
      } else if (currentPr.state !== 'OPEN') {
        throw new Error(
          `${current.id} PR #${currentPr.number} is ${currentPr.state.toLowerCase()}. Expected OPEN or MERGED.`,
        );
      } else {
        const merge = mergePullRequest(current.worktreePath, repo, currentPr);
        if (!merge.merged) {
          throw new Error(
            `Failed to merge ${current.id} PR #${currentPr.number}: ${merge.message ?? 'unknown merge failure'}`,
          );
        }
        summary.merged.push({
          prNumber: currentPr.number,
          ticketId: current.id,
          url: currentPr.url,
        });
      }

      fetchOriginMain(current.worktreePath);

      if (next) {
        rebaseChildOntoMain(next, current);
        forcePushBranch(next);
        const replacementSource = resolvePullRequestForTicket(
          next.worktreePath,
          next,
        );
        const childPr = retargetChildPullRequest(next, replacementSource);
        if (childPr.number !== replacementSource.number) {
          summary.replaced.push({
            originalPrNumber: replacementSource.number,
            replacementPrNumber: childPr.number,
            ticketId: next.id,
            url: childPr.url,
          });
        }
        state = updateTicketPr(state, next.id, childPr);
      }

      deleteRemoteBranch(current.worktreePath, repo, current.branch);
    }

    await saveState(cwd, state);
    console.log(formatCloseoutSummary(summary, state));
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
