# EE4.03 — Thread Reply Before Resolve

## Goal

Before the orchestrator resolves a GitHub review thread, post a reply on that thread explaining the disposition. A reviewer who opens a resolved thread sees the agent's reply, not just a collapsed state.

## Current Behavior

`review.ts` calls `dependencies.resolveReviewThread(worktreePath, comment.threadId)` directly with no preceding reply. Resolved threads are silent: reviewers must click "Show resolved" and see only the original finding — no explanation of what was done.

## Target Behavior

Before resolving each thread:

1. Determine the disposition:
   - If outcome is `patched`: "Fixed in patch commits after `<reviewedHeadSha>`."
   - If thread is being resolved but outcome is not patched: "Resolved as part of review triage — finding noted."
   - (Stretch) If a specific actionable finding linked to a commit SHA is available, include the sha: "Fixed in `<sha>`."

2. Post the reply via GitHub API (REST or GraphQL — see notes).

3. Then call `resolveReviewThread` as today.

Reply failures are best-effort: a failed reply must not block thread resolution.

## Prerequisite — comment REST ID

The GitHub REST reply endpoint `POST /repos/{owner}/{repo}/pulls/comments/{comment_id}/replies` requires the **numeric REST databaseId** of the first comment in the thread, not the GraphQL node ID (`threadId`).

Current state: `AiReviewComment` stores `threadId` (GraphQL node ID) but not `databaseId` (numeric REST ID).

This ticket must resolve one of:

- **Option A**: Add `databaseId` to the `reviewComments` GraphQL fetch and store it in `AiReviewComment`. Use REST reply endpoint.
- **Option B**: Find and use a GraphQL mutation for adding a thread reply (if one exists in the GitHub schema). Use `threadId` directly.

Option A is more canonical and avoids GraphQL mutation discovery. Option B avoids schema/type changes.

If neither option is feasible within a thin PR, the reply can be omitted and this ticket re-scoped to just platform plumbing (adding `replyToReviewThread` to `platform.ts` with a no-op stub and a follow-up ticket for full wiring).

## Change Surface

- `tools/delivery/platform.ts` — `replyToReviewThread(cwd, commentId, body)` function
- `tools/delivery/review.ts` — call `replyToReviewThread` before `resolveReviewThread`; disposition text derivation
- `tools/delivery/review.ts` — `ReviewDependencies` type: add `replyToReviewThread` optional dependency
- If Option A: `AiReviewComment` type in `review.ts` — add `databaseId?: number`
- If Option A: GraphQL fetch query in `review.ts` — add `databaseId` to `reviewComments` node
- `tools/delivery/orchestrator.test.ts` — add test for reply-then-resolve sequence; verify reply failure does not block resolution

## Acceptance Criteria

- [ ] `bun run verify && bun run test` pass
- [ ] Test case: thread resolution flow calls reply before resolve
- [ ] Test case: reply failure (thrown error) does not block resolution — thread is resolved despite failed reply
- [ ] Existing thread resolution tests pass without regression
- [ ] `replyToReviewThread` in `platform.ts` is tested in isolation (or through integration with `review.ts`)

## Notes

- Owner/repo context is needed for the REST endpoint. It can be derived from `gh repo view --json owner,name` in the worktree, or extracted from the existing `resolveReviewThread` GraphQL call context.
- The reply body should be short (1–2 sentences), factual, and machine-generated — not verbose.
- The `replyToReviewThread` dependency should be typed as optional in the `ReviewDependencies` interface so existing tests don't require a stub.
- If `databaseId` is added to the comment schema, it should be treated as `databaseId?: number` (nullable) and the reply should be skipped gracefully when it is absent.
