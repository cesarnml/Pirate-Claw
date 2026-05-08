## Scope delivered

Phase 24 shipped across stacked PRs for `P24.01` through `P24.05` on the `agents/p24-01-...` through `agents/p24-05-...` stack. Delivered scope: a repo-owned Synology daemon supervision artifact, restart-durability proof for config plus SQLite/Plex auth state, a thin in-product Synology Plex compatibility note, restart-copy alignment that stops short of browser return proof, and the docs/overview closeout needed to hand Phase 25 a clean restart contract.

## What went well

The ticket order was correct. Locking the repo-owned Synology artifact first gave the later runtime and copy tickets a concrete contract to validate instead of a moving prose target. The restart-durability work also benefited from treating `pirate-claw.db` and the config file containing `plex.token` as one product boundary; that made the test shape obvious and kept the implementation inside the existing process model rather than drifting into a hot-reload redesign. Reusing shared UI surfaces for the truthfulness slice worked for the same reason: the Plex connection card already sat in the two operator entry points that mattered, so one narrow note corrected the product story without creating a new settings subsystem.

## Pain points

The largest avoidable waste was stale Synology wording that existed in multiple layers at once: README, runbook, restart toasts, and even the first reference artifact revision disagreed about details like the runtime poll-state path and what the browser can actually prove after a restart request. None of those fixes were individually hard, but the stack had to spend real effort reconciling them because the earlier docs were close enough to look right. Another friction point was the orchestrator publication step: `open-pr` routinely looks idle while push hooks and GitHub calls finish, so the real state has to be checked in branch/PR metadata rather than inferred from terminal silence.

## Surprises

The biggest technical surprise was that the original Synology reference artifact still carried a separate `poll-state.json` mount even though the runtime already treats poll state as part of `.pirate-claw/runtime/`. That mattered because Phase 24 was specifically about turning deployment assumptions into a truthful contract; leaving the stale mount in place would have made the new “reference artifact” misleading on day one. A second surprise was how little new code the runtime ticket actually needed once the right proof existed. The daemon's current `SIGTERM` path and shutdown behavior were already close to the needed contract, so the highest-value work was proving the restart boundary with a realistic config/database/Plex-auth test instead of widening the implementation.

## What we'd do differently

We would add a tighter “runtime contract drift” check whenever a phase turns historical runbook knowledge into a repo-owned artifact. The first artifact draft inherited assumptions from older Synology docs that no longer matched the code, and the stack only caught that after the runtime ticket was already underway. The original choice to draft the artifact from the current runbook still made sense because that was the nearest operator-facing source of truth, but Phase 24 showed that “nearest” is not the same as “exact.” We would also make the repo's quiet web-format path less path-sensitive across worktrees; that mismatch was minor, but it repeatedly costs time during stacked delivery.

## Net assessment

Phase 24 achieved its goals. Pirate Claw now has a reviewed Synology restart contract, automated proof that restart-backed config and SQLite/Plex auth state survive together, and UI/docs copy that says exactly what the product can and cannot prove after a restart request. The remaining gap is intentionally the Phase 25 gap: the browser still cannot prove that the daemon came back, only that the restart was requested under a supervisor-backed contract.

## Follow-up

- Phase 25 should build directly on the shipped Phase 24 contract and keep the same durability boundary: writable config directory plus `pirate-claw.db` and runtime artifacts.
- Historical product/docs references that still say “Synology Task Scheduler or systemd” for the current restart path should be cleaned up opportunistically so future planning does not re-import stale supervisor assumptions.
- The delivery tooling should make `open-pr` publication progress more legible during push-hook/PR creation waits, because stacked runs repeatedly have to confirm success indirectly through GitHub state.

_Created: 2026-04-23. Phase 24 stack PRs #214, #215, #216, and #217 open at time of writing._
