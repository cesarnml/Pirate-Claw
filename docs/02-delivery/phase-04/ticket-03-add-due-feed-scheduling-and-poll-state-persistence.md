# `P4.03 Add Due-Feed Scheduling And Poll-State Persistence`

## Goal

Implement due-feed run scheduling so each cycle processes only feeds that are due, with persisted poll state across restarts.

## Why This Ticket Exists

Per-feed cadence is core to Phase 04 value and efficiency. Without due-feed selection and persisted state, daemon behavior is either wasteful or inconsistent.

## Scope

- execute run cycles only for due feeds
- use `feeds[].pollIntervalMinutes` override when present
- persist last-polled feed state so daemon restarts do not reset scheduling behavior
- add tests for due vs not-due feed execution and restart continuity

## Out Of Scope

- run/reconcile overlap lock behavior
- runtime artifact generation

## Red First Prompt

What user-visible scheduling behavior fails first when due-feed selection and feed polling state persistence are absent?
