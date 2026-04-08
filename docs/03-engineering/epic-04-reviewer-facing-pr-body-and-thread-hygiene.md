# Epic 04: Reviewer-Facing PR Body and Thread Hygiene

This engineering epic addresses three reviewer-experience gaps exposed by the Phase 10 retrospective.

It is intentionally not a numbered Pirate Claw product phase. The target is delivery-tooling reviewer ergonomics, not new CLI or runtime behavior.

## Current Status

- planned; not yet started

## Problem

Phase 10 produced five stacked PRs. PR #84 gave reviewers a complete picture: full finding enumeration, per-finding disposition, clear review status. PRs #85–#88 did not. Three distinct gaps emerged:

### Gap 1 — Stale-SHA notice reads as an alarm without resolution

Every patched PR body includes:

> _the latest recorded external AI review applies to an older branch head; the prior review history is shown below for debugging._

This is technically accurate. The review happened on a prior commit; the patch commit updated the head. But the notice says nothing about whether the review findings were addressed. A reviewer reading it has no confirmation that the patch resolves the review. The notice is a warning without a verdict.

### Gap 2 — PR bodies after patching are thin

When a PR is opened before the external review arrives (the common case in stacked flows), the body is updated reactively after patching. The update format is:

```
### Actions Taken
- `6d88b81` [coderabbit,greptile] fix: accessible sort headers, status badge colors, remove unused import [P10.02]
```

This tells a reviewer _something was patched_ but not:

- what the original findings were
- which ones were acted on
- which were dismissed, or why

PR #84 was different: the review landed before the first `open-pr` call, so all findings were included in the initial body with full per-finding disposition. The `update-pr` path after patching produces a lossy one-liner instead of the equivalent finding list.

### Gap 3 — Review threads are resolved without a prior reply

The orchestrator resolves GitHub inline review threads automatically after a `record-review patched` command. A reviewer arriving after the fact can only see that the thread was resolved — clicking "Show resolved" reveals the original finding, but there is no agent reply explaining what was done or why it was dismissed. Silent resolution is opaque.

## Goal

Eliminate all three gaps without widening into broader orchestrator or PR-flow redesign:

1. When the PR body carries a stale-SHA notice and the outcome is `patched`, append a resolution sentence confirming that subsequent commits address the findings.
2. When a `patched` PR body is rendered, always emit per-finding disposition rows — not a commit one-liner — regardless of whether the review SHA matches the current head.
3. Before resolving a GitHub review thread, post a reply with the disposition: fixed (with patch commit SHA) or dismissed (with reason).

## Why This Is One Epic

All three gaps are in the same reviewer-facing rendering and thread-lifecycle path. They share the same change surface: `tools/delivery/pr-metadata.ts`, `tools/delivery/review.ts`, and `tools/delivery/platform.ts`. None of them widens into ticket orchestration, PR creation, or delivery-state management.

## In Scope

- `pr-metadata.ts`: stale-SHA resolution sentence; finding disposition on patched bodies
- `review.ts`: thread reply before resolve; disposition text derivation
- `platform.ts`: `replyToReviewThread` function (REST or GraphQL path)
- comment fetch query: expose `databaseId` (numeric REST ID) if needed for the reply endpoint
- test coverage for all three behaviors under the `patched` + stale-SHA condition

## Intentionally Out of Scope

- PR creation flow or stacked base chaining
- ticket orchestration or delivery-state repair
- `closeout-stack` behavior
- changing when or how reviews are polled or triaged
- reviewer-facing body changes outside the `patched` + stale-SHA scenario

## Locked Decisions

- the three gaps are addressed in ticket order: stale-SHA sentence → finding disposition → thread reply
- thread reply is best-effort and never blocks resolution or the patched record
- finding disposition on patched bodies should match the format already used when review SHA equals head SHA (i.e., use `buildResolvedFindingBullets`, not a new format)
- `replyToReviewThread` lives in `platform.ts` alongside `resolveReviewThread`
- if `databaseId` is not already in the comment schema, it must be added to the GraphQL fetch before ticket EE4.03 can land

## Out of Scope

- PR creation flow redesign
- branch naming, worktree, or bootstrap redesign
- `closeout-stack` redesign
- standalone vs. ticket-linked flow convergence (that is Epic 02's domain)

## Target Decomposition

```
EE4.01 — stale-SHA resolution sentence
EE4.02 — per-finding disposition on patched PR bodies
EE4.03 — thread reply before resolve
```

All three are in `pr-metadata.ts` / `review.ts` / `platform.ts`. Ticket order matters: EE4.01 and EE4.02 are independent of each other but both lay groundwork that makes EE4.03's reply text meaningful.
