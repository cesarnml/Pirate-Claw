# EE4.03 — Thread Reply Before Resolve

## Goal

Before the orchestrator resolves a GitHub review thread, post a reply on that thread explaining the disposition. A reviewer who opens a resolved thread sees the agent's reply, not just a collapsed state.

## Current Behavior

`review.ts` calls `dependencies.resolveReviewThread(worktreePath, comment.threadId)` directly with no preceding reply. Resolved threads are silent: reviewers must click "Show resolved" and see only the original finding — no explanation of what was done.

## Target Behavior

Before resolving each thread:

1. Post a generic reply: "Addressed during patch phase — see PR body for full finding disposition."
2. Then call `resolveReviewThread` as today.

Reply failures are best-effort: a failed reply must not block thread resolution.

## Prerequisite — comment REST ID

The GitHub REST reply endpoint `POST /repos/{owner}/{repo}/pulls/comments/{comment_id}/replies` requires the **numeric REST databaseId** of the first comment in the thread, not the GraphQL node ID (`threadId`).

**Approach: Option A** — add `databaseId` to the `reviewComments` GraphQL fetch and store it in `AiReviewComment`. Use the REST reply endpoint `POST /repos/{owner}/{repo}/pulls/comments/{comment_id}/replies`.

The reply text is generic: "Addressed during patch phase — see PR body for full finding disposition." Per-finding disposition in thread replies is a follow-up concern.

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
