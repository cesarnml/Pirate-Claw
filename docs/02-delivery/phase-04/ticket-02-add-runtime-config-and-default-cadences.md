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

## Rationale

The `runtime` config section is optional with full defaults so existing configs work unchanged. Each field validates as a positive number when present. The daemon derives its interval options from the validated config rather than using hardcoded constants, making cadence operator-controllable without code changes.

`feeds[].pollIntervalMinutes` is validated here alongside the config surface but not consumed until P4.03 (due-feed scheduling).

## Red First Prompt

What configuration-level behavior fails first when daemon scheduling defaults and runtime config validation are missing?
