import {
  addWorktree as addPlatformWorktree,
  bootstrapWorktreeIfNeeded as bootstrapPlatformWorktreeIfNeeded,
  createPullRequest as createPlatformPullRequest,
  editPullRequest as editPlatformPullRequest,
  ensureBranchPushed as ensurePlatformBranchPushed,
  ensureCleanWorktree as ensurePlatformCleanWorktree,
  fetchOrigin as fetchPlatformOrigin,
  findOpenPullRequest as findPlatformOpenPullRequest,
  hasMergedPullRequestForBranch as hasPlatformMergedPullRequestForBranch,
  listCommitSubjectsBetween as listPlatformCommitSubjectsBetween,
  readCommitSubject as readPlatformCommitSubject,
  readCurrentBranch as readPlatformCurrentBranch,
  readHeadSha as readPlatformHeadSha,
  readLatestCommitSubject as readPlatformLatestCommitSubject,
  readMergeBase as readPlatformMergeBase,
  rebaseOnto as rebasePlatformOnto,
  rebaseOntoDefaultBranch as rebasePlatformOntoDefaultBranch,
  replyToReviewComment as replyPlatformToReviewComment,
  resolveGitHubRepo as resolvePlatformGitHubRepo,
  resolveReviewThread as resolvePlatformReviewThread,
  resolveStandalonePullRequest as resolvePlatformStandalonePullRequest,
  runProcess as runPlatformProcess,
  runProcessResult as runPlatformProcessResult,
  type PullRequestSummary,
} from './platform';
import {
  updatePullRequestBody as updatePrMetadataPullRequestBody,
  updateStandalonePullRequestBody as updateStandalonePrMetadataPullRequestBody,
} from './pr-metadata';
import { _config } from './runtime-config';
import type {
  DeliveryState,
  StandaloneAiReviewResult,
  StandalonePullRequest,
  TicketState,
} from './types';

export function addWorktree(
  cwd: string,
  worktreePath: string,
  branch: string,
  baseBranch: string,
): void {
  addPlatformWorktree(cwd, worktreePath, branch, baseBranch, _config.runtime);
}

export async function bootstrapWorktreeIfNeeded(
  worktreePath: string,
): Promise<void> {
  await bootstrapPlatformWorktreeIfNeeded(
    worktreePath,
    _config.packageManager,
    _config.runtime,
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
): string {
  return createPlatformPullRequest(cwd, options, _config.runtime);
}

export function editPullRequest(
  cwd: string,
  prNumber: number,
  options: {
    base?: string;
    body?: string;
    title?: string;
  },
): void {
  editPlatformPullRequest(cwd, prNumber, options, _config.runtime);
}

export function ensureBranchPushed(cwd: string, branch: string): void {
  ensurePlatformBranchPushed(cwd, branch, _config.runtime);
}

export function ensureCleanWorktree(cwd: string): void {
  ensurePlatformCleanWorktree(cwd, _config.runtime);
}

export function fetchOrigin(cwd: string): void {
  fetchPlatformOrigin(cwd, _config.runtime);
}

export function findOpenPullRequest(
  cwd: string,
  branch: string,
): PullRequestSummary | undefined {
  return findPlatformOpenPullRequest(cwd, branch, _config.runtime);
}

export function hasMergedPullRequestForBranch(
  cwd: string,
  branch: string,
): boolean {
  return hasPlatformMergedPullRequestForBranch(cwd, branch, _config.runtime);
}

export function listCommitSubjectsBetween(
  cwd: string,
  reviewedHeadSha: string,
  currentHeadSha: string,
  maxCount: number,
): string[] {
  return listPlatformCommitSubjectsBetween(
    cwd,
    reviewedHeadSha,
    currentHeadSha,
    maxCount,
    _config.runtime,
  );
}

export function parsePullRequestNumber(prUrl: string): number {
  const match = prUrl.match(/\/pull\/(\d+)$/);

  if (!match?.[1]) {
    throw new Error(`Could not parse PR number from ${prUrl}.`);
  }

  return Number(match[1]);
}

export function readCommitSubject(cwd: string, sha: string): string {
  return readPlatformCommitSubject(cwd, sha, _config.runtime);
}

export function readCurrentBranch(cwd: string): string {
  return readPlatformCurrentBranch(cwd, _config.runtime);
}

export function readHeadSha(cwd: string): string {
  return readPlatformHeadSha(cwd, _config.runtime);
}

export function readLatestCommitSubject(cwd: string): string {
  return readPlatformLatestCommitSubject(cwd, _config.runtime);
}

export function readMergeBase(
  cwd: string,
  branch: string,
  previousBranch: string,
): string {
  return readPlatformMergeBase(cwd, branch, previousBranch, _config.runtime);
}

export function rebaseOnto(
  cwd: string,
  rebaseTarget: string,
  oldBase: string,
): void {
  rebasePlatformOnto(cwd, rebaseTarget, oldBase, _config.runtime);
}

export function rebaseOntoDefaultBranch(
  cwd: string,
  defaultBranch: string,
): void {
  rebasePlatformOntoDefaultBranch(cwd, defaultBranch, _config.runtime);
}

export function resolveGitHubRepoForOrchestrator(cwd: string) {
  return resolvePlatformGitHubRepo(cwd, _config.runtime);
}

const REPO_CACHE_BY_WORKTREE = new Map<
  string,
  ReturnType<typeof resolveGitHubRepoForOrchestrator>
>();

export function replyToReviewThreadForOrchestrator(
  worktreePath: string,
  databaseId: number,
  body: string,
): void {
  const cached = REPO_CACHE_BY_WORKTREE.get(worktreePath);
  const repo =
    cached ?? resolvePlatformGitHubRepo(worktreePath, _config.runtime);
  if (!repo) {
    return;
  }
  if (!cached) {
    REPO_CACHE_BY_WORKTREE.set(worktreePath, repo);
  }

  try {
    replyPlatformToReviewComment(
      worktreePath,
      repo.owner,
      repo.name,
      databaseId,
      body,
      _config.runtime,
    );
  } catch {
    // Best-effort; thread resolution still proceeds.
  }
}

export function resolveReviewThread(
  worktreePath: string,
  threadId: string,
): string {
  return resolvePlatformReviewThread(worktreePath, threadId, _config.runtime);
}

export function resolveStandalonePullRequest(
  cwd: string,
  prNumber?: number,
): StandalonePullRequest {
  return resolvePlatformStandalonePullRequest(cwd, _config.runtime, prNumber);
}

export function runProcess(cwd: string, cmd: string[]): string {
  return runPlatformProcess(cwd, cmd, _config.runtime);
}

export function runProcessResult(
  cwd: string,
  cmd: string[],
): {
  exitCode: number;
  stderr: string;
  stdout: string;
} {
  return runPlatformProcessResult(cwd, cmd, _config.runtime);
}

export function updatePullRequestBody(
  state: DeliveryState,
  ticket: TicketState,
): void {
  return updatePrMetadataPullRequestBody(state, ticket, {
    editPullRequest,
    listCommitSubjectsBetween,
    readHeadSha,
    resolveGitHubRepo: resolveGitHubRepoForOrchestrator,
  });
}

export function updateStandalonePullRequestBody(
  cwd: string,
  pullRequest: StandalonePullRequest,
  result: StandaloneAiReviewResult,
): void {
  return updateStandalonePrMetadataPullRequestBody(cwd, pullRequest, result, {
    editPullRequest,
    listCommitSubjectsBetween,
    resolveGitHubRepo: resolveGitHubRepoForOrchestrator,
  });
}
