# Phase 22 Implementation Plan

Phase 22 turns the Phase 21 bootstrap contract into a complete browser-only setup flow. The operator can move from a valid starter state to an ingestion-ready configuration entirely through the web UI — no SSH, no file editing.

## Epic

- `Phase 22 Browser-Only Setup and Installer Flow`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Product contract

- [`docs/01-product/phase-22-browser-only-setup.md`](../../01-product/phase-22-browser-only-setup.md)

## Grill-Me decisions locked for this phase (2026-04-21)

- `movies` is omitted from the starter config and made optional (`movies?: MoviePolicy`) in `AppConfig`; absence means movies matching is disabled
- `tmdb` was already optional and absent from starter config — no change
- Starter config omits phantom `movies` defaults; all unconfigured target types signal "not yet set" via empty arrays or absent objects
- `getSetupState` ready condition: feeds non-empty + each feed's `mediaType` has a corresponding configured target (tv feed → `tv.shows` non-empty; movie feed → `movies` present) + transmission URL is a valid non-empty string
- `transmissionCustom` URL-comparison heuristic removed — URL ≠ default was a wrong proxy for "operator touched this"; a bundled deployment at the default URL is fully valid
- Transmission reachability is a **runtime probe** (P22.04), not a config-file check
- Two-layer readiness model: config completeness (`getSetupState`) vs. runtime readiness (`not_ready | ready_pending_restart | ready`)
- Transmission compatibility status display: `compatible | compatible_custom | recommended | not_reachable` (reachability probe only, no provisioning)
- Bundled Transmission + VPN container provisioning is **out of scope** (post-v1)
- Plex browser-based JWT auth is **out of scope** (P22.5); manual token field stays, labeled legacy
- Plex PMS version advisory (>= 1.43.0 for API 1.2.0) is surfaced as an advisory, not a blocking readiness condition

## Stack

- Bun + TypeScript daemon/API in `src/`
- SvelteKit 2 + Svelte 5 + TypeScript in `web/`
- Existing config validation path in [`src/config.ts`](../../../src/config.ts)
- Existing bootstrap in [`src/bootstrap.ts`](../../../src/bootstrap.ts)
- Existing API surface in [`src/api.ts`](../../../src/api.ts)

## Ticket Order

1. `P22.01 Starter Config Cleanup and movies Optional Schema`
2. `P22.02 getSetupState Readiness Condition Fix`
3. `P22.03 Dependency-Ordered Setup Wizard`
4. `P22.04 Runtime Readiness Model and Daemon Liveness`
5. `P22.05 Transmission Compatibility Status Display`
6. `P22.06 Phase 22 Retrospective and Doc Update`

## Ticket Files

- `ticket-01-starter-config-cleanup-and-movies-optional.md`
- `ticket-02-setup-state-readiness-condition-fix.md`
- `ticket-03-dependency-ordered-setup-wizard.md`
- `ticket-04-runtime-readiness-model.md`
- `ticket-05-transmission-compatibility-status.md`
- `ticket-06-retrospective.md`

## Exit Condition

A fresh Pirate Claw install can be opened in the browser, configured end-to-end through the setup wizard, and left in an ingestion-ready state. The operator never touches SSH, `vim`, or config files. The browser reflects true readiness — not wizard-step completion.

## Phase Closeout

- Retrospective: `required`
- Artifact: `notes/public/phase-22-retrospective.md`
- Trigger: `product-impact` — this is the phase that earns the browser-only setup claim; learning from delivery shapes P22.5 and post-v1 bundling scope
- Final ticket P22.06 must include retrospective writing in scope

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- tests/checks for the current ticket are green
- ticket rationale is updated for behavior/tradeoff changes
- schema changes in P22.01 do not break existing tests

## Explicit Deferrals

- Plex browser-based JWT authentication (P22.5)
- Bundled Transmission + VPN container provisioning (post-v1)
- Advanced feed/rule bulk management
- Search-to-add flows powered by TMDB or Plex
- Non-essential Movies/Shows dashboard polish
- Multi-user or delegated-operator setup flows
- One-click installer packaging

## Stop Conditions

Pause for review if:

- `movies` schema change requires changes beyond `src/config.ts`, `src/bootstrap.ts`, and `src/pipeline.ts`
- setup wizard write path diverges from the existing config write path used by `/config`
- readiness probe introduces network calls inside `getSetupState` (keep it file-only)
- any ticket requires touching the Transmission container or compose files

## Developer approval gate

**Do not begin implementation** until this implementation plan and all Phase 22 ticket docs are merged to `main` and explicitly approved for delivery.

## Delivery status

Complete. P22.01–P22.06 delivered and PRs opened (#200–#204). See [phase-22-retrospective.md](../../../notes/public/phase-22-retrospective.md).
