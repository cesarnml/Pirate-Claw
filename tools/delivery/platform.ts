import { spawnSync as nodeSpawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export type Runtime = 'bun' | 'node';
export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn';

export type CommandResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

export type GitWorktreeEntry = {
  branch?: string;
  path: string;
};

export type PullRequestSummary = {
  baseRefName?: string;
  body?: string;
  createdAt?: string;
  headRefName?: string;
  number: number;
  title?: string;
  url: string;
  state: string;
};

export type PullRequestDetail = PullRequestSummary & {
  baseRefName?: string;
  mergedAt?: string | null;
};

const LOCK_FILES = [
  'bun.lock',
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
] as const;

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

export function runProcess(
  cwd: string,
  cmd: string[],
  runtime: Runtime,
): string {
  const result = runProcessResult(cwd, cmd, runtime);

  if (result.exitCode !== 0) {
    throw new Error(formatCommandFailure(cmd, result));
  }

  return result.stdout;
}

export function runProcessResult(
  cwd: string,
  cmd: string[],
  runtime: Runtime,
): CommandResult {
  if (runtime === 'bun' && typeof globalThis.Bun !== 'undefined') {
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

  const result = nodeSpawnSync(cmd[0]!, cmd.slice(1), {
    cwd,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return {
    exitCode: result.status ?? 1,
    stderr: [result.stderr?.toString() ?? '', result.error?.message ?? '']
      .filter(Boolean)
      .join('\n')
      .trim(),
    stdout: result.stdout?.toString() ?? '',
  };
}

export function formatCommandFailure(
  cmd: string[],
  result: Pick<CommandResult, 'stderr' | 'stdout'>,
): string {
  return [
    `Command failed: ${cmd.join(' ')}`,
    result.stderr.trim(),
    result.stdout.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}

export function listGitWorktrees(
  cwd: string,
  runtime: Runtime,
): GitWorktreeEntry[] {
  return parseGitWorktreeList(
    runProcess(cwd, ['git', 'worktree', 'list', '--porcelain'], runtime),
  );
}

export function findPrimaryWorktreePath(
  cwd: string,
  defaultBranch: string,
  runtime: Runtime,
): string | undefined {
  const worktrees = listGitWorktrees(cwd, runtime);

  return worktrees.find(
    (worktree) =>
      resolve(worktree.path) !== resolve(cwd) &&
      worktree.branch === `refs/heads/${defaultBranch}`,
  )?.path;
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

export async function bootstrapWorktreeIfNeeded(
  worktreePath: string,
  packageManager: PackageManager,
  runtime: Runtime,
): Promise<void> {
  if (
    !existsSync(resolve(worktreePath, 'package.json')) ||
    existsSync(resolve(worktreePath, 'node_modules'))
  ) {
    return;
  }

  const hasLockfile = LOCK_FILES.some((file) =>
    existsSync(resolve(worktreePath, file)),
  );

  if (!hasLockfile) {
    return;
  }

  runProcess(worktreePath, [packageManager, 'install'], runtime);

  const packageJson = JSON.parse(
    await readFile(resolve(worktreePath, 'package.json'), 'utf8'),
  ) as {
    scripts?: Record<string, string>;
  };

  if (packageJson.scripts?.['hooks:install']) {
    runProcess(worktreePath, [packageManager, 'run', 'hooks:install'], runtime);
  }
}

export function listOpenPullRequests(
  cwd: string,
  runtime: Runtime,
): Map<string, PullRequestSummary> {
  const stdout = runProcess(
    cwd,
    [
      'gh',
      'pr',
      'list',
      '--state',
      'open',
      '--limit',
      '100',
      '--json',
      'number,url,headRefName,state',
    ],
    runtime,
  );
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

export function listRemoteBranches(cwd: string, runtime: Runtime): string[] {
  return runProcess(
    cwd,
    ['git', 'branch', '-r', '--format=%(refname:short)'],
    runtime,
  )
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^origin\//, ''));
}

export function listLocalBranches(cwd: string, runtime: Runtime): string[] {
  return runProcess(
    cwd,
    ['git', 'branch', '--format=%(refname:short)'],
    runtime,
  )
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function listMergedPullRequests(
  cwd: string,
  runtime: Runtime,
): Map<string, PullRequestSummary> {
  const stdout = runProcess(
    cwd,
    [
      'gh',
      'pr',
      'list',
      '--state',
      'merged',
      '--limit',
      '100',
      '--json',
      'number,url,headRefName,state',
    ],
    runtime,
  );
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

export function resolveStandalonePullRequest(
  cwd: string,
  runtime: Runtime,
  prNumber?: number,
): {
  body: string;
  createdAt: string;
  headRefName: string;
  headRefOid: string;
  number: number;
  title: string;
  url: string;
} {
  const target = prNumber ? String(prNumber) : undefined;
  const stdout = runProcess(
    cwd,
    [
      'gh',
      'pr',
      'view',
      ...(target ? [target] : []),
      '--json',
      'number,url,title,body,headRefName,headRefOid,createdAt',
    ],
    runtime,
  );

  return JSON.parse(stdout) as {
    body: string;
    createdAt: string;
    headRefName: string;
    headRefOid: string;
    number: number;
    title: string;
    url: string;
  };
}

export function findOpenPullRequest(
  cwd: string,
  branch: string,
  runtime: Runtime,
): PullRequestSummary | undefined {
  const stdout = runProcess(
    cwd,
    [
      'gh',
      'pr',
      'list',
      '--state',
      'open',
      '--head',
      branch,
      '--json',
      'number,url,state',
    ],
    runtime,
  );
  const parsed = JSON.parse(stdout) as Array<PullRequestSummary>;
  return parsed[0];
}

export function findMergedPullRequest(
  cwd: string,
  branch: string,
  runtime: Runtime,
): PullRequestDetail | undefined {
  const stdout = runProcess(
    cwd,
    [
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
    ],
    runtime,
  );
  const parsed = JSON.parse(stdout) as Array<PullRequestDetail>;
  return parsed[0];
}

export function hasMergedPullRequestForBranch(
  cwd: string,
  branch: string,
  runtime: Runtime,
): boolean {
  return findMergedPullRequest(cwd, branch, runtime) !== undefined;
}

export function readLatestCommitSubject(cwd: string, runtime: Runtime): string {
  return runProcess(cwd, ['git', 'log', '-1', '--pretty=%s'], runtime).trim();
}

export function readHeadSha(cwd: string, runtime: Runtime): string {
  return runProcess(cwd, ['git', 'rev-parse', 'HEAD'], runtime).trim();
}

export function readCurrentBranch(cwd: string, runtime: Runtime): string {
  const branch = runProcess(
    cwd,
    ['git', 'branch', '--show-current'],
    runtime,
  ).trim();

  if (!branch) {
    throw new Error('Restack requires an attached branch checkout.');
  }

  return branch;
}

export function ensureCleanWorktree(cwd: string, runtime: Runtime): void {
  const status = runProcess(cwd, ['git', 'status', '--short'], runtime).trim();

  if (status) {
    throw new Error(
      'Restack requires a clean worktree. Commit, stash, or discard local changes first.',
    );
  }
}

function runGitLines(cwd: string, cmd: string[], runtime: Runtime): string[] {
  return runProcess(cwd, cmd, runtime)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function ensureBranchPushed(
  cwd: string,
  branch: string,
  runtime: Runtime,
): void {
  const localSha = runGitLines(cwd, ['git', 'rev-parse', branch], runtime)[0];
  const remoteRef = runProcessResult(
    cwd,
    ['git', 'ls-remote', '--heads', 'origin', branch],
    runtime,
  );

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
    runProcess(cwd, ['git', 'push', '-u', 'origin', branch], runtime);
    return;
  }

  if (remoteSha !== localSha) {
    runProcess(cwd, ['git', 'push', 'origin', branch], runtime);
  }

  const upstream = runProcessResult(
    cwd,
    ['git', 'branch', '--set-upstream-to', `origin/${branch}`, branch],
    runtime,
  );

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

export function addWorktree(
  cwd: string,
  worktreePath: string,
  branch: string,
  baseBranch: string,
  runtime: Runtime,
): void {
  runProcess(
    cwd,
    ['git', 'worktree', 'add', worktreePath, '-b', branch, baseBranch],
    runtime,
  );
}

export function createPullRequest(
  cwd: string,
  options: {
    base: string;
    body: string;
    head: string;
    title: string;
  },
  runtime: Runtime,
): string {
  return runProcess(
    cwd,
    [
      'gh',
      'pr',
      'create',
      '--base',
      options.base,
      '--head',
      options.head,
      '--title',
      options.title,
      '--body',
      options.body,
    ],
    runtime,
  ).trim();
}

export function editPullRequest(
  cwd: string,
  prNumber: number,
  options: {
    base?: string;
    body?: string;
    title?: string;
  },
  runtime: Runtime,
): void {
  const cmd = ['gh', 'pr', 'edit', String(prNumber)] as string[];

  if (options.base) {
    cmd.push('--base', options.base);
  }
  if (options.title) {
    cmd.push('--title', options.title);
  }
  if (options.body) {
    cmd.push('--body', options.body);
  }

  runProcess(cwd, cmd, runtime);
}

export function resolveReviewThread(
  worktreePath: string,
  threadId: string,
  runtime: Runtime,
): string {
  return runProcess(
    worktreePath,
    [
      'gh',
      'api',
      'graphql',
      '-F',
      `threadId=${threadId}`,
      '-f',
      'query=mutation($threadId: ID!) { resolveReviewThread(input: { threadId: $threadId }) { thread { id isResolved } } }',
    ],
    runtime,
  );
}

export function fetchOrigin(cwd: string, runtime: Runtime): void {
  runProcess(cwd, ['git', 'fetch', 'origin'], runtime);
}

export function readMergeBase(
  cwd: string,
  branch: string,
  previousBranch: string,
  runtime: Runtime,
): string {
  return runProcess(
    cwd,
    ['git', 'merge-base', branch, previousBranch],
    runtime,
  ).trim();
}

export function rebaseOnto(
  cwd: string,
  rebaseTarget: string,
  oldBase: string,
  runtime: Runtime,
): void {
  runProcess(cwd, ['git', 'rebase', '--onto', rebaseTarget, oldBase], runtime);
}

export function rebaseOntoDefaultBranch(
  cwd: string,
  defaultBranch: string,
  runtime: Runtime,
): void {
  runProcess(cwd, ['git', 'rebase', `origin/${defaultBranch}`], runtime);
}

export function listCommitSubjectsBetween(
  cwd: string,
  reviewedHeadSha: string,
  currentHeadSha: string,
  maxCount: number,
  runtime: Runtime,
): string[] {
  return runProcess(
    cwd,
    [
      'git',
      'log',
      '--no-merges',
      '--reverse',
      `--max-count=${maxCount}`,
      '--format=%H%x09%s',
      `${reviewedHeadSha}..${currentHeadSha}`,
    ],
    runtime,
  )
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
