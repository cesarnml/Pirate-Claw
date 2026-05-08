# EE10.02 — Extract `env.ts`

## Goal

Move dot-env loading logic out of `orchestrator.ts` into a dedicated `env.ts`
module. Migrate `parseDotEnv` tests into a focused `test/env.test.ts` file.

## Current Behavior

Three env-related functions live in `orchestrator.ts`:

- `parseDotEnv(content)` — pure string parser, exported and tested
- `ensureEnvReady(cwd)` — orchestrates env file copy + load, private
- `ensureLocalEnvFile(cwd)` — copies `.env` from primary worktree if missing, private
- `loadDotEnvIntoProcess(cwd)` — reads `.env` and populates `process.env`, private

These are a self-contained env-loading concern with no dependency on config or
platform beyond `copyLocalEnvIfPresent` (from `platform.ts`) and
`findPrimaryWorktreePath` (an orchestrator wrapper). Folding them into
`runtime-config.ts` would give the config module a file I/O responsibility.

## Target Behavior

`tools/delivery/env.ts` owns all env loading. `runDeliveryOrchestrator` calls
`ensureEnvReady` from `env.ts`. `parseDotEnv` tests move to `test/env.test.ts`.

## Change Surface

- `tools/delivery/env.ts` (new file)
- `tools/delivery/orchestrator.ts` (remove env functions, add import from `env.ts`)
- `tools/delivery/test/env.test.ts` (new file — migrated `parseDotEnv` tests)
- `tools/delivery/test/orchestrator.test.ts` (remove `parseDotEnv` tests, update imports)

## Acceptance Criteria

- [ ] `tools/delivery/env.ts` exists and exports `ensureEnvReady` and `parseDotEnv`
- [ ] `parseDotEnv` is no longer defined or exported from `orchestrator.ts`
- [ ] `orchestrator.ts` re-exports `parseDotEnv` from `env.ts` (public API unchanged)
- [ ] `test/env.test.ts` contains all `parseDotEnv` test cases (migrated verbatim)
- [ ] `test/orchestrator.test.ts` no longer contains `parseDotEnv` tests
- [ ] `bun test` passes with no changes to test logic

## Tests

Migrate existing `parseDotEnv` describe block from `orchestrator.test.ts` to
`test/env.test.ts` verbatim. Update import path. No new test cases.
