# Phase 26 Implementation Plan

**Status:** Proposed for developer approval; no implementation started.

Phase 26 makes macOS a first-class always-on deployment target for Pirate Claw through one supported `launchd` contract, one truthful restart story, and one dedicated Mac operator runbook that does not dilute the existing Synology reference path.

## Epic

- `Phase 26 Mac First-Class Always-On Deployment`

Follow the shared guidance in [`docs/product/delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Product contract

- [`docs/product/plans/phase-26-mac-first-class-always-on-deployment.md`](../../01-product/phase-26-mac-first-class-always-on-deployment.md)

## Grill-Me decisions locked for this phase (2026-04-23)

- Phase 26 supports one first-class macOS always-on supervisor contract: per-user `launchd` under a dedicated always-logged-in operator account.
- The phase ships repo-owned Mac deployment artifacts rather than docs-only guidance.
- Pirate Claw state on Mac stays inside an operator-chosen install directory; `launchd` points at that directory rather than introducing a second app-state model under ad hoc macOS folders.
- Browser restart truth on Mac means supervisor handoff plus return with persisted config, SQLite state, and existing auth state intact; it does not promise full host lifecycle management.
- Real support requires one end-to-end validation on a real Mac host running the supported `launchd` contract.
- Apple Silicon is the only validated reference target for this phase.
- The validation environment for the initial support claim is a 2021 14-inch MacBook Pro with Apple M1 Pro, 16 GB RAM, and macOS Tahoe 26.4.1.
- Mac operator procedures should live in a dedicated Mac runbook rather than being merged into the Synology runbook.
- App Store packaging, native GUI packaging, Intel validation, and broad cross-platform supervisor abstraction remain deferred.

## Locked implementation contract

### Supported supervisor boundary

- The supported macOS always-on path for Phase 26 is a per-user `launchd` agent, not a system-wide daemon under `/Library/LaunchDaemons`.
- The committed artifact must define install, update, remove, invocation, and working-directory expectations clearly enough that the supported path is reviewable without folklore.
- Homebrew services, tmux/screen, login items, Docker-on-Mac, and manual shell babysitting may remain possible developer shortcuts but are not first-class support claims for this phase.

### Durable install boundary

- Pirate Claw continues to own `pirate-claw.config.json`, `pirate-claw.db`, and `.pirate-claw/runtime/` inside an operator-chosen install directory on Mac.
- The `launchd` artifact may live in the standard macOS agent location, but it should point back to the same Pirate Claw durable state boundary rather than relocating app state into a separate Mac-specific persistence model.
- If Phase 26 needs additional Mac metadata, it must stay narrow, documented, and subordinate to the existing durability boundary.

### Validation contract

- Phase 26 requires a recorded real-machine validation of install, start under `launchd`, browser-triggered restart handoff, daemon return, and persistence of config, SQLite, and existing auth state across the restart.
- Validation evidence belongs to the runtime-truthfulness ticket so the contract is proven while the implementation context is still active.
- The initial support statement is bounded to Apple Silicon based on the validated environment above.

### Documentation contract

- Phase 26 should add a dedicated Mac operator runbook rather than widening `docs/synology-runbook.md` into a mixed-platform operations document.
- Shared product-boundary claims should still be aligned in overview docs and `README.md`, but step-by-step operator procedures should remain platform-specific.

## Stack

- Bun + TypeScript daemon/API in `src/`
- SvelteKit 2 + Svelte 5 + TypeScript in `web/`
- existing restart-backed lifecycle surfaces in [`src/api.ts`](../../../src/api.ts) and the `/config` browser flow delivered through Phase 25
- existing durable state boundary: writable config directory, `pirate-claw.db`, and runtime artifacts under `.pirate-claw/runtime`
- existing deployment/operator docs in [`README.md`](../../../README.md), [`docs/overview/start-here.md`](../../00-overview/start-here.md), [`docs/overview/roadmap.md`](../../00-overview/roadmap.md), and [`docs/synology-runbook.md`](../../synology-runbook.md)

## Ticket Order

1. `P26.01 Mac Reference Launchd Artifact and Contract`
2. `P26.02 Mac Restart Truthfulness and Real-Machine Validation`
3. `P26.03 Mac Operator Truthfulness and Runbook Slice`
4. `P26.04 Docs Exit and Phase Closeout`

## Ticket Files

- `ticket-01-mac-reference-launchd-artifact-and-contract.md`
- `ticket-02-mac-restart-truthfulness-and-real-machine-validation.md`
- `ticket-03-mac-operator-truthfulness-and-runbook-slice.md`
- `ticket-04-docs-exit-and-phase-closeout.md`

## Exit Condition

Pirate Claw has one documented, validated, and supportable always-on macOS deployment story built around a per-user `launchd` contract, a truthful browser restart handoff/return story under that contract, and a dedicated Mac runbook that makes the supported operator path explicit without weakening the existing Synology reference boundary.

## Phase Closeout

- **Retrospective:** `required`
- **Why:** Phase 26 establishes a durable new operator/deployment boundary and changes the supported workflow for always-on installs beyond the Synology reference path.
- **Trigger:** `product-impact`
- **Artifact:** `notes/public/phase-26-mac-first-class-always-on-deployment-retrospective.md`
- **Scope:** retrospective writing is in scope for `P26.04`

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- tests/checks for the current ticket are green
- ticket rationale is updated for behavior/tradeoff changes
- the current ticket stays inside the approved Phase 26 boundary and does not widen into Intel support, native app packaging, or generic supervisor abstraction

## Ticket Boundary Notes

- `P26.01` is the deployment anchor only: the repo-owned `launchd` artifact, supported account/session model, durable-path contract, and install/update/remove expectations. It should not widen into runtime hardening, browser copy changes, or final operator docs consolidation.
- `P26.02` is the runtime-truthfulness slice. It may change daemon/API/browser restart behavior as needed to make the Mac `launchd` contract truthful and validated on a real machine, but it must stop short of broader operator-runbook cleanup and overview closeout.
- `P26.03` is the operator-visible truthfulness slice. It should create the dedicated Mac runbook and add the minimum product-surface messaging needed so Mac support is neither overstated nor hidden once the contract is real. It should not reopen Synology operations guidance beyond keeping cross-doc claims consistent.
- `P26.04` closes the phase, updates overview/status docs, and writes the retrospective. It does not introduce new runtime behavior.

## Explicit Deferrals

- native GUI packaging, menu bar app work, or App Store distribution
- Intel Mac validation or support claims beyond clearly marked best-effort behavior
- generic supervisor abstraction across arbitrary Linux or desktop targets
- one-click installer marketplaces or package-feed distribution
- broad UX/UI polish beyond the bounded Mac deployment truthfulness needed for this phase
- host-level boot/login automation guarantees beyond the chosen per-user `launchd` contract

## Stop Conditions

Pause for review if:

- the Mac support claim cannot be expressed as one concrete repo-owned `launchd` artifact plus one explicit durable-path contract
- truthful Mac restart support appears to require a second persistence model or platform-specific shadow state outside the existing Pirate Claw boundary
- the real-machine validation exposes a requirement for system-wide daemons, privileged install flows, or Intel compatibility to make the phase credible
- keeping Synology and Mac runbooks separate appears to cause unavoidable contradiction in the shared product contract rather than the expected platform-specific operational differences

## Developer approval gate

**Do not begin implementation** until this implementation plan and all Phase 26 ticket docs are merged to `main` and explicitly approved for delivery.
