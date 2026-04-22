# Phase 23 Implementation Plan

**Status:** Not started — ticket decomposition proposed; awaiting developer approval.

Phase 23 replaces manual Plex token entry with browser-managed Plex auth, persists the device identity needed for renewal, and adds best-effort silent credential renewal plus explicit reconnect-required UI states when renewal fails.

## Epic

- `Phase 23 Plex Browser Auth and Credential Lifecycle`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Product contract

- [`docs/01-product/phase-23-plex-browser-auth-and-credential-lifecycle.md`](../../01-product/phase-23-plex-browser-auth-and-credential-lifecycle.md)

## Grill-Me decisions locked for this phase (2026-04-22)

- `plex.url` remains an explicit operator-managed PMS URL; Phase 23 does **not** own server discovery or selection
- Phase 23 uses Plex's current recommended browser-oriented auth flow, not a nicer wrapper around manual token extraction
- Phase 23 uses Plex Managed OAuth (redirect + refresh-token flow), not the PIN polling flow; PIN-derived `X-Plex-Token` behavior is too brittle for Pirate Claw's reconnect and renewal contract
- the current usable Plex credential continues to live in `plex.token`; no new JWT-specific config shape is introduced
- Phase 23 scope is expanded beyond first-run connect to include persisted device identity plus best-effort silent renewal
- renewal failures surface as reconnect-required UI state rather than a silent broken integration
- device identity / key material is durable product state and should not require operator-authored JSON editing
- onboarding and `/config` share the same Plex auth primitives; no wizard-only Plex flow
- PMS reachability/version compatibility remains a separate concern from account auth state and should not be collapsed into a single "Plex OK" flag
- `P23.01` is foundation-only: auth session + durable device identity, but no `plex.token` write path yet
- `P23.02` is the first true vertical slice: operator-visible Connect affordance, browser round-trip, and persisted `plex.token`
- `P23.03` owns both onboarding and `/config` integration together so Pirate Claw ships one Plex connection story, not two diverging ones
- `P23.03` lands the base operator-facing state model before renewal work: `not_connected | connecting | connected | reconnect_required`
- `P23.04` extends that existing state model with renewal behavior and more specific renewal states such as `renewing` and expired/error reconnect-required variants
- `P23.04` renewal stance is demand-driven first (startup, first Plex touch, auth-failure retry path); timer-driven pre-expiry renewal is opportunistic only if it falls out almost for free

## Stack

- Bun + TypeScript daemon/API in `src/`
- SvelteKit 2 + Svelte 5 + TypeScript in `web/`
- Existing config validation and write path in [`src/config.ts`](../../../src/config.ts) and [`src/api.ts`](../../../src/api.ts)
- Existing Plex enrichment client in [`src/plex/client.ts`](../../../src/plex/client.ts)
- Existing onboarding and `/config` surfaces in `web/src/routes/`

## Ticket Order

1. `P23.01 Plex Auth Session Foundation and Stored Identity Contract`
2. `P23.02 Browser Redirect/Return Flow and Config Persistence`
3. `P23.03 Onboarding and Config Plex Connection UX`
4. `P23.04 Best-Effort Silent Renewal and Reconnect-Required States`
5. `P23.05 Docs, Operator Guidance, and Phase Closeout`

## Ticket Files

- `ticket-01-auth-session-foundation.md`
- `ticket-02-browser-flow-and-config-persistence.md`
- `ticket-03-plex-connection-ux.md`
- `ticket-04-silent-renewal-and-state-model.md`
- `ticket-05-docs-exit-and-retrospective.md`

## Exit Condition

A browser user can connect Plex without manual token extraction, Pirate Claw stores enough device identity to renew credentials on a best-effort basis, and the UI makes reconnect-needed states explicit without regressing the rest of the Phase 22 setup flow.

## Phase Closeout

- **Retrospective:** `required`
- **Why:** Phase 23 introduces a durable external auth boundary, a new persisted identity model, and an operator-facing lifecycle contract that later phases, especially Phase 24, depend on.
- **Trigger:** `product-impact`
- **Artifact:** `notes/public/phase-23-retrospective.md`
- **Scope:** retrospective writing is in scope for `P23.05`

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- tests/checks for the current ticket are green
- ticket rationale is updated for behavior/tradeoff changes
- no ticket widens into Plex server discovery or account-management scope

## Ticket Boundary Notes

- `P23.01` must stop at backend auth/session foundation and stored identity. It should not introduce the first successful `plex.token` config write.
- `P23.02` must be reviewable through a real operator path, not only hidden endpoints or harness-only flows. The minimum acceptable slice is: click Connect, complete Plex browser auth, return, persist credential.
- `P23.03` must update onboarding and `/config` together and establish the shared base state model before renewal logic exists.
- `P23.04` should build on the existing UI state model and add demand-driven renewal first. Pre-expiry timer renewal is allowed only if it is a near-free extension after the demand-driven path is already solid.

## Explicit Deferrals

- Plex server discovery or selection UX
- automatic PMS URL inference from the Plex account
- multi-account account switching flows
- guaranteed invisible renewal across every failure mode
- deep auth-debug operator tooling
- Synology restart-backed auth durability work beyond the browser/runtime contract in this phase

## Stop Conditions

Pause for review if:

- Plex's current recommended auth flow requires a broader secret-storage or key-management boundary than this plan assumes
- storing renewal identity cannot be implemented without introducing a second operator-managed settings surface
- the browser flow depends on exposing renewal-sensitive material to client-side JavaScript
- onboarding and `/config` start to diverge in Plex auth behavior or state vocabulary

## Developer approval gate

**Do not begin implementation** until this implementation plan and all Phase 23 ticket docs are merged to `main` and explicitly approved for delivery.
