# Phase 21 Implementation Plan

Phase 21 establishes the bootstrap contract: a fresh Pirate Claw install creates its own valid starter config, and the browser can immediately show a meaningful setup state without the operator touching any files.

## Epic

- `Phase 21 Bootstrap Contract and Zero Hand-Edited Files`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Product contract

- [`docs/01-product/phase-21-bootstrap-contract.md`](../../01-product/phase-21-bootstrap-contract.md)

## Grill-Me decisions locked for this phase (2026-04-21)

- Starter config is a real validator-passing `AppConfig` — validator changes are allowed only for the minimum bootstrap-safe contract (empty compact `tv.shows`)
- `requireCompactTvShows` updated to accept empty arrays so starter config carries an honest "no shows yet" state without fake placeholder data
- Transmission credentials: `"admin"/"admin"` dummy values (`linuxserver/transmission` ships with auth disabled by default)
- Movie years: dynamic at write time (`currentYear - 1`, `currentYear`)
- `ensureStarterConfig(path)` owned by startup caller; `loadConfig` unchanged
- `_starter: true` sentinel field at top level of config JSON (ignored by `validateConfig` today — unknown keys are silently passed)
- Plex included at `http://localhost:32400` with empty token in starter config
- `GET /api/setup/state` is a new dedicated endpoint (not piggybacked onto `GET /api/config`)
- `starter` = `_starter: true` present in config; any operator write removes sentinel → `partially_configured`
- Corrupt config recovery deferred to P22
- Platform target: Mac (local dev/test) and Synology NAS (production); supervisor/auto-restart for Mac covered in P23 (launchd)

## Stack

- Bun + TypeScript daemon/API in `src/`
- SvelteKit 2 + Svelte 5 + TypeScript in `web/`
- Existing config validation path in [`src/config.ts`](../../../src/config.ts)
- Existing API surface in [`src/api.ts`](../../../src/api.ts)
- Existing startup sequence in daemon and API entry points

## Ticket Order

1. `P21.01 ensureStarterConfig: Write Valid Starter Config on First Boot`
2. `P21.02 GET /api/setup/state Endpoint`
3. `P21.03 Web App Starter Mode UI`
4. `P21.04 README: Plex Version Prereq and First-Boot Operator Contract`
5. `P21.05 Phase 21 Retrospective and Doc Update`

## Ticket Files

- `ticket-01-ensure-starter-config.md`
- `ticket-02-setup-state-endpoint.md`
- `ticket-03-web-starter-mode-ui.md`
- `ticket-04-readme-first-boot-contract.md`
- `ticket-05-retrospective.md`

## Exit Condition

A fresh Pirate Claw install can be started on Mac or Synology without the operator touching any config or env file. The browser loads and shows a clear starter-mode state. The README documents the Plex version prereq and the zero-file-editing first-boot path for both platforms.

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- tests/checks for the current ticket are green
- ticket rationale is updated for behavior/tradeoff changes
- validator changes are limited to the empty compact `tv.shows` contract (no broader schema changes)

## Explicit Deferrals

- Corrupt/malformed config recovery (deferred past P22; not yet addressed)
- Browser-only onboarding flow (**resolved in P22**)
- Synology and Mac supervisor/auto-restart wiring (P23)
- Plex connectivity version check surfaced in the browser (deferred to P22.5; Transmission compatibility status delivered in P22.05)

## Stop Conditions

Pause for review if:

- `ensureStarterConfig` requires validator changes beyond empty compact `tv.shows` (broader schema changes → pause for review)
- setup state logic requires reading live Transmission or Plex connectivity (keep it config-file-only for P21)
- starter config write path introduces any file mutation on an existing config

## Developer approval gate

**Do not begin implementation** until this implementation plan and all Phase 21 ticket docs are merged to `main` and explicitly approved for delivery.

## Delivery status

Complete. P21.01–P21.05 delivered and PRs opened. Stack ready for closeout.
