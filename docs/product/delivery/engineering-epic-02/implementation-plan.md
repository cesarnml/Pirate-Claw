# Engineering Epic 02 Implementation Plan

Engineering Epic 02 converges the delivery orchestrator's post-PR external AI-review lifecycle for ticket-linked and standalone PR flows without widening into a full orchestrator rewrite.

## Epic

- `Engineering Epic 02 Delivery Orchestrator PR-Flow Convergence`

Follow the shared guidance in [`docs/product/delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this epic. If scope still feels fuzzy, use `grill-me` before implementation.

## Ticket Order

1. `E2.01 Review Lifecycle Contract Baseline`
2. `E2.02 Shared Outcome And Note Accumulator`
3. `E2.03 Shared Detected-Review Processing Core`
4. `E2.04 Shared Clean And Timeout Recording Core`
5. `E2.05 Shared Review Metadata Refresh Adapter`
6. `E2.06 Command Rewire And Doc Convergence`

## Ticket Files

- `ticket-01-review-lifecycle-contract-baseline.md`
- `ticket-02-shared-outcome-and-note-accumulator.md`
- `ticket-03-shared-detected-review-processing-core.md`
- `ticket-04-shared-clean-and-timeout-recording-core.md`
- `ticket-05-shared-review-metadata-refresh-adapter.md`
- `ticket-06-command-rewire-and-doc-convergence.md`

## Exit Condition

Ticket-linked and standalone PR review flows share one post-PR external AI-review lifecycle core for polling follow-up, review recording, cumulative outcome semantics, reviewer-facing state/history rendering, and PR metadata refresh, while preserving intentional differences in ticket orchestration and standalone author-body handling.

## What Should Be Unified

- polling result interpretation after a PR exists
- detected-review processing
- no-review and timeout handling
- cumulative `patched` outcome preservation
- note formatting for repeated review passes
- normalized review-state and stale-history presentation
- reviewer-facing PR metadata refresh from recorded review state
- thread-resolution persistence behavior where applicable

## What Should Remain Separate

- ticket plan parsing, handoffs, stacked base chaining, and ticket status progression
- standalone PR discovery and preservation of author-owned body content
- mode-specific storage roots:
  - ticket-linked: `.agents/delivery/<plan-key>/...`
  - standalone: `.agents/ai-review/pr-<number>/...`

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- the previous tests are green
- the previous ticket doc contains rationale and any non-redundant follow-up notes
- the convergence boundary for this epic remains unchanged
- the previous PR still feels comfortably reviewable on its own

## Explicit Deferrals

These are intentionally out of scope for Engineering Epic 02:

- PR creation/base-selection redesign
- branch/worktree/bootstrap redesign
- `closeout-stack` redesign
- `sync` / `repair-state` redesign
- `ai-code-review` vendor fetcher and triager contract redesign
- universal review artifact storage
- broader notification redesign

## Stop Conditions

Pause for review if:

- convergence work starts pulling in pre-PR ticket orchestration or closeout-stack logic
- a proposed helper cannot be introduced without also redesigning storage layout across both flows
- a ticket grows large enough that the resulting stacked PR would no longer be comfortably reviewable on its own
- the intended separation between ticket-linked state and standalone author-owned PR content becomes ambiguous
