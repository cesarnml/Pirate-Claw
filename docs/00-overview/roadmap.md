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
- The canonical Synology operator runbook now lives at `docs/synology-runbook.md`.
- The historical Phase 06 validation artifact remains at `docs/02-delivery/phase-06/synology-runbook.md`.
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
- `docs/synology-runbook.md`
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

- feeds and rules authoring in the UI (Phase 14)
- TLS, SSO, or full API auth beyond bearer-on-write
- hot reload without daemon restart

Working notes:

- `docs/01-product/phase-13-daemon-config-write-api-and-settings.md`

## Phase 14: Feed Setup and Target Management MVP

Goal:

- add/remove RSS feeds (TV/movie) via web UI
- add/remove TV show targets and manage global TV codec/resolution defaults
- manage movie years, resolutions, codecs, and codecPolicy via web UI
- dedicated write endpoints per config section; UI read-only until write token is set

Current status:

- implemented on `main` via `P14.01`–`P14.06` stacked delivery; see [`docs/02-delivery/phase-14/implementation-plan.md`](../02-delivery/phase-14/implementation-plan.md) and [`docs/01-product/phase-14-feed-setup-and-target-management.md`](../01-product/phase-14-feed-setup-and-target-management.md)

## Phase 15: Rich Visual State and Activity Views

Goal:

- live download progress (Transmission RPC) surfaced alongside pirate-claw lifecycle state
- TV Shows and Movies views with TMDB enrichment, per-item status, and drill-down
- unmatched candidates (skipped_no_match) surfaced with title and feed context
- client-side filter/search across all views; server-side filtering deferred

Current status:

- implemented on `main` via `P15.01`–`P15.07` stacked delivery; see [`docs/02-delivery/phase-15/implementation-plan.md`](../02-delivery/phase-15/implementation-plan.md) and [`docs/01-product/phase-15-rich-visual-state-and-activity-views.md`](../01-product/phase-15-rich-visual-state-and-activity-views.md)

## Phase 16: Config Editing, Hot Reload, and Daemon Controls

Goal:

- unified Config page integrating all Phase 13/14 write endpoints into one coherent surface
- inline validation, success/failure toasts, post-save daemon restart offer
- disabled controls with tooltip for read-only mode (no write token); no banners
- hot reload scoped to API layer (already works); interval changes still require restart

Current status:

- implemented on `main` via `P16.01`-`P16.09` stacked delivery; see [`docs/02-delivery/phase-16/implementation-plan.md`](../02-delivery/phase-16/implementation-plan.md) and [`docs/01-product/phase-16-config-editing-hot-reload-and-daemon-controls.md`](../01-product/phase-16-config-editing-hot-reload-and-daemon-controls.md)

## Phase 17: Onboarding and Empty State

Goal:

- first-time setup wizard: add 1 feed + 1 TV show or movie year target, then hand off to main UI
- bootstrap via starter config template (daemon must be running before wizard begins)
- per-section empty states across all dashboard views

Current status:

- implemented on `main` via `P17.01`-`P17.07` stacked delivery; see [`docs/02-delivery/phase-17/implementation-plan.md`](../02-delivery/phase-17/implementation-plan.md) and [`docs/01-product/phase-17-onboarding-and-empty-state.md`](../01-product/phase-17-onboarding-and-empty-state.md)

## Phase 18: Plex Media Server Enrichment

Goal:

- close the loop between "downloaded by pirate-claw" and "in your Plex library / watched"
- enrich `/api/shows` and `/api/movies` with `plexStatus` (in_library | missing | unknown), `watchCount`, and `lastWatchedAt`
- display-only; no intake gating in v1

Current status:

- implemented on `main` via `P18.01`-`P18.04` stacked delivery
- optional `plex` config now drives background movie/show refresh, read-only API enrichment, and dashboard badges/details for movies and shows
- resilience follow-up landed during review: movie and show sweeps fail independently, and per-show lookup failures no longer abort the rest of the refresh pass

Committed scope:

- optional `plex` config block (`url`, `token`, `refreshIntervalMinutes`)
- Plex HTTP API client under `src/plex/` (read-only)
- SQLite cache: `plex_tv_cache`, `plex_movie_cache`; background refresh timer
- enriched API responses on existing endpoints; `plex.token` redacted in `/api/config`
- zero behavior change when Plex is not configured

Explicitly deferred:

- intake gating based on Plex state (`skipIfInLibrary`, etc.)
- write operations to Plex
- Jellyfin / Emby / Kodi support
- Plex.tv cloud OAuth; per-episode watch state

Working notes:

- `docs/01-product/phase-18-plex-media-server-enrichment.md`
- `docs/02-delivery/phase-18/implementation-plan.md`

## Phase 19: UI/UX Redesign ("Razzle-Dazzle")

Goal:

- elevate the web UI to a visually premium, poster-forward media command center
- adopt the Obsidian Tide design language (`#0F172A` navy, `#14B8A6` teal, Inter)
- restructure navigation to a left sidebar; absorb Candidates and Unmatched into Dashboard
- surface existing API data that the current UI leaves on the table (movie backdrops, Phase 18 Plex state)

Current status:

- implemented in the current delivery stack via `P19.01`-`P19.08`
- shipped the Obsidian Tide visual system, responsive sidebar shell, redesigned Dashboard / TV Shows / TV Show Detail / Movies / Config routes, and dashboard consolidation of the old Candidates and Unmatched surfaces
- one approved scope exception landed during `P19.05`: show-level TMDB network metadata, episode spec tags on `/api/shows`, and a write-authenticated TMDB refresh action for the show detail route

Committed scope:

- Obsidian Tide design tokens replacing current oklch vars in `web/src/app.css`
- left sidebar (persistent desktop, icon rail on medium viewports, drawer on mobile)
- 4 top-level nav items: Dashboard / TV Shows / Movies / Config
- Dashboard absorbs `/candidates` (Active Downlink panel) and `/unmatched` (Event Log panel)
- all views redesigned: Dashboard, TV Shows, TV Show Detail, Movies, Config
- visual improvements primarily draw from existing data, with one approved
  P19.05 exception: show-level TMDB network metadata, episode spec tags surfaced
  on `/api/shows`, and a write-authenticated manual TMDB refresh action for the
  show detail route

Explicitly deferred:

- new daemon endpoints or config surface beyond the approved P19.05 detail-page
  refresh exception
- dark/light theme toggle (Obsidian Tide dark is the single theme in v1)
- onboarding wizard re-architecture (retouched for new tokens only)

Working notes:

- `docs/01-product/phase-19-ui-redesign-razzle-dazzle.md`
- `docs/02-delivery/phase-19/implementation-plan.md`

## Phase 20: Dashboard Torrent Actions

Goal:

- make the dashboard a functional proxy for the Transmission client (pause, resume, remove, remove-with-delete, missing disposition, failed-candidate requeue)
- replace redundant lifecycle columns with derived `torrentDisplayState()` plus optional `pirateClawDisposition` terminal writes

Current status:

- shipped on `main`; product contract: [`docs/01-product/phase-20-dashboard-torrent-actions.md`](../01-product/phase-20-dashboard-torrent-actions.md)
- delivery record: [`docs/02-delivery/phase-20/implementation-plan.md`](../02-delivery/phase-20/implementation-plan.md)

## Phase 21: Bootstrap Contract and Zero Hand-Edited Files

Goal:

- remove the operator requirement to create, copy, or hand-edit config/env files before first use
- define a valid starter-state contract the system can create automatically
- make bootstrap state explicit across daemon, API, and web surfaces

Current status:

- product definition only; see [`docs/01-product/phase-21-bootstrap-contract.md`](../01-product/phase-21-bootstrap-contract.md)

## Phase 22: Browser-Only Setup and Installer Flow

Goal:

- move a fresh install from starter state to a working ingestion-ready setup entirely through the browser
- unify onboarding and config editing around one dependency-ordered setup flow

Current status:

- product definition only; see [`docs/01-product/phase-22-browser-only-setup.md`](../01-product/phase-22-browser-only-setup.md)

## Phase 23: Plex Browser Auth and Credential Lifecycle

Goal:

- replace manual Plex token entry with browser-managed Plex auth
- persist device identity needed for renewal
- reduce operator reconnect friction with best-effort silent renewal

Current status:

- implemented in the current Phase 23 delivery stack
- operators can connect Plex from onboarding or `/config` through Plex's hosted browser flow instead of manually extracting a token
- Pirate Claw persists durable device identity and renewal state in SQLite while continuing to persist the current usable credential in `plex.token`
- best-effort silent renewal now runs at startup, first Plex touch, and auth-failure retry paths; reconnect-required states stay explicit in the UI when renewal fails
- Phase 24 should assume both `pirate-claw.db` and the config file containing `plex.token` survive restart/supervision boundaries together

## Phase 24: Synology Supervision and Restart Completion

Goal:

- make Synology-supervised restart preserve Pirate Claw's durability boundary reliably
- make the restart contract truthful without yet claiming browser round-trip proof

Current status:

- implemented in the active Phase 24 delivery stack
- the repo now carries a reviewed Synology daemon supervision artifact and runbook contract for Docker-managed restart
- restart-backed config writes plus SQLite/Plex auth state are covered by automated durability proof rather than prose-only claims
- restart UI copy is explicit that the browser can request restart but does not confirm daemon return yet
- Plex-on-Synology guidance now distinguishes the reviewed Pirate Claw baseline from the operator-managed PMS compatibility/remediation path

## Phase 25: In-Browser Restart Round-Trip Proof

Goal:

- let the browser request a restart and observe a truthful `requested -> restarting -> back online | failed to return` journey
- prove that the restarted daemon actually returned rather than assuming the supervisor did the right thing

Current status:

- implemented in the current Phase 25 delivery stack
- `/config` now carries a real browser-visible restart round trip with truthful `requested -> restarting -> back_online` proof backed by the daemon's durable restart artifact
- shared restart vocabulary now covers `/config`, the app-shell restart banner, and onboarding-adjacent copy, with a bounded 45-second `failed_to_return` state when the daemon never comes back
- see [`docs/01-product/phase-25-in-browser-restart-round-trip-proof.md`](../01-product/phase-25-in-browser-restart-round-trip-proof.md)

## Phase 26: Mac First-Class Always-On Deployment

Goal:

- make Mac a first-class always-on deployment target for Pirate Claw
- support credible 24/7 operation on Mac Mini, Mac Studio, and local dev-server setups without hand-managed daemon babysitting

Current status:

- implemented in the active Phase 26 delivery stack
- the repo now carries a reviewed per-user `launchd` reference artifact and a dedicated Mac runbook instead of folding Mac procedures into the Synology runbook
- real-machine validation on Apple Silicon proved `launchd` handoff, daemon return, config/SQLite/Plex-auth durability, and browser-facing restart-status proxy truthfulness on the same restart-proof artifact
- Mac support is now explicit for the bounded Phase 26 contract: Apple Silicon, per-user `launchd`, one durable install boundary, and no system-daemon or native app packaging claims
- see [`docs/01-product/phase-26-mac-first-class-always-on-deployment.md`](../01-product/phase-26-mac-first-class-always-on-deployment.md)
- see [`docs/mac-runbook.md`](../mac-runbook.md)
- see [`docs/mac-launchd-reference.md`](../mac-launchd-reference.md)

## Phase 29: UX/UI Polish After Functional Completion

Goal:

- perform broad UX/UI refinement only after bootstrap, browser-only setup, restart proof, and Mac/Synology always-on deployment work are in place
- improve cohesion, clarity, and visual trust across operational and shelf-like views

Current status:

- product definition only; see [`docs/01-product/phase-29-ux-ui-polish-after-functional-completion.md`](../01-product/phase-29-ux-ui-polish-after-functional-completion.md)

## Phase 30: v1.0.0 Release and Schema Versioning

Goal:

- `package.json` bumped to `1.0.0`; tagged release with CHANGELOG summarizing shipped product work
- config file stamped with `schemaVersion: 1` on next write; absent = v1 (silent)
- SQLite DB stamped with `PRAGMA user_version = 1` on first startup
- `VERSIONING.md` documents breaking change policy: major version = config/db schema pair

Current status:

- product definition only; see [`docs/01-product/phase-30-v1-release-and-schema-versioning.md`](../01-product/phase-30-v1-release-and-schema-versioning.md)

## Future Deferrals

These items are still explicitly deferred or not yet assigned a numbered phase:

- **Release calendar** — deferred as a feature inside the TMDB/dashboard surface, not its own phase
- **Rating-based intake gating** — deferred until TMDB integration is stable and display-only has been validated
- **Show/movie search-to-add from the UI** — deferred; add-by-name from Config page (Phase 14/16) covers the initial need

The following items are **mapped** to numbered phases (no longer “unbounded” deferrals):

- **Config editor via web UI** — Phase 13 (runtime subset); Phase 14 (feeds, movies, TV defaults); Phase 16 (unified UX)
- **Visual polish / design system iteration** — Phase 12 (baseline); Phase 19 (full Obsidian Tide redesign); Phase 29 (post-functional completion polish)
- **Plex Media Server enrichment** — Phase 18
- **Zero hand-edited bootstrap** — Phase 21
- **Browser-only first-run setup** — Phase 22
- **Plex browser auth + credential lifecycle** — Phase 23
- **Synology restart-backed completion** — Phase 24
- **Browser restart round-trip proof** — Phase 25
- **Mac first-class always-on deployment** — Phase 26
- **v1.0.0 release / schema versioning** — Phase 30
- **Dashboard Transmission proxy** — Phase 20

## Current Planning Posture

- product phases `01`–`19` are implemented in the current delivery stack; **Phase 19** is delivered via `P19.01`–`P19.08`
- **Phase 20** (dashboard torrent proxy) is **shipped** on `main`
- **Phases 21–26** are shipped on `main`; **Phase 29** remains the current product-completion planning bucket for UX/UI polish
- **Phase 30** (v1.0.0 / schema versioning) remains the release/versioning ceremony after product-completion phases are done
- engineering epic write-ups **`EE01`–`EE09`** live under `docs/03-engineering/` (orchestrator, PR hygiene, and delivery workflow tooling)
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

Last verified against `README.md` and active delivery plans: 2026-04-25 (Phases 20, 21, 22, 23, 24, 25, and 26 are delivered on `main`; Phase 29 remains the current product-planning bucket; Phase 30 remains the release/versioning phase).
