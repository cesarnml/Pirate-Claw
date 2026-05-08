# Epic 02: Delivery Orchestrator PR-Flow Convergence

This engineering epic tracks convergence of the delivery orchestrator's post-PR external AI-review lifecycle.

It is intentionally not a numbered Pirate Claw product phase. The target is maintainer workflow architecture, not new CLI or runtime behavior.

## Goal

Unify the shared concepts that already exist in both ticket-linked and standalone PR review flows so they stop drifting in behavior and presentation.

The practical problem is no longer just PR-body cleanup. Ticket-linked and standalone paths still duplicate the same review lifecycle concepts with separate control flow and separate local persistence rules, which has already produced semantic drift around cumulative `patched` handling, review-state/history presentation, and where review follow-up behavior lives.

## Why This Is One Epic

The affected seams all sit inside one bounded architectural area: what happens after a PR already exists and the orchestrator begins external AI-review polling, triage recording, reviewer-facing status refresh, and follow-up reporting.

This remains one epic as long as it stays inside that post-PR review lifecycle boundary.

If implementation starts pulling in broader ticket orchestration, PR creation/base chaining, delivery-state repair, or closeout-stack redesign, that work should split into a separate follow-up epic instead of widening this one.

## In Scope

- one shared review lifecycle contract for ticket-linked and standalone PRs after the PR exists
- one shared semantic model for:
  - detected-review handling
  - no-review / timeout handling
  - cumulative `clean` / `patched` outcome preservation
  - review-state and review-history presentation
  - reviewer-facing PR metadata refresh from recorded review state
- one shared architecture for artifact writing and thread-resolution persistence, while preserving mode-specific storage roots
- regression coverage that locks the two flows to the same practical semantics where they are supposed to match

## Intentionally Separate

- ticket orchestration concerns:
  - plan parsing
  - ticket ordering
  - handoff generation
  - `start`, `advance`, `restack`, `sync`, and `repair-state`
  - stacked PR base chaining
- standalone PR concerns:
  - resolving the current PR from repo state
  - preserving author-owned body content outside the managed AI-review section
  - standalone local note storage under `.agents/ai-review/`
- ticket-linked delivery concerns:
  - ticket status transitions and plan-keyed delivery state under `.agents/delivery/<plan-key>/`
  - stacked ticket handoff and next-ticket context reset rules

## Locked Decisions

- the convergence target is the post-PR external AI-review lifecycle, not the entire orchestrator
- shared semantics matter more than forcing identical storage layouts
- reviewer-sized stacked PRs take priority over maximal architectural neatness
- a ticket that would likely become a `5 point` PR in this repo must be split again before implementation
- once approved, this engineering epic should use the same delivery discipline as a product phase: thin tickets, stacked PR order, stop at each review boundary

## Out Of Scope

- PR creation flow redesign
- branch naming, worktree creation, or bootstrap redesign
- `closeout-stack` redesign
- `ai-code-review` vendor fetcher or triager contract redesign
- artifact storage unification into one universal path
- Telegram notification redesign beyond bounded helper reuse needed for the converged lifecycle

## Intended Outcome

After this epic lands:

- ticket-linked and standalone PR review flows share one post-PR review lifecycle core
- cumulative `patched` outcome semantics are preserved consistently in both flows
- reviewer-facing review state and stale-history presentation come from the same normalized model
- remaining differences between the flows are documented as intentional mode-specific boundaries rather than accidental drift

## Source-Of-Truth Seams

The current architectural seams to converge are visible in:

- ticket-linked polling and recording:
  - [`tools/delivery/orchestrator.ts`](/Users/cesar/.codex/worktrees/8a3d/pirate_claw/tools/delivery/orchestrator.ts#L2497)
  - [`tools/delivery/orchestrator.ts`](/Users/cesar/.codex/worktrees/8a3d/pirate_claw/tools/delivery/orchestrator.ts#L2841)
- standalone polling and recording:
  - [`tools/delivery/orchestrator.ts`](/Users/cesar/.codex/worktrees/8a3d/pirate_claw/tools/delivery/orchestrator.ts#L2673)
- already-shared reviewer-facing rendering seams:
  - [`tools/delivery/orchestrator.ts`](/Users/cesar/.codex/worktrees/8a3d/pirate_claw/tools/delivery/orchestrator.ts#L3312)
  - [`tools/delivery/orchestrator.ts`](/Users/cesar/.codex/worktrees/8a3d/pirate_claw/tools/delivery/orchestrator.ts#L4287)

## Delivery Shape

The approved runnable companion plan for this epic should live at:

- [`docs/product/delivery/engineering-epic-02/implementation-plan.md`](/Users/cesar/.codex/worktrees/8a3d/pirate_claw/docs/product/delivery/engineering-epic-02/implementation-plan.md)

The planned ticket stack is intentionally thinner than the architectural story alone would suggest. That is deliberate. Reviewable stacked PRs are the primary constraint for this epic.
