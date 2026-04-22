# P13 Retrospective

_Phase 13: Write Endpoints and Auth — P13.01–P13.07_

---

## Scope delivered

Seven stacked PRs delivering bounded runtime writes behind bearer-token auth and `If-Match` ETag concurrency. Closed via `bun run closeout-stack`. First squash hit a merge conflict on `test/api.test.ts` at P13.02; recovery followed the closeout skill (reset to `origin/main`, per-ticket manual squash).

---

## What went well

- Orchestrator state matched implementation order; daemon and dashboard behavior aligned with the product contract.
- Manual closeout recovery worked correctly: reset to `origin/main`, per-ticket `merge --squash`, conflicts taken with `--theirs` (correct convention for stacked branches). Clean squash sequence to `main`.
- Post-closeout, config tests were hardened so `PIRATE_CLAW_API_WRITE_TOKEN` in a developer's real `.env` does not flip expectations. The fix (explicit `env` / `delete process.env` in targeted tests) is now a stable pattern for API token test isolation.

---

## Pain points

- `main`'s `.agents/delivery/phase-13/state.json` was stale relative to the P13.07 worktree. Closeout required manually copying the up-to-date state file before running the tool — using stale state would have produced wrong PR numbers and ticket order during the merge sequence.
- Several tickets conflicted on `src/api.ts` / `test/api.test.ts` / `web/src/routes/config/*` during squash. `git checkout --theirs` was the reliable resolution strategy for stacked branches, but required knowing this convention before attempting recovery.

---

## Surprises

- The `state.json` drift between worktrees was the first time this failure mode was encountered operationally. The problem is structural: `deliver` writes state only in the cwd where it runs, so the primary `main` checkout accumulates stale data as delivery advances through ticket worktrees. This was not a known gap before Phase 13 closeout.

---

## What we'd do differently

Copy `state.json` from the active delivery worktree to the `main` checkout after every `advance`. The P13 closeout incident was the concrete driver for this practice. It is now documented in `docs/03-engineering/delivery-orchestrator.md` and the `closeout-stack` skill.

---

## Follow-up

- **Done:** `delivery-orchestrator.md` now explains that `state.json` is written only in the cwd used for `deliver`, recommends copying it to the primary `main` checkout after each `advance`, and states the stance (active worktree authoritative; mirror on `main` after advance).
- **Done:** `closeout-stack` skill updated with `state.json` sync step and a recovery checklist that includes writing the phase retrospective when manual recovery is used.

---

_Created: 2026-04-08._
