# `E2.01 Review Lifecycle Contract Baseline`

## Goal

Document and lock the shared post-PR review lifecycle semantics with focused tests before any architectural extraction starts.

## Why This Ticket Exists

The repo already has partial convergence plus drift. This ticket creates a stable contract for what must match between ticket-linked and standalone review flows so later refactors do not silently move behavior.

## Scope

- add or tighten tests that explicitly pin shared semantics across both flows
- cover cumulative `patched` preservation
- cover no-feedback `clean` recording
- cover partial-timeout note behavior
- cover stale-history presentation against newer branch heads
- cover reviewer-facing parity where both flows are expected to say the same thing
- document the convergence target and intentional separations in the epic and implementation plan docs if needed for clarity

## Acceptance Criteria

- tests fail if ticket-linked and standalone flows diverge on cumulative `patched` semantics
- tests fail if timeout or no-feedback notes drift between the two paths where semantics should match
- tests fail if reviewer-facing stale-history presentation drifts between the two paths
- the epic and implementation plan clearly define the post-PR convergence boundary and the intentionally separate areas

## Why This PR Stays Reviewable

This ticket is limited to tests and planning-doc clarification. It does not yet change runtime architecture, command wiring, or persistence behavior.

## Out Of Scope

- helper extraction
- command rewiring
- storage changes
- PR metadata refresh rewrites

## Rationale

- `Red first:` the first failure should be a contract-level regression where two paths that represent the same review semantics stop agreeing.
- `Why this path:` test-first convergence is the smallest acceptable way to keep later refactors honest without widening into implementation before the boundary is locked.
- `Alternative considered:` starting with helper extraction was rejected because it would make review harder and hide whether the new seam actually preserved existing semantics.
- `Deferred:` all helper extraction, persistence convergence, and command rewiring remain for later tickets.
- `Follow-up locked in this ticket:` standalone `ai-review` execution now has explicit parity coverage against ticket-linked polling for cumulative `patched` carry-forward and timeout-without-findings notes, so later convergence work has to preserve both paths together instead of only keeping isolated tests green.
- `Review follow-up:` CodeRabbit caught that the newly injected standalone PR-body updater seam accepted async implementations in practice but its two call sites were still sync-only. The fix widened the callback contract to `void | Promise<void>` and awaited both standalone update calls so rejected async updates flow into the existing warning path instead of escaping the surrounding `try/catch`.
