# `E2.02 Shared Outcome And Note Accumulator`

## Goal

Extract one shared semantic core for cumulative review outcomes and repeated-pass note handling.

## Why This Ticket Exists

The most obvious drift-prone logic is the meaning of repeated review passes: especially when earlier review cycles were `patched` and a later pass is `clean` or finds no review at all. That behavior is already important and already tested, but it still sits in multiple branches.

## Scope

- extract shared helpers for cumulative review outcome merging
- extract shared helpers for repeated-pass note formatting, including prior `patched` follow-up behavior
- normalize any mode-specific mapping at the seam, such as standalone conversion from `needs_patch` to `operator_input_needed`
- rewire ticket-linked polling and manual review recording to use the shared helpers
- rewire standalone review recording to use the same semantic core

## Acceptance Criteria

- ticket-linked `pollReview` and `recordReview` use the shared outcome/note helpers
- standalone `ai-review` uses the same outcome/note helpers
- cumulative `patched` is never downgraded by a later `clean` or no-feedback pass
- existing behavior-level tests continue to pass without semantic drift

## Why This PR Stays Reviewable

This ticket is intentionally pure-logic heavy. It changes the smallest shared semantic seam first, with little or no change to storage layout, artifact writing, or PR-body rendering.

## Out Of Scope

- artifact writing convergence
- thread-resolution convergence
- PR metadata refresh convergence

## Rationale

- `Red first:` the first failure should be a repeated-review case where one flow preserves `patched` and the other effectively forgets it.
- `Why this path:` outcome accumulation is the narrowest high-value seam because it is easy to review, heavily testable, and already known to drift.
- `Alternative considered:` extracting the whole review-recording pipeline first was rejected because it would produce a larger PR with more moving parts and less obvious semantic safety.
- `Deferred:` artifact processing, timeout/clean handling, and PR metadata refresh stay in later tickets.
- `Implemented seam:` shared helpers now own cumulative outcome accumulation, repeated-pass clean-after-patched note formatting, no-feedback clean note reuse, and the standalone-only `needs_patch -> operator_input_needed` mapping, while existing polling and recording code keeps ownership of mode-specific status and storage behavior.
- `Review follow-up:` CodeRabbit surfaced one real regression in the shared note path: `record-review ... clean` could reuse a stale unresolved note when no fresh note was supplied after an `operator_input_needed` pass. The fix now defaults clean finalization to a fresh clean note and locks the `patched -> operator_input_needed -> clean-without-note` case with a regression test.
