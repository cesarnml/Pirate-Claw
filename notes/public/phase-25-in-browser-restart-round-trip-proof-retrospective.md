## Scope delivered

Phase 25 shipped across stacked PRs for `P25.01` through `P25.04` on the `agents/p25-01-...` through `agents/p25-04-...` stack. Delivered scope: a durable restart-proof artifact and read API, a real `/config` restart round trip that survives daemon downtime and proves return, shared browser restart vocabulary with a bounded `failed_to_return` state, and the docs/overview closeout needed to hand Phase 26 a truthful restart contract.

## What went well

The ticket order held up. Locking the durable restart-proof contract first made the later browser work mechanical instead of speculative, because every UI state could point at one persisted `requestId` boundary instead of inventing timing heuristics independently. The second useful pattern was keeping the browser round trip on same-origin SvelteKit routes rather than teaching client code about private daemon URLs or tokens; that preserved the existing server-side trust boundary and made the reconnect path reviewable through ordinary route tests. The third repeatable win was treating `failed_to_return` as a client-state concern layered on top of a durable success proof. That kept the daemon API minimal while still giving the product a truthful failure endpoint.

## Pain points

The main avoidable waste was Bun's worktree-local `web/node_modules` bootstrap behavior. In fresh ticket worktrees, rerunning the normal quiet verification flow after an install could fail with symlink-collision errors inside `bun install --cwd web --frozen-lockfile`, which meant verification had to keep resetting `web/node_modules` before the repo-standard gates would run cleanly. Another pain point was stale Phase 24/25 wording spread across README, overview docs, layout banner copy, and onboarding readiness messaging. None of those edits were individually hard, but Phase 25 had to spend time reconciling multiple almost-correct stories about what the browser can prove.

## Surprises

The biggest product surprise was how much restart truth lives in browser-state transitions rather than the daemon payload itself. The durable backend only needs to know whether a restart request was made and later satisfied; the `restarting` and `failed_to_return` narration belongs to the browser because those states are about what the operator can observe while the API is temporarily absent. A second surprise was that the app-shell and onboarding surfaces were already coupled to restart semantics through readiness gating even though they never owned the restart action. That made “shared vocabulary” real product work, not just copy cleanup.

## What we'd do differently

We would add a repo-local helper or command for clean web dependency bootstrap in generated worktrees before Phase 26 starts. The original orchestrator choice to bootstrap worktrees automatically was still correct because most stacked tickets need a ready environment immediately, but Phase 25 showed that the Bun/web install path is not reliably idempotent in this repo's worktree pattern. On the product side, we would probably formalize shared restart copy earlier. The initial Phase 25 design quite reasonably focused on `/config` as the first visible slice, but once that landed it became obvious that layout/onboarding wording should have shared a single state model from the start rather than catching up one ticket later.

## Net assessment

Phase 25 achieved its goal. Pirate Claw now lets the browser request restart, survive the temporary daemon outage, prove successful return from the restarted daemon instance, and stop lying when the daemon does not come back within the bounded window. The remaining gap is intentionally Phase 26 work: credible always-on deployment outside the reviewed Synology restart boundary.

## Follow-up

- Phase 26 should preserve the shipped split between durable success proof and browser-owned timeout narration instead of pushing `failed_to_return` into a second daemon-side state store.
- The repo should fix or wrap the Bun web bootstrap path so `verify:quiet` and `ci:quiet` do not require manual `web/node_modules` resets inside stacked worktrees.
- If a future phase adds another restart entry point, it should reuse the shared restart-roundtrip helper instead of reintroducing one-off polling and copy.

_Created: 2026-04-23. Phase 25 stack PRs #219, #220, #221, and #222 open at time of writing._
