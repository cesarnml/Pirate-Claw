# Phase 04 Always-On Local Runtime

Phase 04 changes Pirate Claw from a manual one-shot CLI into a useful always-on local tool without widening into NAS deployment, UI, or downloader-placement policy redesign.

## Phase Goal

Phase 04 should leave Pirate Claw in a state where a local operator can run one long-lived process that:

- executes queue-intake runs on a schedule
- executes Transmission reconciliation on a separate schedule
- keeps behavior deterministic when cycles overlap
- writes machine-readable runtime artifacts for later dashboard ingestion

## Product Goals For This Phase

- keep the operating model local-first and simple on macOS
- preserve existing one-shot commands while adding a long-running command
- add scheduling without introducing remote services
- make runtime behavior observable through structured artifacts

## Committed Scope

- add a foreground long-running command: `pirate-claw daemon`
- add default scheduling cadence:
  - run cycle every `30` minutes
  - reconcile cycle every `1` minute
- support per-feed polling intervals for run cycles
- run only feeds that are due during a given run cycle
- enforce one shared runtime lock for run/reconcile to avoid overlap
- when a cycle is due while work is already in progress, skip it and record reason `already_running`
- emit runtime artifacts on each scheduled cycle as both JSON and Markdown
- write artifacts under `.pirate-claw/runtime` by default
- prune runtime artifacts older than `7` days
- keep `pirate-claw status` DB-driven in this phase

## Configuration Surface Added In This Phase

The config shape should gain a runtime block and per-feed polling override:

- `runtime.runIntervalMinutes` (default `30`)
- `runtime.reconcileIntervalMinutes` (default `1`)
- `runtime.artifactDir` (default `.pirate-claw/runtime`)
- `runtime.artifactRetentionDays` (default `7`)
- `feeds[].pollIntervalMinutes` (optional; feed-specific run interval override)

## Exit Condition

A local operator can run `pirate-claw daemon --config ./pirate-claw.config.json` and observe:

- scheduled run and reconcile cycles execute continuously
- due-feed scheduling works with per-feed overrides
- overlapping cycles are skipped deterministically with `already_running`
- JSON and Markdown artifacts are generated and retained for 7 days

## Explicit Deferrals

These are intentionally outside Phase 04:

- movie codec strictness policy
- Transmission label/category routing
- downloader-side file placement ownership decisions
- Synology/NAS deployment packaging
- dashboard/UI rendering of artifacts
- hosted persistence or remote capture

## Why The Scope Stays Narrow

The highest-value gap today is always-on execution. Phase 04 addresses that directly while preserving the existing product boundary and avoiding policy or infrastructure expansion that belongs in later phases.
