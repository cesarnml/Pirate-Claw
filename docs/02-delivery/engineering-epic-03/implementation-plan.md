# Engineering Epic 03 Implementation Plan

Engineering Epic 03 breaks the delivery orchestrator into concern-first modules behind the existing `runDeliveryOrchestrator()` facade and current command surface.

## Epic

- `Engineering Epic 03 Delivery Orchestrator Modularity And Concern Separation`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this epic. If scope still feels fuzzy, use `grill-me` before implementation.

## Ticket Order

1. `E3.01 Module Boundary Baseline And Facade Freeze`
2. `E3.02 Platform Adapter Extraction`
3. `E3.03 Planning And State Core Extraction`
4. `E3.04 Review Lifecycle Core Extraction`
5. `E3.05 PR Metadata And Reviewer-Facing Rendering Extraction`
6. `E3.06 Command Handler Rewire And Final Orchestrator Slim-Down`

## Ticket Files

- `ticket-01-module-boundary-baseline-and-facade-freeze.md`
- `ticket-02-platform-adapter-extraction.md`
- `ticket-03-planning-and-state-core-extraction.md`
- `ticket-04-review-lifecycle-core-extraction.md`
- `ticket-05-pr-metadata-and-reviewer-facing-rendering-extraction.md`
- `ticket-06-command-handler-rewire-and-final-orchestrator-slim-down.md`

## Exit Condition

`tools/delivery/orchestrator.ts` becomes a thin composition shell around concern-first modules while preserving the current `bun run deliver --plan ...` operator surface, storage roots, reviewer-facing semantics, and `runDeliveryOrchestrator(argv, cwd)` facade.

## In Scope

- modular extraction behind stable public behavior
- explicit module ownership boundaries
- regression coverage that proves current public behavior remains intact
- thin command adapters over extracted planning, state, review, PR-metadata, platform, and notification modules

## Out Of Scope

- PR-creation redesign
- branch/worktree strategy redesign
- `stacked-closeout` redesign
- storage-layout migration
- `ai-code-review` fetcher and triager contract redesign
- new operator-visible delivery commands or workflow semantics

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- the previous tests are green
- the previous ticket doc contains rationale and any non-redundant follow-up notes
- the facade and operator surface still behave the same from the user's perspective
- the previous PR still feels comfortably reviewable on its own

## Stop Conditions

Pause for review if:

- a ticket starts redesigning workflow semantics instead of extracting a seam
- a helper extraction would force storage-path or command-surface changes
- a PR grows too large to review comfortably as one slice
- the line between ticket-flow, review, and PR-metadata ownership becomes ambiguous
