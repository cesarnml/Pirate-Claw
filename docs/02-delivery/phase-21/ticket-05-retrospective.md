# P21.05 Phase 21 Retrospective and Doc Update

## Type

`docs`

## Summary

Capture Phase 21 delivery lessons and update relevant docs. This is the closeout ticket for the bootstrap-contract phase.

## Scope

- Update `delivery-orchestrator.md` for any behavioral changes or clarifications that emerged during P21 delivery.
- Add a retrospective section to this ticket summarizing: what went smoothly, what was deferred, key design decisions that held, and anything that should inform P22 planning.
- Update `MEMORY.md` / `project-state.md` if the project state snapshot is stale after phase completion.
- Update the Phase 21 implementation plan `Delivery status` field to reflect completion.

## Acceptance

- All doc updates are committed.
- Retrospective section is filled in below.
- `project-state.md` reflects P21 as complete.

## Review Policy

Doc-only ticket — all three review stages (`selfAudit`, `codexPreflight`, `externalReview`) auto-skip under the repo `skip_doc_only` policy.

## Retrospective

### What went smoothly

- `ensureStarterConfig` was a clean single-responsibility function — easy to test in isolation and easy to call from the startup path.
- `GET /api/setup/state` required no new DB queries or heavyweight logic; reading `_starter` from the in-memory config was the entire implementation.
- SvelteKit layout load was the right integration point for setup state — one fetch per page load, exposed to all routes through `LayoutData`, and zero polling complexity.
- The `requireCompactTvShows` validator change (accept empty arrays) was surgical and well-scoped; it didn't open the door to broader schema changes.
- Codex preflight on P21.03 found no issues — the implementation was clean on first pass.
- P21.04 (README) captured both platforms in one place and was straightforward to write once the code behavior was confirmed.

### What was harder than expected

- The `setupState` field addition to `+layout.server.ts` cascaded type errors across nine test files — all needed `setupState: 'ready'` added to their data fixtures. Mechanical, but more surface area than expected for a layout-level change.
- SvelteKit's generated `LayoutData` type is strict; the test files' `Pick<PageData, ...>` types needed `'setupState'` added explicitly where they were used as partial types.

### Key design decisions that held

- `_starter: true` sentinel field in the config JSON — simple, validator-transparent, and operator-removable by any write.
- Fallback to `'partially_configured'` when `/api/setup/state` fails — safe default that shows the normal UI without breaking the page.
- No polling in the UI — setup state fetched once per page load is sufficient for P21; the operator either has starter mode or doesn't after a daemon restart.
- Plex token left empty in starter config (not fake/placeholder) — honest representation of unconfigured state.
- Transmission credentials `"admin"/"admin"` in starter config — matches `linuxserver/transmission` auth-disabled default; no surprises for Synology users.

### Deferrals that held (do not revisit without a clear trigger)

- Corrupt/malformed config recovery → P22
- Browser onboarding wizard / config editing from starter mode → P22
- Plex connectivity version check surfaced in the browser → P22
- Mac launchd supervisor / auto-restart → P23
- Synology supervisor contract beyond single start → P23

### Inputs for P22 planning

- The starter-mode splash in P21 is intentionally minimal (heading + description). P22 owns the full onboarding flow from that splash — it can reuse `data.setupState === 'starter'` as the entry condition.
- `partially_configured` state (sentinel removed, some fields still default) is the expected post-first-write state. P22's onboarding flow should handle this transition gracefully.
- The `_starter` sentinel being removed on any operator write means the browser can naturally move from starter → partially_configured → ready as the operator fills in fields. P22 can rely on this without any new API contract.
- Plex version check (minimum 1.19.0 documented in README) was left as a README note in P21. P22 may want to surface a connectivity error in the UI if the Plex token is present but the server is unreachable or responds with a version incompatibility.
