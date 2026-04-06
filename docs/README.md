# Docs Index

The docs are organized by purpose so later phases can be added without flattening everything into one folder.

## Recommended Reading Order

1. `00-overview/start-here.md`
2. `00-overview/roadmap.md`
3. `03-engineering/delivery-orchestrator.md`
4. `01-product/phase-04-always-on-local-runtime.md`
5. `02-delivery/phase-04/implementation-plan.md`
6. `03-engineering/tdd-workflow.md`

## Folder Structure

### `00-overview`

Entry-point docs for new contributors or new AI-agent threads.

- `start-here.md`: onboarding and immediate next action
- `roadmap.md`: phase-level view of what comes next

### `01-product`

Phase-level product definitions.

- `phase-01-mvp.md`: current MVP scope and data flow
- `phase-02-real-world-feed-compatibility.md`: live-feed compatibility scope and deferrals
- `phase-03-post-queue-lifecycle.md`: lifecycle reconciliation and status semantics
- `phase-04-always-on-local-runtime.md`: always-on scheduling, locking, and runtime artifacts
- `phase-05-intake-policy-and-routing.md`: codec policy mode and Transmission routing labels
- `phase-06-synology-runbook.md`: Synology runbook goals and boundaries
- `phase-07-config-ergonomics.md`: compact config, config visibility, and env-backed Transmission secrets

### `02-delivery`

Execution plans, issue conventions, and ticket breakdowns.

- `issue-tracking.md`: naming, sizing, and issue hierarchy
- `phase-01/implementation-plan.md`: ordered delivery plan for phase 01
- `phase-01/ticket-*.md`: one file per ticket
- `phase-01/*-rationale.md`: rationale notes for tickets and the post-phase polish pass
- `phase-02/implementation-plan.md`: real-world feed compatibility delivery plan
- `phase-03/implementation-plan.md`: post-queue lifecycle delivery plan
- `phase-04/implementation-plan.md`: always-on local runtime delivery plan
- `phase-05/implementation-plan.md`: intake policy and Transmission routing delivery plan
- `phase-07/implementation-plan.md`: config ergonomics delivery plan

### `03-engineering`

Cross-cutting engineering rules that apply beyond a single phase.

- `sqlite-schema.md`: current local SQLite tables, identities, and persistence invariants
- `snyk-workflow-rationale.md`: rationale for adding Snyk-based security scanning to CI
- `tdd-workflow.md`: red-green-refactor workflow for this repo

### `04-decisions`

Architecture and tooling decisions that should remain explicit and reviewable.

- `adr-001-use-bun.md`: Bun runtime decision

## Repo Rules

- Do not implement all of a phase in one pass.
- Ship one small red-green-refactor slice at a time.
- Each ticket should be reviewable in roughly 1-3 hours of human-equivalent work.
- Use Bun as the repo runtime and default test runner unless a ticket explicitly justifies otherwise.
