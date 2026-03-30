# Docs Index

The docs are organized by purpose so later phases can be added without flattening everything into one folder.

## Recommended Reading Order

1. `00-overview/start-here.md`
2. `01-product/phase-01-mvp.md`
3. `02-delivery/phase-01/implementation-plan.md`
4. `03-engineering/tdd-workflow.md`

## Folder Structure

### `00-overview`

Entry-point docs for new contributors or new Codex threads.

- `start-here.md`: onboarding and immediate next action
- `roadmap.md`: phase-level view of what comes next

### `01-product`

Phase-level product definitions.

- `phase-01-mvp.md`: current MVP scope and data flow

### `02-delivery`

Execution plans, issue conventions, and ticket breakdowns.

- `issue-tracking.md`: naming, sizing, and issue hierarchy
- `phase-01/implementation-plan.md`: ordered delivery plan for phase 01
- `phase-01/ticket-*.md`: one file per ticket
- `phase-01/*-rationale.md`: rationale notes for tickets and the post-phase polish pass

### `03-engineering`

Cross-cutting engineering rules that apply beyond a single phase.

- `tdd-workflow.md`: red-green-refactor workflow for this repo

### `04-decisions`

Architecture and tooling decisions that should remain explicit and reviewable.

- `adr-001-use-bun.md`: Bun runtime decision

## Repo Rules

- Do not implement all of phase 01 in one pass.
- Ship one small red-green-refactor slice at a time.
- Each ticket should be reviewable in roughly 1-3 hours of human-equivalent work.
- Use Bun as the repo runtime and default test runner unless a ticket explicitly justifies otherwise.
