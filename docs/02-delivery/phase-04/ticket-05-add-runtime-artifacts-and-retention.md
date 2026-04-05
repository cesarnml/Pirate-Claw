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

## Red First Prompt

What operator-visible behavior fails first when scheduled runtime activity is not persisted as artifacts with bounded retention?
