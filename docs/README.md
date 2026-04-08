# Docs Index

The docs are organized by purpose so later phases can be added without flattening everything into one folder.

## Recommended Reading Order

1. `../README.md`
2. `00-overview/start-here.md`
3. `00-overview/roadmap.md`
4. the most relevant current product doc under `01-product/`
5. the matching delivery plan under `02-delivery/` when the work is phase/epic-scoped
6. `03-engineering/delivery-orchestrator.md` for delivery-tooling work
7. `03-engineering/tdd-workflow.md` for test-first implementation work

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
- `phase-12-dashboard-design-system-and-read-ui.md`: shadcn-svelte dashboard redesign (read-only; not yet implemented)
- `phase-13-daemon-config-write-api-and-settings.md`: bounded config write API and Settings (not yet implemented)
- `phase-14-feeds-rules-ui-placeholder.md`: future feeds/rules UI scope (placeholder only)

### `02-delivery`

Execution plans, issue conventions, and ticket breakdowns.

- `issue-tracking.md`: naming, sizing, and issue hierarchy
- `engineering-epic-02/implementation-plan.md`: runnable ticket stack for post-PR review-flow convergence in the delivery orchestrator
- `engineering-epic-03/implementation-plan.md`: runnable ticket stack for delivery orchestrator modularity and concern separation
- `engineering-epic-04/implementation-plan.md`: runnable ticket stack for reviewer-facing PR body and thread hygiene polish in delivery tooling
- `phase-01/implementation-plan.md`: ordered delivery plan for phase 01
- `phase-01/ticket-*.md`: one file per ticket
- `phase-01/*-rationale.md`: rationale notes for tickets and the post-phase polish pass
- `phase-02/implementation-plan.md`: real-world feed compatibility delivery plan
- `phase-03/implementation-plan.md`: post-queue lifecycle delivery plan
- `phase-04/implementation-plan.md`: always-on local runtime delivery plan
- `phase-05/implementation-plan.md`: intake policy and Transmission routing delivery plan
- `phase-06/implementation-plan.md`: Synology runbook delivery plan
- `phase-06/synology-runbook.md`: canonical operator-facing Synology runbook (validated)
- `phase-07/implementation-plan.md`: config ergonomics delivery plan
- `phase-08/implementation-plan.md`: media placement delivery plan
- `phase-09/implementation-plan.md`: daemon HTTP API delivery plan
- `phase-10/implementation-plan.md`: read-only SvelteKit dashboard delivery plan
- `phase-11/implementation-plan.md`: TMDB metadata enrichment delivery plan (tickets P11.01–P11.06; delivered on `main`)

### `03-engineering`

Cross-cutting engineering rules that apply beyond a single phase.

- `epic-01-pr-body-reporting-unification.md`: shared reviewer-facing PR body reporting cleanup for ticket-linked and standalone orchestrator flows
- `epic-02-delivery-orchestrator-pr-flow-convergence.md`: reviewer-sized convergence plan for shared post-PR external AI-review lifecycle architecture
- `epic-03-delivery-orchestrator-modularity-and-concern-separation.md`: concern-first modularization plan for the delivery orchestrator
- `epic-04-reviewer-facing-pr-body-and-thread-hygiene.md`: reviewer-facing PR metadata and thread resolution hygiene decisions
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
