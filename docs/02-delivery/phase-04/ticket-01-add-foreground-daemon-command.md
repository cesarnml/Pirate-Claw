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

## Red First Prompt

What user-visible behavior fails first when `pirate-claw daemon` is invoked but no long-running execution loop exists?
