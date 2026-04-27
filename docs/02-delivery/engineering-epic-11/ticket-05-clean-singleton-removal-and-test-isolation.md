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

Why this path:

Alternative considered:

Deferred:
