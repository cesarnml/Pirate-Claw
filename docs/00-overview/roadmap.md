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

- implemented on `main` via P5.01 movie codec policy mode and P5.02 label-routing fallback

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
- `docs/02-delivery/phase-05/implementation-plan.md`

## Phase 06: Synology Runbook

Goal:

- provide a validated runbook for always-on Pirate Claw + Transmission operation on Synology

Current status:

- Phase 06 is complete. All tickets (`P6.01`–`P6.10`) are on `main`.
- The canonical Synology runbook (`docs/02-delivery/phase-06/synology-runbook.md`) covers: storage layout, Transmission baseline, Pirate Claw container baseline, secrets/env injection, restart semantics, upgrade path, end-to-end validation, troubleshooting, and portability notes.
- Validated on `DS918+ / DSM 7.1.1-42962 Update 9` with Docker 20.10.3 on kernel 4.4.x.
- Key finding: Bun's `statx` syscall crashes silently on kernel 4.4.x when auto-loading `.env`. Workaround: mount config and `.env` under `/config/` instead of `/app/`.

Committed scope:

- tested setup and operations documentation only

Explicitly deferred:

- repo-managed Docker Compose deployment bundle
- backup/restore and one-click installation automation

Working notes:

- `docs/01-product/phase-06-synology-runbook.md`
- `docs/02-delivery/phase-06/implementation-plan.md`
- `docs/02-delivery/phase-06/synology-runbook.md`

## Phase 07: Config Ergonomics

Goal:

- reduce repetition in common TV tracking config
- make the fully-expanded effective config visible to the operator
- keep Transmission credentials out of the main JSON file when desired
- improve config validation clarity for compact config forms

Current status:

- implemented on `main` via `P7.01`-`P7.05`
- compact TV config, per-show overrides, `pirate-claw config show`, env-backed Transmission secrets, and clearer compact-config validation are part of the shipped CLI surface

Committed scope:

- compact TV config via `tv.defaults + tv.shows`
- mixed `tv.shows` entries with per-show overrides
- a config-normalization visibility command
- env-backed Transmission username/password loading
- clearer config validation errors with path-aware guidance

Explicitly deferred:

- config mini-DSLs or named profile systems
- broad ingestion redesign
- non-Transmission secret providers
- orchestrator/configurability/module-decomposition work

Working notes:

- `docs/01-product/phase-07-config-ergonomics.md`
- `docs/02-delivery/phase-07/implementation-plan.md`

## Engineering Epic 03: Delivery Tooling Modularity

Goal:

- keep orchestrator and delivery tooling maintainable as configuration and workflow surface expand

Current status:

- implemented on `main`
- the delivery orchestrator now uses extracted concern-oriented modules under `tools/delivery/` including `planning.ts`, `state.ts`, `review.ts`, `pr-metadata.ts`, `platform.ts`, `ticket-flow.ts`, and `notifications.ts`
- this remains a separate engineering epic, not a product phase
- any further delivery-tooling work should start from the current extracted module boundaries rather than reopening the original monolith-vs-modules decision

## Engineering Epic 04: Reviewer-Facing PR Body And Thread Hygiene

Goal:

- improve reviewer-facing clarity for patched external AI-review outcomes in orchestrated delivery tooling

Current status:

- implemented on `main`
- covers ticket stack `EE4.01`-`EE4.04` under `docs/02-delivery/engineering-epic-04/`
- adds per-finding patched disposition rendering, stale-review resolution phrasing, thread reply-before-resolve behavior, and PR metadata polish
- this remains a separate engineering epic, not a product phase

## Phase 08: Media Placement

Goal:

- route completed Transmission downloads into media-type-specific directories via per-type `downloadDir` at queue time

Current status:

- implemented on `main`

Committed scope:

- per-media-type download directory config (`transmission.downloadDirs.movie`, `transmission.downloadDirs.tv`)
- resolve effective `downloadDir` at queue time based on candidate media type
- preserve existing label-routing and fallback behavior

Explicitly deferred:

- Pirate-Claw-side post-completion file moves or renaming
- per-feed custom download directories beyond the two media types

Working notes:

- `docs/01-product/phase-08-media-placement.md`

## Phase 09: Daemon HTTP API

Goal:

- expose a read-only JSON API from the daemon process so external consumers can query run history, candidate states, per-show breakdowns, and effective config

Current status:

- implemented on `main`

Committed scope:

- lightweight HTTP listener in the daemon on a configurable port (`runtime.apiPort`)
- read-only endpoints: `/api/health`, `/api/status`, `/api/candidates`, `/api/shows`, `/api/movies`, `/api/feeds`, `/api/config`
- no authentication in v1 (private NAS network)
- TV candidates with missing season/episode are skipped rather than synthesized
- feed `isDue` logic reuses the shared `isDueFeed` helper for consistency with the scheduler
- Transmission credentials redacted in `/api/config`

Explicitly deferred:

- write endpoints (config editing, manual queue/retry)
- authentication or TLS
- WebSocket or push-based updates

Working notes:

- `docs/01-product/phase-09-daemon-http-api.md`
- `docs/02-delivery/phase-09/implementation-plan.md`

## Phase 10: Read-Only SvelteKit Dashboard

Goal:

- provide a browser-based read-only dashboard that consumes the daemon HTTP API

Current status:

- implemented on `main`

Committed scope:

- SvelteKit (Svelte 5) app in `web/` consuming the daemon API
- views: dashboard home, candidates list, per-show season/episode detail, config view
- Dockerfile for NAS deployment alongside the daemon container
- functional styling only

Explicitly deferred:

- config editing through the UI
- visually rich styling or theming
- Docker Compose orchestration

TMDB metadata, posters, and ratings are covered by Phase 11, not Phase 10.

Working notes:

- `docs/01-product/phase-10-read-only-dashboard.md`

## Phase 11: TMDB Metadata Enrichment

Goal:

- enrich the daemon API and dashboard with TMDB metadata: ratings, posters, overviews, and season/episode detail

Current status:

- implemented on `main` per approved tickets `P11.01`–`P11.06` in [`docs/02-delivery/phase-11/implementation-plan.md`](../02-delivery/phase-11/implementation-plan.md) (delivered via the stacked PR workflow and `closeout-stack` merge)

Committed scope:

- TMDB API client in the daemon with configurable API key
- candidate-to-TMDB matching for movies and TV
- SQLite-cached metadata with configurable TTL
- enriched API responses and dashboard views with posters and ratings
- background TMDB refresh on a daemon timer (`runtime.tmdbRefreshIntervalMinutes`, independent of RSS polling)
- display-only — ratings do not gate the intake pipeline

Explicitly deferred:

- rating-based intake gating (`minRating` pipeline filter)
- TMDB-powered search-to-add from the UI
- release calendar or upcoming schedule views
- poster/image local caching or CDN proxying

Working notes:

- `docs/01-product/phase-11-tmdb-metadata-enrichment.md`
- `docs/02-delivery/phase-11/implementation-plan.md`

## Phase 12: Dashboard Design System and Read-Only UI Redesign

Goal:

- replace functional-only dashboard styling with a cohesive shadcn-svelte–based UI that approximates the Stitch design reference, while remaining read-only against the daemon API

Current status:

- delivered (stacked PRs) — see [`docs/02-delivery/phase-12/implementation-plan.md`](../02-delivery/phase-12/implementation-plan.md) and [`docs/01-product/phase-12-dashboard-design-system-and-read-ui.md`](../01-product/phase-12-dashboard-design-system-and-read-ui.md)

Committed scope:

- shadcn-svelte primitives, shared layout and navigation, and migrated read-only views (home, candidates, show detail, movies, read-only config)
- no daemon API contract changes; no mutating HTTP routes
- accessibility and responsive baselines; `web/` Docker deployment remains viable

Explicitly deferred:

- config writes, Settings persistence, feed/rule editing (later phases)

Working notes:

- `docs/01-product/phase-12-dashboard-design-system-and-read-ui.md`

## Phase 13: Daemon Config Write API and Settings (Bounded)

Goal:

- opt-in bearer-protected config updates via the daemon API and a bounded Settings UI (runtime and other safe operational fields), with ETag concurrency and SvelteKit server-side proxying

Current status:

- implemented on `main` via `P13.01`-`P13.07` stacked delivery

Committed scope:

- mutating routes only when a write token is configured; `Authorization: Bearer` on writes; atomic file write; validate with CLI-equivalent rules; ETag / If-Match / 409 conflicts
- Settings forms for an approved subset; restart required for changes to take effect in v1

Explicit deferrals:

- feeds and rules authoring in the UI (Phase 14 placeholder)
- TLS, SSO, or full API auth beyond bearer-on-write
- hot reload without daemon restart

Working notes:

- `docs/01-product/phase-13-daemon-config-write-api-and-settings.md`

## Phase 14: Feeds and Rules Authoring in the UI (Placeholder)

Goal:

- structured editing of feeds and matching rules (and remaining config not covered by Phase 13), building on Phase 13 write patterns

Current status:

- placeholder only — not scheduled; see [`docs/01-product/phase-14-feeds-rules-ui-placeholder.md`](../01-product/phase-14-feeds-rules-ui-placeholder.md)

## Future Deferrals

These items are still explicitly deferred or not yet assigned a numbered phase:

- **Release calendar** — deferred as a feature inside the TMDB/dashboard surface, not its own phase
- **Rating-based intake gating** — deferred until TMDB integration is stable and display-only has been validated
- **Show/movie search-to-add from the UI** — deferred to Phase 14–style config expansion once feed and rule editing is in scope

The following items are **mapped** to numbered phases (no longer “unbounded” deferrals):

- **Config editor via web UI (bounded)** — Phase 13 (runtime subset); Phase 14 placeholder for feeds/rules
- **Visual polish / design system iteration** — Phase 12

## Current Planning Posture

- product phases `01`–`11` and engineering epics `01`–`04` are complete on `main`
- product phases `12`–`14` are defined in `docs/01-product/`; **Phase 12** is delivered via [`docs/02-delivery/phase-12/implementation-plan.md`](../02-delivery/phase-12/implementation-plan.md); **Phase 13** is not implemented until an approved ticket decomposition exists
- each new phase requires an explicit planning pass, approved ticket decomposition, and developer sign-off before implementation starts
- smaller bounded changes can still proceed as standalone PR work without inventing a new phase

Working notes:

- `docs/03-engineering/epic-03-delivery-orchestrator-modularity-and-concern-separation.md`
- `docs/02-delivery/engineering-epic-03/implementation-plan.md`
- `docs/03-engineering/epic-04-reviewer-facing-pr-body-and-thread-hygiene.md`
- `docs/02-delivery/engineering-epic-04/implementation-plan.md`

## Planning Rules

- keep phase docs outcome-focused
- keep tickets implementation-focused
- promote durable technical choices into ADRs
- numbered phases are planning buckets, not a promise of strict implementation sequence when dependencies allow independent work

Last verified against `README.md` and active delivery plans: 2026-04-09.
