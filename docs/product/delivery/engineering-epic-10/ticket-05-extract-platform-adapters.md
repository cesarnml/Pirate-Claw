# EE10.05 — Extract `platform-adapters.ts`; Move Naming and Artifact Helpers

## Goal

Move the ~20 platform adapter wrappers from `orchestrator.ts` into
`platform-adapters.ts`. Move branch/path naming utilities to `planning.ts`. Move
ticket artifact helpers to `ticket-flow.ts`. Migrate related tests.

## Current Behavior

Three categories of logic are currently in `orchestrator.ts` that belong elsewhere:

### 1. Platform adapter wrappers

Thin closures that inject `_config.runtime` (and sometimes `_config.defaultBranch`,
`_config.packageManager`) into platform calls:

- `addWorktree`, `bootstrapWorktreeIfNeeded`, `copyFileIntoWorktree`
- `createPullRequest`, `editPullRequest`, `findOpenPullRequest`
- `hasMergedPullRequestForBranch`, `ensureBranchPushed`, `ensureCleanWorktree`
- `fetchOrigin`, `readCurrentBranch`, `readHeadSha`, `readLatestCommitSubject`
- `readCommitSubject`, `readMergeBase`, `rebaseOnto`, `rebaseOntoDefaultBranch`
- `listCommitSubjectsBetween`, `resolveReviewThread`, `runProcess`
- `resolveGitHubRepoForOrchestrator`, `replyToReviewThreadForOrchestrator`
- `updatePullRequestBody`, `updateStandalonePullRequestBody`
- `resolveStandalonePullRequest`
- `REPO_CACHE_BY_WORKTREE` (private cache used by `replyToReviewThreadForOrchestrator`)
- `parsePullRequestNumber` (private helper, one caller)

### 2. Branch/path naming utilities (move to `planning.ts`)

- `findExistingBranch(branches, definition)` — exported
- `deriveBranchName(definition)` — exported
- `deriveWorktreePath(cwd, ticketId)` — exported
- `preferDeliveryBranch(branches)` — private helper used by `findExistingBranch`
- `relativeToRepo(cwd, absolutePath)` — private helper used by review/ticket wiring

### 3. Ticket artifact helpers (move to `ticket-flow.ts`)

- `materializeTicketContext(state, sourceWorktreePath, ticketId)` — exported
- `copyTicketScopedArtifacts(input)` — private
- `copyFileIntoWorktree(sourcePath, targetPath)` — private

Also exported helpers that stay in `orchestrator.ts` as pass-throughs but now
source from `platform-adapters.ts`:

- `copyLocalBootstrapFilesIfPresent`, `copyLocalEnvIfPresent`
- `resolveReviewFetcher`, `resolveReviewTriager`
- `findPrimaryWorktreePath`

## Target Behavior

`tools/delivery/platform-adapters.ts` owns all platform wiring. `planning.ts`
owns all naming derivation. `ticket-flow.ts` owns all ticket lifecycle helpers
including artifact materialization.

Each adapter function in `platform-adapters.ts` imports `_config` from
`runtime-config.ts` directly — individual functions, not a factory. Factory
pattern is EE11 scope.

## Change Surface

- `tools/delivery/platform-adapters.ts` (new file)
- `tools/delivery/planning.ts` (add naming utilities)
- `tools/delivery/ticket-flow.ts` (add artifact helpers)
- `tools/delivery/orchestrator.ts` (remove all moved logic, update re-exports)
- `tools/delivery/test/platform-adapters.test.ts` (new file — migrated adapter tests if any)
- `tools/delivery/test/orchestrator.test.ts` (remove naming/artifact describe blocks, update imports)

## Acceptance Criteria

- [ ] `tools/delivery/platform-adapters.ts` exists and contains all adapter wrappers
- [ ] `findExistingBranch`, `deriveBranchName`, `deriveWorktreePath` are in `planning.ts`
- [ ] `materializeTicketContext` and copy helpers are in `ticket-flow.ts`
- [ ] `parsePullRequestNumber` is private in `platform-adapters.ts`
- [ ] `preferDeliveryBranch` is private in `planning.ts`
- [ ] `orchestrator.ts` re-exports all public surface (public API unchanged)
- [ ] `bun test` passes with no changes to test logic

## Tests

Migrate the following describe blocks from `orchestrator.test.ts` to the
appropriate test files:

- `findExistingBranch`, `deriveBranchName`, `deriveWorktreePath` tests →
  `test/planning.test.ts` (create if needed) or fold into existing planning tests
- `materializeTicketContext` tests → `test/ticket-flow.test.ts` (create if needed)
- `parseGitWorktreeList` tests — already sourced from `platform.ts`; verify
  correct import path

No new test cases. Migrate verbatim, update import paths.
