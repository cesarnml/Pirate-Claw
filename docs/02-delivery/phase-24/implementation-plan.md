# Phase 24 Implementation Plan

**Status:** Delivered in the active Phase 24 stack (`P24.01`–`P24.05`).

Phase 24 closes the Synology deployment loop by making Pirate Claw's restart behavior and durability boundary truthful under the repo-owned reference supervision path, while explicitly deferring browser return-proof UX to Phase 25.

## Epic

- `Phase 24 Synology Supervision and Restart Completion`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Product contract

- [`docs/01-product/phase-24-synology-supervision-and-restart.md`](../../01-product/phase-24-synology-supervision-and-restart.md)

## Grill-Me decisions locked for this phase (2026-04-23)

- Phase 24 owns a repo-owned Synology reference supervision artifact rather than prose-only guidance
- the Synology reference artifact lands before runtime durability proof so later tickets have a stable baseline to validate against
- restart durability proof stops at daemon/runtime semantics plus automated persistence tests; browser-visible restart round-trip proof remains Phase 25 scope
- Phase 24 may harden shutdown/restart behavior as needed to make `SIGTERM` trustworthy under the Synology supervision contract
- the writable config directory and `pirate-claw.db` remain one durability boundary and must survive restart together
- Phase 23's persisted Plex auth/device state is in scope for restart durability validation because Phase 24 is a follow-on to that shipped contract
- Plex/Synology compatibility truthfulness should not be deferred entirely to the final docs ticket; Phase 24 includes a thin operator-visible slice where current setup/config claims would otherwise overstate support
- Mac always-on deployment, generic supervisor abstraction, browser restart state machine work, and packaging remain deferred

## Stack

- Bun + TypeScript daemon/API in `src/`
- SvelteKit 2 + Svelte 5 + TypeScript in `web/`
- existing runtime/config persistence in [`src/config.ts`](../../../src/config.ts), [`src/api.ts`](../../../src/api.ts), and SQLite state under `pirate-claw.db`
- existing Synology operator guidance in [`README.md`](../../../README.md) and phase/product docs under `docs/`

## Ticket Order

1. `P24.01 Synology Reference Supervision Artifact and Contract`
2. `P24.02 Restart Durability Semantics and Persistence Proof`
3. `P24.03 Plex/Synology Compatibility Truthfulness Slice`
4. `P24.04 Restart Copy and Product/Runbook Alignment`
5. `P24.05 Docs Exit and Phase Closeout`

## Ticket Files

- `ticket-01-synology-reference-supervision-artifact.md`
- `ticket-02-restart-durability-semantics-and-persistence-proof.md`
- `ticket-03-plex-synology-compatibility-truthfulness.md`
- `ticket-04-restart-copy-and-runbook-alignment.md`
- `ticket-05-docs-exit-and-phase-closeout.md`

## Exit Condition

Under the documented Synology reference deployment, Pirate Claw can accept restart-backed configuration changes, exit predictably under supervision, preserve the writable config directory plus `pirate-claw.db` as one durable state boundary, and describe the restart/Plex compatibility story truthfully without yet claiming browser-visible restart return proof.

## Phase Closeout

- **Retrospective:** `required`
- **Why:** Phase 24 hardens a durable deployment boundary and sets operator/runtime assumptions that Phase 25 and Phase 26 build on.
- **Trigger:** `product-impact`
- **Artifact:** `notes/public/phase-24-retrospective.md`
- **Scope:** retrospective writing is in scope for `P24.05`

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- tests/checks for the current ticket are green
- ticket rationale is updated for behavior/tradeoff changes
- the current ticket stays inside the approved Phase 24 boundary and does not pull in Phase 25 browser return-proof work or Phase 26 Mac deployment work

## Ticket Boundary Notes

- `P24.01` must produce the concrete Synology reference artifact and contract only. It should not harden runtime shutdown semantics or add operator-visible Plex support messaging beyond what is required to explain the reference topology.
- `P24.02` is the main runtime slice. It may change shutdown behavior as needed for trustworthy restart durability, but it must stop short of browser polling, restart-state UX, or generic supervisor abstraction.
- `P24.03` should land the thinnest operator-visible truth signal needed to keep the Plex-on-Synology story honest. It should not widen into broad diagnostics or UI polish.
- `P24.04` should only tighten restart-related copy/affordances enough to match delivered behavior. If the ticket starts proving daemon return in-browser, it has crossed into Phase 25.
- `P24.05` closes the phase, updates overview/operator docs, and writes the retrospective. It does not introduce new runtime behavior.

## Explicit Deferrals

- browser-visible restart round-trip proof and restart state machine
- Mac `launchd` or other non-Synology always-on deployment contracts
- generic supervisor abstraction across arbitrary Linux/NAS targets
- one-click installation packaging or package-feed distribution
- deep daemon hot-reload redesign to avoid restart semantics entirely
- richer Plex diagnostics, server discovery, or account-management expansion
- automatic upgrade lifecycle management for third-party Synology packages such as Plex Media Server

## Stop Conditions

Pause for review if:

- the Synology reference deployment cannot be expressed as one concrete repo-owned supervision artifact plus explicit writable-path assumptions
- restart durability cannot be made trustworthy without widening into the browser proof work already deferred to Phase 25
- Phase 23 Plex auth/device state cannot survive the approved restart contract without a broader persistence-boundary redesign
- truthful Synology/Plex compatibility messaging appears to require invasive setup redesign rather than a thin operator-visible slice

## Developer approval gate

**Do not begin implementation** until this implementation plan and all Phase 24 ticket docs are merged to `main` and explicitly approved for delivery.
