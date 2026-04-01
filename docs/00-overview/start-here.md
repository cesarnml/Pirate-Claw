# Start Here

This document is primarily for new AI threads working in this repo.

Its job is to answer three questions quickly:

1. what state is the project in now
2. which docs matter for the task at hand
3. how work should be planned, implemented, and handed off

## Current Repo State

Pirate Claw is implemented through Phase 02.

Current delivered surface:

- `pirate-claw run`
- `pirate-claw status`
- `pirate-claw retry-failed`
- local config via `pirate-claw.config.json`
- local runtime persistence via `pirate-claw.db`

Current product boundary:

- local CLI only
- Transmission is the downloader adapter
- SQLite is the local persistence boundary
- real-world feed compatibility for EZTV and Atlas is implemented

Still deferred:

- web UI
- scheduling or polling
- remote feed capture
- hosted persistence
- download completion polling
- download renaming or organization rules
- Synology archiving
- ingestion redesign beyond the local SQLite model

## Read These Docs By Task Type

If you are understanding the current product:

1. Read [`README.md`](../../README.md).
2. Read [`docs/00-overview/roadmap.md`](./roadmap.md).
3. Read the relevant product doc under `docs/01-product/`.

If you are planning or revising a phase:

1. Read the relevant product doc under `docs/01-product/`.
2. Read [`docs/02-delivery/phase-implementation-guidance.md`](../02-delivery/phase-implementation-guidance.md).
3. Read or update the relevant `docs/02-delivery/<phase>/implementation-plan.md`.
4. If the phase is still fuzzy, use `grill-me` before finalizing the plan.

If you are implementing an existing ticket:

1. Read the relevant phase implementation plan.
2. Read the specific ticket file.
3. Read any current-user docs affected by the change, usually [`README.md`](../../README.md).
4. Read any engineering note directly tied to the work, such as schema or delivery docs.

If you are doing workflow or delivery-tooling work:

1. Read [`docs/02-delivery/phase-implementation-guidance.md`](../02-delivery/phase-implementation-guidance.md).
2. Read [`docs/03-engineering/delivery-orchestrator.md`](../03-engineering/delivery-orchestrator.md) if the work touches stacked delivery flow.
3. If continuing an orchestrated ticket, read the generated handoff artifact under `.codex/delivery/<plan-key>/handoffs/` before implementing.

## Planning Workflow

When shaping a new phase or revising an existing one:

- keep the phase outcome-focused
- break work into small end-to-end tickets
- keep explicit deferrals in the phase plan
- prefer a thin real slice over broad setup work
- use `grill-me` when the decision tree is still unclear

The shared stance for phase planning lives in:

- [`docs/02-delivery/phase-implementation-guidance.md`](../02-delivery/phase-implementation-guidance.md)

## Ticket Implementation Workflow

When implementing a ticket:

- land one small real behavior at a time
- keep the ticket end to end
- test what the user can observe
- for orchestrated stacked delivery, re-read the handoff artifact and required docs at each ticket boundary instead of relying on prior conversational context
- during external waits such as AI-review windows, read ahead into the next ticket and nearby seams if it helps maintain momentum, but do not write ahead across ticket boundaries
- avoid unrelated cleanup during the ticket unless required to land safely
- update rationale and operator-facing docs when behavior changes
- stop at the ticket boundary unless the user explicitly says to continue

Default technical constraints:

- Bun + TypeScript
- SQLite for persistence
- Transmission as the first downloader adapter
- source-agnostic core where practical
- behavior-focused tests through public interfaces

## Review And Handoff Workflow

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
