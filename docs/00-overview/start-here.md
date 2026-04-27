# Start Here

This document is primarily for new AI threads working in this repo.

Its job is to answer three questions quickly:

1. what state is the project in now
2. which docs matter for the task at hand
3. how work should be planned, implemented, and handed off

## Current Repo State

Pirate Claw is implemented through **Phase 27** in the active delivery stack (product phases 01–27; see [`roadmap.md`](./roadmap.md)). Delivery artifacts for Phases 12–27 live under [`docs/02-delivery/`](../02-delivery/). The Phase 19 product spec remains the contract reference for the Obsidian Tide redesign and related dashboard/TV/movie read UI, **Phase 20** ([`phase-20-dashboard-torrent-actions.md`](../01-product/phase-20-dashboard-torrent-actions.md)) remains the dashboard-as-Transmission-proxy contract, **Phase 23** ([`phase-23-plex-browser-auth-and-credential-lifecycle.md`](../01-product/phase-23-plex-browser-auth-and-credential-lifecycle.md)) remains the live Plex auth/lifecycle contract, **Phase 24** ([`phase-24-synology-supervision-and-restart.md`](../01-product/phase-24-synology-supervision-and-restart.md)) remains the durable restart/supervision boundary, **Phase 25** ([`phase-25-in-browser-restart-round-trip-proof.md`](../01-product/phase-25-in-browser-restart-round-trip-proof.md)) remains the live browser restart round-trip contract, **Phase 26** ([`phase-26-mac-first-class-always-on-deployment.md`](../01-product/phase-26-mac-first-class-always-on-deployment.md)) is the active Mac always-on deployment contract, and **Phase 27** ([`phase-27-synology-dsm-first-stack-and-cold-start.md`](../01-product/phase-27-synology-dsm-first-stack-and-cold-start.md)) is the DSM-first Synology owner install contract (validated on DS918+ / DSM 7.1.1; owner install guide at [`docs/synology-install.md`](../synology-install.md)). The next release-blocking planning sequence is **Phase 28** ([`phase-28-owner-web-security.md`](../01-product/phase-28-owner-web-security.md)) and **Phase 29** ([`phase-29-openvpn-bridge-for-bundled-transmission.md`](../01-product/phase-29-openvpn-bridge-for-bundled-transmission.md)); **Phase 30** is release-critical UX/UI polish and **Phase 31** ([`phase-31-v1-release-and-schema-versioning.md`](../01-product/phase-31-v1-release-and-schema-versioning.md)) handles the v1.0.0 / schema-versioning release ceremony.

Current delivered surface:

- `pirate-claw run`
- `pirate-claw daemon`
- `pirate-claw status`
- `pirate-claw retry-failed`
- `pirate-claw reconcile`
- local config via `pirate-claw.config.json`
- compact TV config via `tv.defaults + tv.shows` with per-show overrides
- effective config inspection via `pirate-claw config show`
- env-backed Transmission username/password loading via process env or `.env`
- local runtime persistence via `pirate-claw.db`
- runtime artifacts under `.pirate-claw/runtime/cycles/` with 7-day retention
- movie codec policy mode via `movies.codecPolicy` (`prefer` by default, `require` for strict matching)
- queue-time Transmission `movie` / `tv` labels with warning+retry fallback when labels are unsupported
- per-media-type Transmission download directories via `transmission.downloadDirs`
- SvelteKit dashboard in `web/` that consumes the daemon HTTP API, including bounded runtime Settings writes and full feed and target management (add/remove feeds, TV defaults, movie policy, TV show targets) through server-side actions
- Phase 19 UI surface: Obsidian Tide design tokens, persistent left sidebar on desktop with mobile drawer fallback, four top-level routes (`/`, `/shows`, `/movies`, `/config`), poster-forward TV/movie views, show-detail TMDB refresh, and Plex chips/watch-state across supported library views
- Phase 20 dashboard torrent proxy (shipped on `main`, see product doc above): Torrent Manager with live Transmission rows and context-menu pause, resume, remove, and remove-with-delete; Transmission failures card listing deduped enqueue failures with Queue-to-retry; daemon API and downloader wiring that support those flows
- optional TMDB enrichment: `tmdb` config block and/or `PIRATE_CLAW_TMDB_API_KEY`, SQLite-backed cache, lazy enrichment on API reads, and an optional daemon background refresh cadence via `runtime.tmdbRefreshIntervalMinutes` (default 6 hours; set `0` to disable)
- optional Plex enrichment with browser-managed auth: operator-managed `plex.url`, browser Connect/Reconnect flow in onboarding and `/config`, durable device identity and auth state in SQLite, current usable token persisted in `plex.token`, best-effort silent renewal, background refresh sweeps, and read-only `plexStatus` / `watchCount` / `lastWatchedAt` fields on `/api/movies` and `/api/shows`
- Phase 24/25 restart contract: repo-owned daemon container artifact, durable restart proof for config + SQLite + persisted Plex auth state, browser-visible `requested -> restarting -> back_online | failed_to_return` proof in `/config`, shared restart vocabulary across browser surfaces, and explicit Synology Plex compatibility/remediation guidance
- Phase 26 Mac deployment contract: repo-owned per-user `launchd` reference artifact, dedicated Mac operator runbook, validated Apple Silicon restart round-trip under `launchd`, and a browser-facing restart-status proxy proven against the same durable restart artifact
- Phase 16 config editing: unified `/config` accordion cards, per-section toast feedback, post-save daemon restart affordance, Transmission ping, and read-only tooltips when write auth is absent
- Phase 17 onboarding and empty states: `/onboarding` guided first-run flow, strict initial-empty auto-trigger plus dismissal suppression/resume, blocked onboarding when writes are disabled, and explicit empty-state guidance across `/`, `/config`, `/shows`, `/movies`, and `/candidates/unmatched`
- Phase 27 DSM-first Synology owner install: `.spk` launcher/icon via Package Center, three-container stack (`pirate-claw-daemon`, `pirate-claw-web`, `transmission`) on a private Docker network, daemon first-startup bootstrap and generated write token, install health gate in onboarding; validated on DS918+ / DSM 7.1.1-42962 Update 9; owner install guide at [`docs/synology-install.md`](../synology-install.md)

Current product boundary:

- local CLI plus optional read-only browser dashboard
- Transmission is the downloader adapter
- SQLite is the local persistence boundary
- real-world feed compatibility for EZTV and Atlas is implemented
- post-queue lifecycle reconciliation and status visibility are implemented for Pirate Claw-queued torrents
- foreground daemon mode with scheduled run and reconcile cycles
- per-feed polling cadence with persistent poll state
- shared runtime lock prevents overlapping cycles
- machine-readable and human-readable cycle artifacts with bounded retention
- daemon HTTP API with read endpoints plus bounded write controls (`/api/config*`, `/api/daemon/restart`, `/api/transmission/ping`, and Phase 19 TV-detail TMDB refresh) when `runtime.apiPort` is configured; **Phase 20** (shipped) adds Transmission torrent lifecycle JSON actions, missing-torrent dispose, and `POST /api/candidates/:id/requeue` on the same port — requeue requires the daemon process to host the Transmission downloader alongside the API
- TMDB metadata is display-only and does not gate RSS intake

Still deferred (beyond the current Phase 21–26 completion sequence):

- remote feed capture
- hosted persistence
- download renaming or organization rules
- Synology archiving
- ingestion redesign beyond the local SQLite model

Last verified against `README.md`, roadmap, and active product docs: 2026-04-27.

Current planning focus:

- see [`roadmap.md`](./roadmap.md) for numbered phases and what is implemented on `main`
- use the roadmap to confirm whether the request is a bounded standalone change or needs a new approved phase/epic planning pass
- treat the current Phase 07 config surface and the current extracted delivery-orchestrator module boundaries as the baseline for future work
<<<<<<< HEAD
- for delivery-tooling architecture work, EE11 is the approved follow-up plan to replace the orchestrator `_config` singleton with an explicit context object and platform adapter factory; see [`engineering-epic-11/implementation-plan.md`](../02-delivery/engineering-epic-11/implementation-plan.md)
- the next product-completion planning buckets are Phase 28 (owner web security) and Phase 29 (OpenVPN bridge for bundled Transmission)
- treat the shipped Phase 25 browser proof as a follow-on to the Phase 24 restart contract, not as a replacement for the persisted Plex auth/device boundary
- treat the shipped Phase 26 Mac `launchd` path as a parallel supported deployment contract alongside the Phase 27 DSM-first owner install path, not as a reason to merge those operator runbooks together
- treat the Phase 27 DSM-first path as the validated Synology owner install path; the legacy expert-built runbook at `docs/synology-runbook.md` is now the advanced operator reference, not the default first-time path
- Phase 30 is release-critical UX/UI polish after functional completion; Phase 31 (`schemaVersion`, tagged v1, `VERSIONING.md`, changelog) is the release/versioning ceremony after product-completion phases land; keep Phase 20 dashboard torrent work in [`phase-20-dashboard-torrent-actions.md`](../01-product/phase-20-dashboard-torrent-actions.md), not under the Phase 19 contract

## Read These Docs By Task Type

If you are understanding the current product:

1. Read [`README.md`](../../README.md).
2. Read [`docs/00-overview/roadmap.md`](./roadmap.md).
3. Read the relevant product doc under `docs/01-product/`.

If you are planning or revising a phase:

1. Read the relevant product doc under `docs/01-product/`.
2. Read [`docs/02-delivery/phase-implementation-guidance.md`](../02-delivery/phase-implementation-guidance.md).
3. Read or update the relevant `docs/02-delivery/<phase>/implementation-plan.md`.
4. Run an explicit planning pass and use `grill-me` before finalizing the phase/epic scope or ticket decomposition. Plan Mode is optional, not required by repo policy.
5. Do not start implementation until the developer has approved the decomposed ticket stack.
6. If the user skips those control points and asks to implement new product-scope work anyway, pause, explain the missing planning step, and stop until the developer approves the plan.
7. If an approved phase implementation plan explicitly declares a docs-validation direct-to-`main` execution mode, follow that plan-specific mode instead of forcing the stacked PR orchestrator path.

If you are implementing an existing ticket:

1. Read the relevant phase implementation plan.
2. Read the specific ticket file.
3. Read any current-user docs affected by the change, usually [`README.md`](../../README.md).
4. Read any engineering note directly tied to the work, such as schema or delivery docs.

If you are making a smaller bounded product or ergonomics change that does not justify a new phase/epic:

1. Confirm that the work does not need a new phase plan or ticket decomposition.
2. Implement it as a normal standalone PR-sized change.
3. Use the orchestrator's standalone `ai-review` path instead of the ticketed stacked flow.

If you are doing workflow or delivery-tooling work:

1. Read [`docs/02-delivery/phase-implementation-guidance.md`](../02-delivery/phase-implementation-guidance.md).
2. Read [`docs/03-engineering/delivery-orchestrator.md`](../03-engineering/delivery-orchestrator.md) if the work touches stacked delivery flow.
3. If continuing an orchestrated ticket, read the generated handoff artifact under `.agents/delivery/<plan-key>/handoffs/` before implementing.

## Planning Workflow

New product-scope expansion follows this sequence before any implementation starts:

1. **Ideate and scope** — use `grill-me` to pressure-test the phase goal, dependencies, and ticket boundaries. The developer stays in the conversation here. Plan Mode can help structure it, but is not a repo policy requirement.

2. **Decompose into tickets** — produce a set of thin, vertically-sliced delivery tickets. Each ticket should be small enough to explain clearly in one PR review.

3. **Developer approves the stack** — the developer reads the decomposed tickets and signs off on the slice boundaries before any branch or code is created. This is a required control point, not ceremony.

4. **Commit plan and tickets to `main`** — the implementation plan and all ticket docs must land on the default branch before the orchestrator creates any ticket branches. Skipping this breaks the orchestrator's branch sequencing.

5. **Hand off to the orchestrator** — once the plan is on `main`, invoke `bun run deliver --plan <path> start` to begin ticket-by-ticket orchestrated delivery. The orchestrator runs until the phase is done or a real blocker stops it.

If a request arrives to implement new product scope without a completed planning pass and developer-approved ticket decomposition, surface the missing control point, point here and to `docs/02-delivery/phase-implementation-guidance.md`, and wait for the developer to close the gap before proceeding.

If the request names a phase or epic and the user says to implement, start, begin, run, or resume it, treat that as a full orchestrated delivery request: work the ticket stack in order and keep going until you hit a blocker or the user changes scope.

When shaping a new phase or revising an existing one:

- start with an explicit planning pass
- keep the phase outcome-focused
- break work into small end-to-end tickets
- keep explicit deferrals in the phase plan
- decide retrospective status during planning (`required` or `skip`) and record it in the implementation plan before ticket generation
- prefer a thin real slice over broad setup work
- use `grill-me` to pressure-test the plan before it is accepted
- treat developer approval of the resulting ticket decomposition as required before implementation starts
- if those control points are missing for new product-scope work, pause and inform rather than improvising scope

The shared stance for phase planning lives in:

- [`docs/02-delivery/phase-implementation-guidance.md`](../02-delivery/phase-implementation-guidance.md)

## Ticket Implementation Workflow

When implementing a ticket:

- land one small real behavior at a time
- keep the ticket end to end
- test what the user can observe
- for orchestrated stacked delivery, re-read the handoff artifact and required docs at each ticket boundary instead of relying on prior conversational context
- during external waits such as AI-review windows, do not read ahead into the next ticket; the review wait is intentionally idle and the next ticket should start from the handoff artifact plus current repo state
- avoid unrelated cleanup during the ticket unless required to land safely
- update rationale and operator-facing docs when behavior changes
- stop at the ticket boundary for single-ticket work; for phase or epic requests, keep advancing through the stack until blocked or the user explicitly stops you

Default technical constraints:

- Bun + TypeScript
- SQLite for persistence
- Transmission as the first downloader adapter
- source-agnostic core where practical
- behavior-focused tests through public interfaces

## Review And Handoff Workflow

In this repo's son-of-anton workflow, the developer remains directly engaged at three control points:

- ideation into concrete phase/epic product goals
- approval of the decomposed thin-slice ticket stack
- final review and approval of delivered stacked PR slices before merge/advance

After that final approval, close reviewed stacked slices with `bun run closeout-stack --plan <plan-path>` rather than manually re-deriving the merge sequence.

Smaller bounded product-surface changes can still use a standalone non-ticket PR path. Son-of-Anton does not require every implementation change to become a new phase/epic as long as the review surface remains human-sized.

Every ticket handoff should leave a short explanation artifact in the PR, review notes, or ticket update that answers:

- what behavior went red first
- why the chosen implementation was the smallest acceptable path
- what alternative was considered and rejected
- what was intentionally deferred

If a change suggests broader cleanup:

- do not automatically widen the current ticket
- capture the cleanup separately
- use a refactor follow-up only when the phase slice is already complete or the cleanup is required for safe delivery

## Doc Map

- `docs/01-product/`: product goals and phase scope
- `docs/02-delivery/`: implementation plans, tickets, and delivery guidance
- `docs/03-engineering/`: engineering workflow and supporting technical notes
- `docs/04-decisions/`: ADRs and durable technical decisions

## If Something Feels Ambiguous

Default to the smallest implementation that preserves the current product boundary.

If scope, tradeoffs, or ticket shape still feel vague, use `grill-me` before writing the plan or before starting the implementation.
