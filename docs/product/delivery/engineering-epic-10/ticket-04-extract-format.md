# EE10.04 — Extract `format.ts`

## Goal

Move all string rendering functions out of `orchestrator.ts` into a dedicated
`format.ts` module. Migrate format tests into `test/format.test.ts`.

## Current Behavior

Five exported and two private format functions live in `orchestrator.ts`:

Exported:

- `formatStatus(state)` — full delivery state block
- `formatCurrentTicketStatus(state, ticketId?)` — active ticket block for poll-review
- `formatAdvanceBoundaryGuidance(state, advancedState, nextState)` — boundary mode output
- `formatNotificationMessage(event)` — re-exported from `notifications.ts`
- `formatReviewWindowMessage(state, ticketId?)` — re-exported from `notifications.ts`

Private (used only by `runDeliveryOrchestrator`):

- `formatRepairSummary(result)` — state repair output
- `formatStandaloneAiReviewResult(result)` — standalone review output

`loadTicketReviewSnapshot(ticket)` is a private helper used exclusively by
`formatCurrentTicketStatus`. It moves with it.

`generateRunDeliverInvocation` is config-derived — it moves to `runtime-config.ts`
in EE10.03, not here.

## Target Behavior

`tools/delivery/format.ts` owns all string renderers. `cli-runner.ts` (EE10.06)
will import format functions directly. `orchestrator.ts` re-exports the public
surface. Format functions depend on `types.ts` and `runtime-config.ts` only —
no platform I/O.

## Change Surface

- `tools/delivery/format.ts` (new file)
- `tools/delivery/orchestrator.ts` (remove format functions, re-export from `format.ts`)
- `tools/delivery/test/format.test.ts` (new file — migrated format tests)
- `tools/delivery/test/orchestrator.test.ts` (remove format describe blocks, update imports)

## Acceptance Criteria

- [ ] `tools/delivery/format.ts` exists and exports all listed functions
- [ ] `formatStatus`, `formatCurrentTicketStatus`, `formatAdvanceBoundaryGuidance` are no longer defined in `orchestrator.ts`
- [ ] `orchestrator.ts` re-exports format functions from `format.ts` (public API unchanged)
- [ ] `loadTicketReviewSnapshot` is private in `format.ts`
- [ ] `formatRepairSummary` and `formatStandaloneAiReviewResult` are exported from `format.ts` (consumed by `cli-runner.ts` in EE10.06)
- [ ] `test/format.test.ts` contains all format describe blocks migrated from `orchestrator.test.ts`
- [ ] `bun test` passes with no changes to test logic

## Tests

Migrate the following describe blocks from `orchestrator.test.ts` to
`test/format.test.ts` verbatim:

- `formatCurrentTicketStatus (EE6: findings block)` (~line 4601)
- `formatAdvanceBoundaryGuidance (EE7 boundary output)` (~line 4469)
- Any `formatStatus` test cases

Update import paths. No new test cases.
