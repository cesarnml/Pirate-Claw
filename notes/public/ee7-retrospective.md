# EE7 Retrospective

_Engineering Epic 07: Configurable Ticket-Boundary Modes For Son-of-Anton — stacked PRs #144, #145, #146, #147_

---

## Scope delivered

EE7 shipped as four linked PRs on `agents/ee7-01-boundary-policy-plumbing-and-visibility` through `agents/ee7-04-docs-skill-guidance-and-workflow-examples`: `#144` added `ticketBoundaryMode` config and CLI plumbing, `#145` finalized `gated` reset guidance and the canonical resume prompt, `#146` restored `cook` continuation and explicit `glide -> gated` fallback, and `#147` aligned the delivery docs and Son-of-Anton skill with the shipped mode semantics.

## What went well

The ticket split was right. EE7.01 established the config and status surface first, which made the later behavior tickets smaller and easier to verify because the mode plumbing already existed. The `cook` implementation also landed cleanly once it was framed as composition of existing `advance` and `start` paths rather than new ticket-start logic inside `advance`; that kept worktree bootstrap, handoff creation, and branch setup on the existing code path instead of creating a second implementation seam.

The `gated` resume prompt wording paid off immediately. Making the next-session prompt explicit as “immediately execute `bun run deliver --plan <plan> start`, read the generated handoff artifact as the source of truth for context, and implement <ticket>`” is materially better than a bare terminal instruction because it suppresses exploratory drift and makes the handoff contract concrete.

External AI review also added signal instead of noise. CodeRabbit caught a real test-fixture mismatch in EE7.03 and a real robustness gap where `cook` continuation resolved a target ticket but still called `startTicket` without passing the resolved id. Both were minor, but both tightened the contract and test coverage in a way worth keeping.

## Pain points

The biggest friction was operational, not architectural: the orchestrator state remains anchored to the working directory where `bun run deliver` is invoked. Running control commands from a ticket worktree can create a second `.agents/delivery/.../state.json` and derive nonsense nested worktree paths. The workaround was to treat the primary repo root as authoritative for stateful orchestrator commands and the ticket worktree as authoritative for code edits. That is avoidable waste and should become a tooling follow-up, not a permanent operator habit.

The docs-only fast path is still split awkwardly. Repo policy is clear that markdown-only PRs skip external AI review, but `open-pr` still prints the generic 6/12-minute review window and `poll-review` remains the place where the skip actually resolves. That mismatch already produced confusion during EE7.04 and required an explicit clean recording even though `docOnly: true` was already persisted in state.

## Surprises

The operator guide had drifted further than expected. `docs/03-engineering/delivery-orchestrator.md` was not just stale on EE6 compaction language; it also documented forward-looking review-policy config fields that do not exist in the shipped orchestrator. The docs ticket therefore had to correct both the boundary-mode story and the config surface, not just update examples.

Another surprise was that `EE7.03` could be functionally correct while still leaving a subtle selection divergence. The code resolved `nextPending` before deciding whether to auto-start in `cook`, but the original implementation still called `startTicket` without the resolved ticket id, relying on implicit selection. That would have stayed harmless until the selection logic changed; CodeRabbit surfaced it before it became a latent bug.

## What we'd do differently

If starting EE7 again, I would explicitly separate “state authority” from “code authority” in the orchestrator design before running the stack. The current “run control commands from root, edit in worktree” pattern works, but only because the operator knows the trap. The original design likely assumed one checkout would stay authoritative for both, which is understandable, but multi-worktree stacked delivery makes that assumption too weak.

I would also tighten docs-only review behavior as part of the same epic if the implementation window allowed it. EE7 changed the ticket-boundary contract, and docs-only guidance is part of that operator experience. Leaving the skip behavior split between persisted state and command messaging makes the workflow look less deterministic than it actually is.

## Net assessment

EE7 achieved its stated goal. Son-of-Anton now has an explicit boundary policy model instead of an accidental EE6 gated default, `cook` is restored as the repo-default continuation path, `gated` has a durable reset contract with a canonical resume prompt, and `glide` remains visible as a future-facing mode without pretending repo-local tooling can force host-runtime self-reset. The main gap is not in the behavior model; it is in a few remaining operator-surface rough edges around docs-only review messaging and multi-worktree state authority.

## Follow-up

- Fix the docs-only `open-pr` / `poll-review` UX mismatch so `docOnly: true` leads to obvious immediate-clean behavior without requiring operator interpretation.
- Add a durable orchestrator mechanism for authoritative state location or state mirroring across worktrees so stacked delivery does not depend on “run stateful commands from root” tribal knowledge.
- Consider a future epic for real `glide` support only if the active host agent/runtime exposes a trustworthy self-reset primitive; do not fake this in repo-local code.

_Created: 2026-04-13. PRs #144, #145, #146, and #147 open._
