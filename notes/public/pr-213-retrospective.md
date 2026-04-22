## Scope delivered

PR #213 on `agents/standalone-orchestrator-worktree-handoff-materialization` makes `bun run deliver --plan <plan> start` leave the started ticket worktree locally self-sufficient for active-ticket continuation. It adds bounded worktree materialization for delivery artifacts, expands fresh-worktree bootstrap from `.env` alone to a fixed ignored-file allowlist, adds orchestrator regression coverage for first-ticket and middle-ticket materialization behavior, and updates the delivery tooling docs/SoA skill to match the new contract.

## What went well

The change stayed bounded because the contract was defined in terms of active-ticket continuation rather than “mirror everything.” That made the implementation testable: current ticket plus immediate predecessor, overwrite orchestrator-owned delivery artifacts, never overwrite user-owned ignored bootstrap files. The existing `startTicket` seam in `ticket-flow` also made it straightforward to inject deterministic materialization behavior without redesigning the whole state model.

## Pain points

The main friction was that the old workflow mixed two different concerns under “fresh worktree setup”: repo usability inputs like `.env`, and orchestrator-owned workflow state like `state.json` and handoffs. That ambiguity was avoidable waste because it pushed critical continuation behavior into agent initiative instead of code. A second pain point was that the previous docs described artifact spreading across worktrees in a way that was true for aggregate history but misleading for active-ticket continuation.

## Surprises

The biggest surprise was how small the code change needed to be once the boundary was phrased correctly. The real fix was not a global multi-worktree sync feature; it was “`start` must materialize the bounded continuation set into the started worktree.” Another useful surprise was that `.gitignore` belongs in the bootstrap allowlist for new worktrees because delivery artifacts are gitignored and the fresh worktree should behave like the invoking checkout immediately.

## What we'd do differently

We should have made active-ticket continuation a tool-enforced invariant earlier instead of documenting a workflow that quietly relied on agents rediscovering artifacts. The previous design looked acceptable because the orchestrator already generated handoffs and state, but the missing step was materializing that state into the new worktree that was supposed to continue the ticket. In hindsight, “generate” without “make locally usable” was an incomplete contract.

## Net assessment

This PR achieves the intended tooling boundary change. The orchestrator now owns fresh-ticket continuation state instead of leaving it to agent initiative, while still keeping full-phase aggregate mirroring explicitly out of scope. That is the right level of determinism for the delivery path.

## Follow-up

- Watch whether `current + immediate predecessor` remains sufficient as handoff content evolves; if handoffs start referencing broader history, change the handoff contract before widening the copy scope.
- If closeout and aggregate reporting remain painful, solve that as a separate explicit mirror/aggregation feature rather than quietly expanding `start`.
- Consider adding a configurable allowlist for fresh-worktree ignored bootstrap files only if real repo usage outgrows the fixed list shipped here.

_Created: 2026-04-22. PR #213 open._
