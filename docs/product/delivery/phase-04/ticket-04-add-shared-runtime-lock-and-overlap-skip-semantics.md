# `P4.04 Add Shared Runtime Lock And Overlap Skip Semantics`

## Goal

Guarantee deterministic daemon behavior by preventing overlapping run/reconcile execution and recording explicit skip semantics.

## Why This Ticket Exists

Without a shared lock, run and reconcile cycles can overlap and create race-prone state transitions. Phase 04 explicitly requires skip-on-busy with reason `already_running`.

## Scope

- enforce one shared runtime lock across run and reconcile tasks
- if a cycle is due while another task is running, skip and record `already_running`
- add tests for overlap prevention and skip reason behavior

## Out Of Scope

- artifact formatting and retention logic
- policy changes for codec or Transmission labels

## Rationale

A single boolean `busy` flag inside `runDaemonLoop` acts as a shared runtime lock. Before any cycle (run or reconcile) executes, the `guardedCycle` wrapper checks `busy`. If set, the cycle is skipped and `{type} cycle skipped: already_running` is logged. The flag is released in a `finally` block so it clears even when the cycle throws.

This keeps the lock in-process and zero-dependency. File-based or IPC locks were considered but add complexity for a single-process daemon with no multi-instance requirement. The shared lock means a long-running run cycle blocks reconcile and vice versa, which is the intended behavior: preventing concurrent database and poll-state mutations.

## Red First Prompt

What deterministic runtime behavior fails first when due cycles are allowed to overlap instead of being skipped with `already_running`?
