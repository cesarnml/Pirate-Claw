# EE11.05 — Clean Singleton Removal And Test Isolation

## Goal

Remove the old singleton config surface and replace test setup with local
config/context construction.

## Current Behavior

`_config`, `initOrchestratorConfig`, and `getOrchestratorConfig` remain exported.
Tests that exercise singleton-backed modules call `initOrchestratorConfig` before
assertions.

## Target Behavior

The singleton pattern is gone. Tests use local config/context values and small
fixture builders where that improves readability.

This is the cleanup gate for EE11.

## Change Surface

- `tools/delivery/runtime-config.ts`
- `tools/delivery/orchestrator.ts`
- `tools/delivery/test/*.test.ts`
- any source module or test still importing `_config`,
  `initOrchestratorConfig`, or `getOrchestratorConfig`

## Acceptance Criteria

- [ ] `_config` is deleted
- [ ] `initOrchestratorConfig` is deleted
- [ ] `getOrchestratorConfig` is deleted
- [ ] The barrel no longer exports those APIs
- [ ] No source or test file contains `_config.`
- [ ] No source or test file calls `initOrchestratorConfig(`
- [ ] Tests use local config/context builders instead of mutating module state
- [ ] `loadOrchestratorConfig`, `resolveOrchestratorConfig`, and
      `generateRunDeliverInvocation` remain available
- [ ] `bun test` passes

## Tests

Update all tests that currently initialize singleton state. Add minimal fixture
builders only when they reduce repeated object boilerplate.

## Rationale

Red first:
Focused delivery tests initially encoded the hidden singleton contract: helpers
could be called after mutating module-level config. The removal work made those
dependencies explicit, so tests now build local resolved config/context values
and pass them through the same helper surfaces used by the CLI.

Why this path:
Deleting `_config`, `initOrchestratorConfig`, and `getOrchestratorConfig`
directly from `runtime-config.ts` forced every remaining source and test caller
to choose a config source at the call site. `runDeliveryOrchestrator` resolves
config once, builds a `DeliveryOrchestratorContext`, and passes config/context
through state, review, PR, and boundary helpers. This keeps runtime config
visible without adding a replacement global.

Alternative considered:
Keeping optional helper fallbacks with hard-coded defaults would reduce test
churn, but it would preserve a second implicit runtime path. The ticket is the
cleanup gate for EE11, so the exported helper signatures now require explicit
config or context where runtime behavior depends on it.

Deferred:
Durable documentation cleanup for the final EE11 architecture summary remains
with the docs/retrospective ticket; this ticket only updates the active cleanup
ticket rationale and code/test surfaces.
