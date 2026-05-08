## Scope delivered

Phase 23 shipped across stacked PRs for `P23.01` through `P23.05` on the `agents/p23-01-...` through `agents/p23-05-...` stack. The delivered scope was: durable Plex device identity and auth-session storage, hosted browser connect from `/config` and onboarding, persisted `plex.token` updates through the existing config path, best-effort silent renewal with reconnect-required UI states, and the operator/docs closeout needed to make Phase 24 restart assumptions explicit.

## What went well

Using the stacked orchestrator flow kept the auth boundary reviewable because each ticket landed one contract at a time: identity first, then browser connect, then shared UI, then renewal. The best technical decision was keeping the current usable Plex credential in `plex.token` while storing the renewal-sensitive device identity in SQLite; that let the existing Plex enrichment surface keep working with minimal churn while still giving renewal a durable server-owned home. The renewal wrapper around the existing Plex HTTP client also paid off because it localized startup, first-touch, and auth-failure retry behavior without forcing the enrichment code to learn a second auth API.

## Pain points

The largest avoidable waste was the original Phase 23 plan text saying “Managed OAuth” even though Plex’s current official contract is the hosted PIN + JWK/JWT flow. That mismatch was only caught once implementation started, which forced a real stop condition and a `P23.01` foundation patch before the rest of the stack could proceed safely. Another recurring friction point was missing generated handoff artifacts in child worktrees; the orchestrator state advanced correctly, but the expected handoff file path was often absent in the new worktree, so ticket context had to be rebuilt from the ticket doc plus repo state.

## Surprises

The biggest surprise was that Plex’s current renewal model depends on durable device key material, not just a stored token or a browser callback session. That changed `P23.01` from “session metadata only” into a real persisted cryptographic identity slice. A second surprise was that the repo’s `open-pr` path effectively enforces the broader `ci:quiet` gate through push hooks, not just `verify`, so `P23.03` exposed stale web test assumptions that the narrower verify path did not touch. That was useful signal, but it meant the real ticket boundary was “green under push-hook CI,” not just “green under verify.”

## What we'd do differently

We would update the implementation plan before starting code whenever the external platform contract is even slightly unstable. The original “Managed OAuth” phrasing looked plausible because the product goal was browser-managed auth with renewal, but the official Plex docs had already converged on a PIN + device-JWT model. We would also make the orchestrator materialize handoff artifacts directly into each started worktree instead of only recording the relative path in state; the current behavior is survivable, but it burns time at every ticket boundary.

## Net assessment

Phase 23 achieved its goals. Pirate Claw no longer pushes operators toward manual Plex token extraction, it persists the device identity needed for renewal across restarts, it attempts best-effort silent renewal on the daemon side, and it surfaces explicit reconnect-required states when renewal fails. The remaining risk is not within the Phase 23 auth contract itself; it is the Phase 24 supervision problem of keeping the config file and SQLite auth state mounted and restarted together.

## Follow-up

- Phase 24 should treat `pirate-claw.db` and the config file containing `plex.token` as one durability boundary; supervising one without the other will break the renewal contract.
- The delivery orchestrator should materialize generated handoff artifacts into each started worktree so later ticket sessions do not have to rediscover context manually.
- The repo should consider aligning `verify` and push-hook CI more closely, or at least documenting the difference prominently, because stacked delivery currently discovers some test-shape failures only at `open-pr` time.

_Created: 2026-04-22. Phase 23 stack PRs #208, #209, #210, and #211 open at time of writing._
