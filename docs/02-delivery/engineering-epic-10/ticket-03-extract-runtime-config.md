# EE10.03 — Extract `runtime-config.ts`

## Goal

Move the `_config` singleton and all config init/access/resolution functions out
of `orchestrator.ts` into a dedicated `runtime-config.ts` module. Migrate config
tests into `test/runtime-config.test.ts`.

## Current Behavior

The `_config` module-level singleton in `orchestrator.ts` is the primary
dependency magnet. Any module needing `runtime`, `packageManager`, `defaultBranch`,
or `reviewPolicy` must import the entire orchestrator. The following functions
manage it:

- `_config` — mutable module-level singleton (private)
- `initOrchestratorConfig(config)` — exported, sets `_config`
- `getOrchestratorConfig()` — exported, reads `_config`
- `loadOrchestratorConfig(cwd)` — exported, delegates to `config.ts`
- `resolveOrchestratorConfig(raw, cwd)` — exported, delegates to `config.ts`
- `generateRunDeliverInvocation(packageManager)` — exported, pure string helper
  derived from config shape

Also moved here (config re-exports currently in `orchestrator.ts`):

- `inferPackageManager` — re-exported from `config.ts`
- `VALID_REVIEW_POLICY_STAGE_VALUES` — re-exported from `config.ts`
- `OrchestratorConfig`, `ResolvedOrchestratorConfig`, `ResolvedReviewPolicy`,
  `ReviewPolicy`, `ReviewPolicyStageValue` — type re-exports from `config.ts`

## Target Behavior

`tools/delivery/runtime-config.ts` owns the singleton and all config surface.
`platform-adapters.ts` and `cli-runner.ts` (upcoming tickets) import `_config`
from `runtime-config.ts` rather than from `orchestrator.ts`. The singleton
pattern is preserved unchanged — context-object refactor is EE11 scope.

## Change Surface

- `tools/delivery/runtime-config.ts` (new file)
- `tools/delivery/orchestrator.ts` (remove config logic, re-export from `runtime-config.ts`)
- `tools/delivery/test/runtime-config.test.ts` (new file — migrated config tests)
- `tools/delivery/test/orchestrator.test.ts` (remove config tests, update imports)

## Acceptance Criteria

- [ ] `tools/delivery/runtime-config.ts` exists and exports all listed functions and types
- [ ] `_config` singleton lives in `runtime-config.ts` only
- [ ] `orchestrator.ts` re-exports all config surface from `runtime-config.ts` (public API unchanged)
- [ ] `test/runtime-config.test.ts` contains all orchestrator config test cases (migrated verbatim)
- [ ] `test/orchestrator.test.ts` no longer contains config describe block
- [ ] `bun test` passes with no changes to test logic

## Tests

Migrate the `orchestrator config` describe block (currently nested inside
`describe('delivery orchestrator')` around line 3883) to
`test/runtime-config.test.ts` verbatim. Update import paths. No new test cases.
