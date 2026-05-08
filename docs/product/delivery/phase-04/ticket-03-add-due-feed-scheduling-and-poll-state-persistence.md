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

## Rationale

Due-feed filtering happens before `runPipeline` by constructing a reduced `config.feeds` array. This keeps the core pipeline unchanged; only the daemon run cycle selects which feeds to include.

Poll state persists as a JSON file under `runtime.artifactDir`. On first run, all feeds are due because they have no recorded `lastPolledAt`. After each successful cycle, the daemon records the poll timestamp per feed. On restart, the daemon reloads this file and resumes where it left off.

Per-feed `pollIntervalMinutes` overrides the global `runIntervalMinutes` for that feed's due check. If absent, the global default applies.

## Red First Prompt

What user-visible scheduling behavior fails first when due-feed selection and feed polling state persistence are absent?
