# Start Here

This document is primarily for new AI threads working in this repo.

Its job is to answer three questions quickly:

1. what state is the project in now
2. which docs matter for the task at hand
3. how work should be planned, implemented, and handed off

## Current Repo State

Pirate Claw is implemented through Phase 05.

Current delivered surface:

- `pirate-claw run`
- `pirate-claw daemon`
- `pirate-claw status`
- `pirate-claw retry-failed`
- `pirate-claw reconcile`
- local config via `pirate-claw.config.json`
- local runtime persistence via `pirate-claw.db`
- runtime artifacts under `.pirate-claw/runtime/cycles/` with 7-day retention
- movie codec policy mode via `movies.codecPolicy` (`prefer` by default, `require` for strict matching)
- queue-time Transmission `movie` / `tv` labels with warning+retry fallback when labels are unsupported

Current product boundary:

- local CLI only
- Transmission is the downloader adapter
- SQLite is the local persistence boundary
- real-world feed compatibility for EZTV and Atlas is implemented
- post-queue lifecycle reconciliation and status visibility are implemented for Pirate Claw-queued torrents
- foreground daemon mode with scheduled run and reconcile cycles
- per-feed polling cadence with persistent poll state
- shared runtime lock prevents overlapping cycles
- machine-readable and human-readable cycle artifacts with bounded retention
  Still deferred:

- web UI
- remote feed capture
- hosted persistence
- download renaming or organization rules
- Synology archiving
- ingestion redesign beyond the local SQLite model

Last verified against `README.md` and CLI commands: 2026-04-07.

Current planning focus:

- use the roadmap to identify the active phase or bounded ticket work; phase/epic requests should flow through the delivery orchestrator until blocked or explicitly narrowed
- the delivery orchestrator's post-PR external AI-review lifecycle convergence work is implemented; further delivery-tooling changes should treat that boundary as the new baseline

## Read These Docs By Task Type

If you are understanding the current product:

1. Read [`README.md`](../../README.md).
2. Read [`docs/00-overview/roadmap.md`](./roadmap.md).
3. Read the relevant product doc under `docs/01-product/`.

If you are planning or revising a phase:

1. Read the relevant product doc under `docs/01-product/`.
2. Read [`docs/02-delivery/phase-implementation-guidance.md`](../02-delivery/phase-implementation-guidance.md).
3. Read or update the relevant `docs/02-delivery/<phase>/implementation-plan.md`.
4. Use Plan Mode plus `grill-me` before finalizing the phase/epic scope or ticket decomposition.
5. Do not start implementation until the developer has approved the decomposed ticket stack.
6. If the user skips those control points and asks to implement new product-scope work anyway, pause, explain the missing planning step, and stop until the developer approves the plan.

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

If the request names a phase or epic and the user says to implement, start, begin, run, or resume it, treat that as a full orchestrated delivery request: work the ticket stack in order and keep going until you hit a blocker or the user changes scope.

When shaping a new phase or revising an existing one:

- start in Plan Mode
- keep the phase outcome-focused
- break work into small end-to-end tickets
- keep explicit deferrals in the phase plan
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
- during external waits such as AI-review windows, read ahead into the next ticket and nearby seams if it helps maintain momentum, but do not write ahead across ticket boundaries
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

After that final approval, close reviewed stacked slices with `bun run stacked-closeout --plan <plan-path>` rather than manually re-deriving the merge/rebase/retarget sequence.

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
