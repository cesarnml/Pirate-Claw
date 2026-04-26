import {
  createOptions,
  formatStatus,
  initOrchestratorConfig,
  loadOrchestratorConfig,
  loadState,
  resolveOrchestratorConfig,
  runProcessResult,
  saveState,
} from './orchestrator';
import type { DeliveryState, TicketState } from './types';

type CloseoutStackArgs = {
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

type CloseoutSummary = {
  merged: Array<{ prNumber: number; ticketId: string; url: string }>;
  skippedMerged: Array<{ prNumber: number; ticketId: string; url: string }>;
};

export function parseCloseoutStackArgs(argv: string[]): CloseoutStackArgs {
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
      `closeout-stack requires the full phase to be done first. Incomplete tickets: ${incomplete.map((ticket) => `${ticket.id}=${ticket.status}`).join(', ')}`,
    );
  }

  const missingPr = state.tickets.filter(
    (ticket) => !ticket.prNumber || !ticket.prUrl,
  );

  if (missingPr.length > 0) {
    throw new Error(
      `closeout-stack requires tracked PR metadata for every ticket. Missing PRs: ${missingPr.map((ticket) => ticket.id).join(', ')}`,
    );
  }

  return state.tickets;
}

function getUsage(): string {
  return 'Usage: bun run closeout-stack --plan <plan-path>';
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
      `Worktree ${cwd} is not clean. Commit or stash changes before closeout-stack.`,
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
  const tracked = byBranch.find((pr) => pr.number === ticket.prNumber);
  const matched =
    tracked?.state === 'OPEN'
      ? tracked
      : (byBranch.find((pr) => pr.state === 'OPEN') ?? tracked ?? byBranch[0]);

  if (!matched) {
    throw new Error(
      `Could not find a pull request for ${ticket.id} on branch ${ticket.branch}.`,
    );
  }

  return matched;
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

function fetchOriginDefaultBranch(cwd: string, defaultBranch: string): void {
  runProcess(cwd, ['git', 'fetch', 'origin', defaultBranch]);
}

function ensureOnDefaultBranch(cwd: string, defaultBranch: string): void {
  const current = runProcess(cwd, ['git', 'rev-parse', '--abbrev-ref', 'HEAD']);
  if (current !== defaultBranch) {
    throw new Error(
      `closeout-stack must run from the ${defaultBranch} branch, but HEAD is on ${current}.`,
    );
  }
}

function closePullRequest(
  cwd: string,
  prNumber: number,
  ticketId: string,
): void {
  const result = runProcessResult(cwd, [
    'gh',
    'pr',
    'close',
    String(prNumber),
    '--comment',
    `Squash-merged to main via closeout-stack (${ticketId}).`,
  ]);

  if (result.exitCode !== 0) {
    const message = `${result.stderr}\n${result.stdout}`;
    if (
      !message.includes('already closed') &&
      !message.includes('already merged')
    ) {
      throw new Error(`Failed to close PR #${prNumber}: ${message.trim()}`);
    }
  }
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

  return lines.join('\n');
}

export async function runCloseoutStack(
  argv: string[],
  cwd: string,
): Promise<number> {
  try {
    const parsed = parseCloseoutStackArgs(argv);
    const rawConfig = await loadOrchestratorConfig(cwd);
    const config = resolveOrchestratorConfig(rawConfig, cwd);
    initOrchestratorConfig(config);
    const options = createOptions({ planPath: parsed.planPath });
    const state = await loadState(cwd, options);
    const tickets = getCloseoutTicketChain(state);
    const repo = resolveRepoSlug(cwd);
    const summary: CloseoutSummary = {
      merged: [],
      skippedMerged: [],
    };

    ensureCleanWorktree(cwd);
    ensureOnDefaultBranch(cwd, config.defaultBranch);

    // Prefetch PR snapshots before any branch mutations so child PRs
    // are still discoverable even after parent branches are deleted.
    const prSnapshots = tickets.map((ticket) =>
      resolvePullRequestForTicket(cwd, ticket),
    );

    for (let index = 0; index < tickets.length; index += 1) {
      const ticket = tickets[index]!;
      const pr = prSnapshots[index]!;

      if (pr.state === 'MERGED') {
        summary.skippedMerged.push({
          prNumber: pr.number,
          ticketId: ticket.id,
          url: pr.url,
        });
        fetchOriginDefaultBranch(cwd, config.defaultBranch);
        runProcess(cwd, [
          'git',
          'reset',
          '--hard',
          `origin/${config.defaultBranch}`,
        ]);
        continue;
      }

      // Sync local branch with remote main
      fetchOriginDefaultBranch(cwd, config.defaultBranch);
      runProcess(cwd, [
        'git',
        'reset',
        '--hard',
        `origin/${config.defaultBranch}`,
      ]);

      // Fetch ticket branch and squash-merge locally (3-way merge, no rebase)
      runProcess(cwd, ['git', 'fetch', 'origin', ticket.branch]);
      runProcess(cwd, ['git', 'merge', '--squash', `origin/${ticket.branch}`]);
      runProcess(cwd, ['git', 'commit', '-m', pr.title]);
      runProcess(cwd, ['git', 'push', 'origin', config.defaultBranch]);

      // Close the PR and clean up the remote branch
      closePullRequest(cwd, pr.number, ticket.id);
      deleteRemoteBranch(cwd, repo, ticket.branch);

      summary.merged.push({
        prNumber: pr.number,
        ticketId: ticket.id,
        url: pr.url,
      });
    }

    await saveState(cwd, state);
    console.log(formatCloseoutSummary(summary, state));
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
