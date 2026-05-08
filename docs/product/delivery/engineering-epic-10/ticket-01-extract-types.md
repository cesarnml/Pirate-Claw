# EE10.01 — Extract `types.ts`

## Goal

Move all exported type and interface definitions out of `orchestrator.ts` into a
dedicated `types.ts` module. Update all import paths across the delivery tooling.

## Current Behavior

All core types live in `orchestrator.ts`, which means any module needing a type
must import from the god module — dragging in config, platform, and CLI concerns
as transitive dependencies.

## Target Behavior

`tools/delivery/types.ts` contains all exported types with no logic and no
imports from other delivery modules. All other modules import types from `types.ts`
directly.

## Types to Move

From `orchestrator.ts`:

- `TicketStatus`
- `ReviewOutcome`
- `ReviewResult`
- `CodexPreflightOutcome`
- `InternalReviewPatchCommit`
- `TicketDefinition`
- `TicketState`
- `DeliveryState`
- `OrchestratorOptions`
- `DeliveryNotificationEvent`
- `AiReviewAgentState`
- `AiReviewAgentResult`
- `AiReviewCommentChannel`
- `AiReviewCommentKind`
- `AiReviewComment`
- `AiReviewThreadResolutionStatus`
- `AiReviewThreadResolution`
- `AiReviewFetcherResult`
- `AiReviewTriagerResult`
- `StandaloneAiReviewResult`
- `StandalonePullRequest`

Re-exported types that originate in other modules stay in those modules and
continue to be re-exported through `orchestrator.ts`:

- `OrchestratorConfig`, `ResolvedOrchestratorConfig`, `ResolvedReviewPolicy`,
  `ReviewPolicy`, `ReviewPolicyStageValue` — originate in `config.ts`

## Change Surface

- `tools/delivery/types.ts` (new file)
- `tools/delivery/orchestrator.ts` (replace type definitions with re-exports from `types.ts`)
- `tools/delivery/state.ts` (update imports)
- `tools/delivery/ticket-flow.ts` (update imports)
- `tools/delivery/review.ts` (update imports)
- `tools/delivery/notifications.ts` (update imports)
- `tools/delivery/pr-metadata.ts` (update imports)
- `tools/delivery/review-artifacts.ts` (update imports)
- `tools/delivery/closeout-stack.ts` (update imports if applicable)
- `tools/delivery/test/orchestrator.test.ts` (update imports)
- `tools/delivery/test/closeout-stack.test.ts` (update imports if applicable)
- `tools/delivery/test/review.test.ts` (update imports if applicable)

## Acceptance Criteria

- [ ] `tools/delivery/types.ts` exists and exports all listed types
- [ ] `types.ts` has no imports from other delivery modules
- [ ] `orchestrator.ts` re-exports all types from `types.ts` (public API unchanged)
- [ ] All internal delivery modules import types from `types.ts`, not `orchestrator.ts`
- [ ] `bun test` passes with no changes to test logic

## Tests

No new tests. Types carry no runtime behavior. Existing tests exercise the types
indirectly — green suite is the acceptance gate.
