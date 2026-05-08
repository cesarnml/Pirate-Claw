# `P4.05 Add Runtime JSON/Markdown Artifacts And 7-Day Retention`

## Goal

Emit machine-readable runtime artifacts for scheduled cycles and prune old artifacts to bounded retention.

## Why This Ticket Exists

Phase 04 requires runtime visibility for future dashboard ingestion and human review. Without artifacts, daemon behavior is opaque.

## Scope

- emit JSON and Markdown artifacts for scheduled run/reconcile cycles
- write artifacts under configured runtime path (default `.pirate-claw/runtime`)
- include skipped-cycle artifact entries (for example `already_running`)
- prune artifacts older than 7 days by default
- add tests for artifact writing and retention pruning

## Out Of Scope

- dashboard/UI rendering
- status command redesign (remains DB-driven)

## Rationale

Each daemon cycle (run, reconcile, or skipped) produces a pair of JSON and Markdown artifacts under `{artifactDir}/cycles/`. The JSON format is machine-readable for future dashboard ingestion. The Markdown format gives operators a human-readable log. Skipped cycles include the `already_running` reason so operators can see lock contention.

Retention pruning runs after every artifact write, removing files with `mtime` older than `artifactRetentionDays` (default 7). Using `mtime` avoids filename parsing and stays correct even if artifacts are manually touched or copied. Pruning is best-effort and does not prevent daemon operation if the cycles directory is missing.

The daemon exposes an `onCycleResult` callback that the CLI wires to artifact writing and pruning. This keeps the daemon testable without filesystem dependencies.

## Red First Prompt

What operator-visible behavior fails first when scheduled runtime activity is not persisted as artifacts with bounded retention?
