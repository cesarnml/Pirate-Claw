# Phase 04 Implementation Plan

Phase 04 delivers always-on local runtime value first. It introduces scheduled execution and runtime artifacts while preserving current one-shot CLI behavior.

## Epic

- `Phase 04 Always-On Local Runtime`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase. If scope still feels fuzzy, use `grill-me` before implementation.

## Ticket Order

1. `P4.01 Add Foreground Daemon Command`
2. `P4.02 Add Runtime Config And Default Cadences`
3. `P4.03 Add Due-Feed Scheduling And Poll-State Persistence`
4. `P4.04 Add Shared Runtime Lock And Overlap Skip Semantics`
5. `P4.05 Add Runtime JSON/Markdown Artifacts And 7-Day Retention`

## Ticket Files

- `ticket-01-add-foreground-daemon-command.md`
- `ticket-02-add-runtime-config-and-default-cadences.md`
- `ticket-03-add-due-feed-scheduling-and-poll-state-persistence.md`
- `ticket-04-add-shared-runtime-lock-and-overlap-skip-semantics.md`
- `ticket-05-add-runtime-artifacts-and-retention.md`

## Exit Condition

`pirate-claw daemon --config ./pirate-claw.config.json` can run continuously and provide deterministic scheduled behavior for both queue intake and reconciliation.

The expected Phase 04 behavior is:

- daemon mode runs in foreground and preserves existing one-shot commands
- default cadence is run every 30 minutes and reconcile every 1 minute
- per-feed run intervals are supported via `feeds[].pollIntervalMinutes`
- run cycles process only feeds that are due
- run/reconcile never overlap; due cycles while busy are skipped with reason `already_running`
- runtime artifacts are emitted as JSON and Markdown under `.pirate-claw/runtime`
- runtime artifacts older than 7 days are pruned
- `status` remains DB-driven in this phase

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- the previous tests are green
- the behavior change is explained in the ticket and rationale
- the phase-level defaults and deferrals remain unchanged

## Explicit Deferrals

These are intentionally out of scope for Phase 04:

- movie codec strict-mode policy (`movies.codecPolicy`)
- Transmission label/category routing
- Synology deployment packaging
- dashboard/UI consumption of runtime artifacts
- hosted persistence and remote feed capture

## Stop Conditions

Pause for review if:

- due-feed scheduling requires a broader pipeline redesign beyond bounded slice changes
- runtime locking cannot be implemented without introducing unsafe deadlock risk
- artifact requirements force a product-level status UX redesign in this phase
