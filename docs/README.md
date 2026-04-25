# Docs Index

The docs are organized by purpose so later phases can be added without flattening everything into one folder.

## Recommended Reading Order

1. `../README.md`
2. `synology-install.md` for the DSM-first Synology owner path once Phase 27 lands, or `synology-runbook.md` for current advanced/manual NAS deployment notes
3. `00-overview/start-here.md`
4. `00-overview/roadmap.md`
5. the most relevant current product doc under `01-product/`
6. the matching delivery plan under `02-delivery/` when the work is phase/epic-scoped
7. `03-engineering/delivery-orchestrator.md` for delivery-tooling work
8. `03-engineering/tdd-workflow.md` for test-first implementation work

## Top-Level Docs

- `synology-install.md`: planned DSM-first Synology owner install guide (created by Phase 27)
- `synology-runbook.md`: advanced/manual Synology operator runbook and live historical deployment contract
- `synology-reference-pirate-claw-container.sh`: repo-owned Synology daemon supervision artifact for the reviewed Docker restart contract

## Folder Structure

### `00-overview`

Entry-point docs for new contributors or new AI-agent threads.

- `start-here.md`: onboarding and immediate next action
- `roadmap.md`: phase-level view of shipped scope and future deferrals

### `01-product`

Phase-level product definitions.

- `phase-01-mvp.md`: current MVP scope and data flow
- `phase-02-real-world-feed-compatibility.md`: live-feed compatibility scope and deferrals
- `phase-03-post-queue-lifecycle.md`: lifecycle reconciliation and status semantics
- `phase-04-always-on-local-runtime.md`: always-on scheduling, locking, and runtime artifacts
- `phase-05-intake-policy-and-routing.md`: codec policy mode and Transmission routing labels
- `phase-06-synology-runbook.md`: Synology runbook goals and boundaries
- `phase-07-config-ergonomics.md`: compact config, config visibility, and env-backed Transmission secrets
- `phase-08-media-placement.md`: per-media-type Transmission download directories
- `phase-09-daemon-http-api.md`: read-only JSON API served by the daemon
- `phase-10-read-only-dashboard.md`: SvelteKit browser-based read-only dashboard
- `phase-11-tmdb-metadata-enrichment.md`: TMDB ratings, posters, and metadata enrichment
- `phase-12-dashboard-design-system-and-read-ui.md`: shadcn-svelte dashboard redesign (read-only; delivered via stacked PRs)
- `phase-13-daemon-config-write-api-and-settings.md`: bounded config write API and Settings (implemented)
- `phase-14-feed-setup-and-target-management.md`: feed and target management via web UI — feeds, TV defaults, movie policy (implemented)
- `phase-15-rich-visual-state-and-activity-views.md`: live Transmission progress, TV/movie enriched views, unmatched candidates (implemented)
- `phase-16-config-editing-hot-reload-and-daemon-controls.md`: unified Config page, inline validation, post-save daemon restart (implemented)
- `phase-17-onboarding-and-empty-state.md`: first-time setup wizard and per-section empty states (implemented)
- `phase-18-plex-media-server-enrichment.md`: Plex read-only enrichment — library status, watch state, background refresh (implemented)
- `phase-19-ui-redesign-razzle-dazzle.md`: Obsidian Tide UI/UX redesign — left sidebar, poster-forward layouts, view consolidation (implemented)
- `phase-20-dashboard-torrent-actions.md`: dashboard as Transmission proxy — torrent lifecycle actions, requeue, data model clean break (implemented)
- `phase-21-bootstrap-contract.md`: zero hand-edited files and starter-state bootstrap contract
- `phase-22-browser-only-setup.md`: browser-only onboarding and installer flow to working daemon setup
- `phase-23-plex-browser-auth-and-credential-lifecycle.md`: browser-managed Plex auth, persisted device identity, and best-effort credential renewal
- `phase-24-synology-supervision-and-restart.md`: Synology restart durability and supervision contract
- `phase-25-in-browser-restart-round-trip-proof.md`: browser-visible restart request, progress, and return-proof contract
- `phase-26-mac-first-class-always-on-deployment.md`: Mac Mini / Mac Studio / dev-server always-on deployment contract
- `phase-27-synology-dsm-first-stack-and-cold-start.md`: DSM-first Synology `.spk` / Container Manager stack and cold-start contract
- `phase-28-owner-web-security.md`: local owner account, sessions, CSRF, trusted origins, and destructive action gates
- `phase-29-openvpn-bridge-for-bundled-transmission.md`: OpenVPN bridge for the bundled Transmission stack
- `phase-30-ux-ui-polish-after-functional-completion.md`: UX/UI polish after functional product completion
- `phase-31-v1-release-and-schema-versioning.md`: v1.0.0 release, config `schemaVersion`, SQLite `PRAGMA user_version` (product definition; renumbered from the former “Phase 20 v1-only” slot)

### `02-delivery`

Execution plans, issue conventions, and ticket breakdowns.

- `issue-tracking.md`: naming, sizing, and issue hierarchy
- `engineering-epic-02/implementation-plan.md`: runnable ticket stack for post-PR review-flow convergence in the delivery orchestrator
- `engineering-epic-03/implementation-plan.md`: runnable ticket stack for delivery orchestrator modularity and concern separation
- `engineering-epic-04/implementation-plan.md`: runnable ticket stack for reviewer-facing PR body and thread hygiene polish in delivery tooling
- `engineering-epic-08/implementation-plan.md`: runnable ticket stack for codex preflight review gate in the delivery orchestrator
- `engineering-epic-09/implementation-plan.md`: runnable ticket stack for review-policy enforcement and doc-only consolidation in the delivery orchestrator
- `engineering-epic-07/implementation-plan.md`: runnable ticket stack for configurable ticket-boundary modes in Son-of-Anton delivery
- `phase-01/implementation-plan.md`: ordered delivery plan for phase 01
- `phase-01/ticket-*.md`: one file per ticket
- `phase-01/*-rationale.md`: rationale notes for tickets and the post-phase polish pass
- `phase-02/implementation-plan.md`: real-world feed compatibility delivery plan
- `phase-03/implementation-plan.md`: post-queue lifecycle delivery plan
- `phase-04/implementation-plan.md`: always-on local runtime delivery plan
- `phase-05/implementation-plan.md`: intake policy and Transmission routing delivery plan
- `phase-06/implementation-plan.md`: Synology runbook delivery plan
- `phase-06/synology-runbook.md`: historical Phase 06 Synology validation artifact and baseline runbook
- `phase-07/implementation-plan.md`: config ergonomics delivery plan
- `phase-08/implementation-plan.md`: media placement delivery plan
- `phase-09/implementation-plan.md`: daemon HTTP API delivery plan
- `phase-10/implementation-plan.md`: read-only SvelteKit dashboard delivery plan
- `phase-11/implementation-plan.md`: TMDB metadata enrichment delivery plan (tickets P11.01–P11.06; delivered on `main`)
- `phase-12/implementation-plan.md`: dashboard design system and read-only UI redesign (tickets P12.01–P12.08)
- `phase-13/implementation-plan.md`: bounded config write API and Settings delivery plan (tickets P13.01–P13.07; delivered on `main`)
- `phase-14/implementation-plan.md`: feed setup and target management delivery plan (tickets P14.01–P14.06)
- `phase-15/implementation-plan.md`: rich visual state and activity views delivery plan (tickets P15.01–P15.07; delivered on `main`)
- `phase-16/implementation-plan.md`: config editing, hot reload, and daemon controls delivery plan (tickets P16.01–P16.09; delivered on `main`)
- `phase-17/implementation-plan.md`: onboarding and empty-state delivery plan (tickets P17.01–P17.07; delivered on `main`)
- `phase-18/implementation-plan.md`: Plex Media Server enrichment delivery plan (tickets P18.01–P18.04; delivered on `main`)
- `phase-19/implementation-plan.md`: UI/UX redesign delivery plan (tickets P19.01–P19.08; delivered in the current stacked phase)
- `phase-23/implementation-plan.md`: Plex browser auth and credential lifecycle delivery plan
- `phase-24/implementation-plan.md`: Synology supervision and restart completion delivery plan
- `phase-25/implementation-plan.md`: in-browser restart round-trip proof delivery plan

### `03-engineering`

Cross-cutting engineering rules that apply beyond a single phase.

- `epic-01-pr-body-reporting-unification.md`: shared reviewer-facing PR body reporting cleanup for ticket-linked and standalone orchestrator flows
- `epic-02-delivery-orchestrator-pr-flow-convergence.md`: reviewer-sized convergence plan for shared post-PR external AI-review lifecycle architecture
- `epic-03-delivery-orchestrator-modularity-and-concern-separation.md`: concern-first modularization plan for the delivery orchestrator
- `epic-04-reviewer-facing-pr-body-and-thread-hygiene.md`: reviewer-facing PR metadata and thread resolution hygiene decisions
- `epic-05-orchestrator-context-minimization.md`: context compaction and reviewer-signal preservation for orchestrated delivery
- `epic-06-compaction-gate-and-findings-surfacing.md`: compaction gate and findings surfacing rules for orchestrated delivery
- `epic-07-configurable-ticket-boundary-modes-for-son-of-anton.md`: ticket-boundary modes for Son-of-Anton delivery
- `epic-08-codex-preflight-review-gate.md`: Codex preflight stage, gate, and review policy introduction
- `epic-09-review-policy-enforcement-and-doc-only-consolidation.md`: policy enforcement semantics, doc-only consolidation, and default posture
- `sqlite-schema.md`: current local SQLite tables, identities, and persistence invariants
- `son-of-anton.md`: the dev-facing doctrine for this repo's AI-assisted delivery workflow
- `tdd-workflow.md`: red-green-refactor workflow for this repo

### `04-decisions`

Architecture and tooling decisions that should remain explicit and reviewable.

- `adr-001-use-bun.md`: Bun runtime decision

## Repo Rules

- Do not implement all of a phase in one pass.
- Ship one small red-green-refactor slice at a time.
- Each ticket should be reviewable in roughly 1-3 hours of human-equivalent work.
- Use Bun as the repo runtime and default test runner unless a ticket explicitly justifies otherwise.
