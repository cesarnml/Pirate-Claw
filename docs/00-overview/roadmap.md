# Roadmap

This roadmap is intentionally lightweight. It gives future phases a place to land without mixing roadmap planning into ticket specs.

## Phase 01 MVP

Goal:

- read feeds
- normalize titles
- match against config rules
- deduplicate with SQLite
- queue approved items in Transmission
- record outcomes for status and retry

Exit condition:

- `pirate-claw run` can successfully queue a matched item in Transmission

## Phase 02: Real-World Feed Compatibility

Goal:

- make the branded CLI work end-to-end against real target feeds
- use RSS `enclosure.url` as the queueable torrent payload when present
- keep movie items eligible when year and resolution match but codec is absent
- preserve the current manual local workflow

Committed scope:

- real-world compatibility fixes for `https://myrss.org/eztv`
- real-world compatibility fixes for `https://atlas.rssly.org/feed`
- rename the operator surface to `pirate-claw` and `pirate-claw.config.json`
- documentation and manual verification guidance for a valid local config

Explicitly deferred:

- scheduling or polling
- remote feed capture
- Turso or other hosted persistence
- persistence redesign beyond local SQLite

Working notes:

- `docs/01-product/phase-02-real-world-feed-compatibility.md`
- `docs/01-product/phase-03-post-queue-lifecycle.md`

## Phase 03: Post-Queue Lifecycle

Goal:

- add post-queue lifecycle tracking for torrents queued by Pirate Claw
- reconcile lifecycle state from Transmission through a dedicated command path
- expose reconciled lifecycle state in local status output

Current status:

- implemented via `pirate-claw reconcile` and lifecycle-aware `pirate-claw status`
- completion and `missing_from_transmission` semantics are persisted locally
- no always-on reconciliation loop has been introduced

Explicitly deferred:

- always-on scheduling or polling
- file renaming or final media placement rules
- Plex, Jellyfin, or Synology-specific integrations
- media-server or library/archive integrations
- UI work or third-party media metadata integrations

Future pressure and ideation:

- a later NAS-oriented phase may run Pirate Claw continuously on Synology and poll feeds every 15-30 minutes to avoid short RSS retention windows
- future product work may persist downloader state in SQLite as the app-facing source for a UI layer while still treating Transmission as the live downloader authority
- final media placement may be owned either by Transmission or by Pirate Claw once completion tracking is reliable enough to make that boundary explicit
- if Transmission labels can drive downloader-side placement rules reliably, Pirate Claw may eventually assign labels such as movie or tv at queue time instead of owning final move logic itself

## Phase 04: Always-On Local Runtime

Goal:

- add a foreground daemon mode for continuous local operation
- schedule queue-intake and reconcile cycles with clear defaults
- make runtime activity machine-readable through JSON/Markdown artifacts

Current status:

- implemented via `pirate-claw daemon` with configurable cadences, per-feed due scheduling, shared runtime lock, and bounded-retention artifacts

Committed scope:

- `pirate-claw daemon` as a long-running local command
- default cadence: run every 30 minutes, reconcile every 1 minute
- per-feed poll interval overrides with due-feed-only run behavior
- one shared runtime lock and overlap-skip reason `already_running`
- runtime artifacts under `.pirate-claw/runtime` with 7-day retention

Explicitly deferred:

- movie codec strictness policy mode
- Transmission label/category routing
- NAS packaging and deployment automation
- dashboard/UI artifact rendering

Working notes:

- `docs/01-product/phase-04-always-on-local-runtime.md`
- `docs/02-delivery/phase-04/implementation-plan.md`

## Phase 05: Intake Policy And Transmission Routing

Goal:

- allow movie codec behavior to be configured as preference or hard requirement
- add media-type routing labels on Transmission submissions
- preserve queueing with warning+fallback when labels are unsupported

Current status:

- P5.01 movie codec policy mode and P5.02 label-routing fallback are implemented in delivery work

Committed scope:

- `movies.codecPolicy: "prefer" | "require"`
- queue-time `movie` / `tv` labels for Transmission
- warn-and-retry-unlabeled fallback when label arguments are rejected

Explicitly deferred:

- generalized per-feed custom routing labels
- hard-fail strict mode for unsupported labels
- media placement ownership redesign

Working notes:

- `docs/01-product/phase-05-intake-policy-and-routing.md`

## Phase 06: Synology Runbook

Goal:

- provide a validated runbook for always-on Pirate Claw + Transmission operation on Synology

Committed scope:

- tested setup and operations documentation only

Explicitly deferred:

- repo-managed Docker Compose deployment bundle
- backup/restore and one-click installation automation

Working notes:

- `docs/01-product/phase-06-synology-runbook.md`

## Planning Rules

- keep phase docs outcome-focused
- keep tickets implementation-focused
- promote durable technical choices into ADRs

Last verified against `README.md` and active delivery plans: 2026-04-05.
