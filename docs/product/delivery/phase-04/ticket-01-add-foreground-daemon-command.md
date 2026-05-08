# `P4.01 Add Foreground Daemon Command`

## Goal

Add a new long-running `pirate-claw daemon` command that continuously executes scheduled work while preserving existing one-shot commands.

## Why This Ticket Exists

Phase 04 requires an always-on execution path. Without a daemon entrypoint, all scheduling and runtime orchestration remains scattered and manual.

## Scope

- add CLI command handling for `pirate-claw daemon`
- keep process in the foreground (no background service manager in this ticket)
- ensure existing commands (`run`, `status`, `retry-failed`, `reconcile`) remain unchanged
- add tests proving daemon command routing and baseline lifecycle behavior

## Out Of Scope

- runtime config schema changes for cadence
- per-feed due scheduling
- lock/overlap semantics
- runtime artifacts

## Rationale

The daemon uses an injectable `runDaemonLoop` that takes cycle callbacks and an `AbortSignal`. This keeps the scheduling loop testable without subprocess overhead or real timers. Initial cycles execute synchronously before interval timers start so the operator gets immediate feedback on startup. Per-cycle errors are caught and logged without crashing the daemon.

Hardcoded defaults (30 min run, 1 min reconcile) are used in this ticket. Config-driven cadence lands in P4.02. Cross-cycle overlap prevention is explicitly deferred to P4.04.

In-flight cycles are tracked and awaited on shutdown so the CLI can safely close the database after the daemon loop returns.

## Red First Prompt

What user-visible behavior fails first when `pirate-claw daemon` is invoked but no long-running execution loop exists?
