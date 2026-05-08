# EE10.06 — Extract `cli-runner.ts`; Shrink Barrel; Realign Test Files

## Goal

Move `runDeliveryOrchestrator` and its private helpers into `cli-runner.ts`.
Reduce `orchestrator.ts` to a pure re-export barrel. Remove the deprecated
`recordInternalReview` export. Realign `orchestrator.test.ts`,
`closeout-stack.test.ts`, and `review.test.ts` to import from their source
modules, not from the barrel.

## Current Behavior

`runDeliveryOrchestrator` — the 350-line CLI dispatch switch — lives in
`orchestrator.ts` alongside:

- `formatError(error)` — private, one caller (the catch block)
- `parseSelfAuditArgs(positionals)` — private
- `normalizeUniquePatchCommitShas(rawShas)` — private
- `resolveInternalReviewPatchCommits(...)` — private

`recordInternalReview` is marked `@deprecated` and delegates to
`recordPostVerifySelfAudit`. It has no external callers.

`orchestrator.test.ts` imports everything through the `orchestrator.ts` barrel.
After EE10.01–EE10.05, many of those imports should point to focused source
modules instead.

## Target Behavior

`tools/delivery/cli-runner.ts` owns the CLI entrypoint and its private helpers.
`tools/delivery/orchestrator.ts` contains only re-exports — no logic, no private
functions, no mutable state.

Test files import from their source module where the function now lives, not from
the barrel. `orchestrator.test.ts` shrinks to integration smoke tests covering
end-to-end command dispatch wiring.

## Change Surface

- `tools/delivery/cli-runner.ts` (new file)
- `tools/delivery/orchestrator.ts` (reduce to barrel — re-exports only)
- `tools/delivery/test/orchestrator.test.ts` (remove migrated test cases; update all imports to source modules; retain integration smoke tests)
- `tools/delivery/test/closeout-stack.test.ts` (audit and update imports)
- `tools/delivery/test/review.test.ts` (audit and update imports)

## Acceptance Criteria

- [ ] `tools/delivery/cli-runner.ts` exists and exports `runDeliveryOrchestrator`
- [ ] `formatError`, `parseSelfAuditArgs`, `normalizeUniquePatchCommitShas`, `resolveInternalReviewPatchCommits` are private in `cli-runner.ts`
- [ ] `orchestrator.ts` contains only `export { ... } from '...'` statements — no logic, no `let`, no `function`, no `const`
- [ ] `recordInternalReview` is deleted from `orchestrator.ts` and all test references removed
- [ ] `test/orchestrator.test.ts` imports each function from its source module (not via barrel) for unit tests
- [ ] `test/orchestrator.test.ts` retains integration tests for end-to-end command dispatch
- [ ] `test/closeout-stack.test.ts` imports are updated to source modules where applicable
- [ ] `test/review.test.ts` imports are updated to source modules where applicable
- [ ] `bun test` passes with no changes to test logic

## Tests

No new test cases. The `EE8.01` and `EE8.02` describe blocks in
`orchestrator.test.ts` (lines ~4776 and ~4985) test self-audit and codex
preflight behavior — they belong in `test/ticket-flow.test.ts`. Migrate them
verbatim, update import paths.

Remaining `orchestrator.test.ts` content after migration: integration tests that
exercise the full `runDeliveryOrchestrator` dispatch path — a dozen or fewer
test cases covering start, advance, poll-review, and error handling at the
entrypoint level.

## Deprecation Removal

`recordInternalReview` is the only deprecated export. Delete its definition and
its `@deprecated` JSDoc. Remove any test cases that test it directly (they test
`recordPostVerifySelfAudit` transitively — verify those tests still exist on
the non-deprecated function before deleting).
