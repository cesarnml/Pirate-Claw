# `P4.02 Add Runtime Config And Default Cadences`

## Goal

Define and validate runtime scheduling config so daemon mode has explicit defaults and predictable operator control.

## Why This Ticket Exists

Daemon mode needs durable configuration for cadence and runtime output location. Phase 04 decisions are not implementable safely without explicit config surface.

## Scope

- add runtime config fields:
  - `runtime.runIntervalMinutes` (default `30`)
  - `runtime.reconcileIntervalMinutes` (default `1`)
  - `runtime.artifactDir` (default `.pirate-claw/runtime`)
  - `runtime.artifactRetentionDays` (default `7`)
- add `feeds[].pollIntervalMinutes` as optional per-feed run override
- add config validation and defaults behavior tests

## Out Of Scope

- due-feed scheduling execution logic
- overlap locking
- artifact file emission

## Red First Prompt

What configuration-level behavior fails first when daemon scheduling defaults and runtime config validation are missing?
