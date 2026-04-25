# Engineering Epic 10: Delivery Tooling Module Decomposition

## Overview

`orchestrator.ts` has grown into a god module: 2045 lines doing five distinct
jobs simultaneously — type definitions, global config singleton, platform adapter
wrappers, string formatters, and CLI dispatch. `orchestrator.test.ts` mirrors
this at 5417 lines. Both are becoming a maintenance liability and a barrier to
the planned extraction of the delivery tooling into an app-agnostic GitHub
template repo.

EE10 is a pure structural refactor. Zero behavior changes. Every extracted module
maps to a focused concern. The test suite is green before and after every ticket.

## Context

The orchestrator's global `_config` singleton is the root dependency magnet. Any
module that needs runtime, packageManager, or reviewPolicy must import the entire
orchestrator to access it. This makes the god module self-reinforcing — new logic
gravitates toward `orchestrator.ts` because that is where the config lives.

EE10 breaks the magnet by moving the singleton to its own module. All other
extractions follow naturally from that anchor.

EE11 will replace the singleton with an explicit context object threaded through
the call stack. EE10 deliberately defers that work to keep this refactor pure and
verifiable. The module boundaries established here are designed to make EE11's
surgery straightforward.

## Design Decisions

### Module map

| Module                 | Responsibility                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`             | All exported types and interfaces — pure data contracts, no logic                                                                                           |
| `env.ts`               | Dot-env file loading: `parseDotEnv`, `ensureEnvReady`, `loadDotEnvIntoProcess`                                                                              |
| `runtime-config.ts`    | `_config` singleton, `initOrchestratorConfig`, `getOrchestratorConfig`, config load/resolve wrappers                                                        |
| `format.ts`            | All string renderers: `formatStatus`, `formatCurrentTicketStatus`, `formatAdvanceBoundaryGuidance`, `formatRepairSummary`, `formatStandaloneAiReviewResult` |
| `platform-adapters.ts` | Thin wrappers injecting `_config.runtime` into platform calls; `parsePullRequestNumber` private helper                                                      |
| `cli-runner.ts`        | `runDeliveryOrchestrator` CLI dispatch; `formatError` private helper                                                                                        |
| `orchestrator.ts`      | Re-export barrel only — no logic                                                                                                                            |

### Naming utilities move to `planning.ts`

`findExistingBranch`, `deriveBranchName`, `deriveWorktreePath`, and
`preferDeliveryBranch` are naming conventions derived from ticket definitions.
They belong with the planning concern already owned by `planning.ts`.

### Artifact helpers move to `ticket-flow.ts`

`materializeTicketContext`, `copyTicketScopedArtifacts`, and `copyFileIntoWorktree`
are part of the ticket start sequence. `materializeTicketContext` is already
called from `startTicket`. They move to `ticket-flow.ts`.

### `env.ts` is a standalone module

`parseDotEnv` is a pure string function. `ensureEnvReady` and
`loadDotEnvIntoProcess` are I/O operations with no dependency on config or
platform. Folding them into `runtime-config.ts` would give the config module a
file I/O responsibility. They get their own module.

### Platform adapters: individual functions, not a factory

Each platform adapter is an individual exported function that imports `_config`
from `runtime-config.ts`. A factory pattern (`createPlatformAdapters(config)`)
would be the right EE11 abstraction — but it bets on a specific injection design
before EE11 has been scoped. EE10 makes the mechanical move; EE11 chooses the
pattern.

### `formatError` stays in `cli-runner.ts`

One caller, one line, no reuse. Moving it to `format.ts` would export a trivial
helper with no test coverage and no other consumer. Revisit in EE11.

### `parsePullRequestNumber` stays private in `platform-adapters.ts`

One caller (`openPullRequest` wiring). No reason to export it. Revisit in EE11
when ownership boundaries are reconsidered.

### Deprecated export removed

`recordInternalReview` (deprecated alias for `recordPostVerifySelfAudit`) is
deleted in EE10.06. It is marked deprecated in the current code and has no
external callers outside the test suite. The test suite reference is removed
alongside it.

### Test file layout

Every source module has a corresponding test file. `orchestrator.test.ts` shrinks
to integration smoke tests only — it no longer tests pure functions that belong in
focused module test files. All three existing test files (`orchestrator.test.ts`,
`closeout-stack.test.ts`, `review.test.ts`) are audited and realigned.

### `_config` singleton deferred to EE11

The singleton moves to `runtime-config.ts` in EE10. The context-object refactor
(threading config explicitly through the call stack, eliminating
`initOrchestratorConfig` test boilerplate) is EE11 scope. EE10 moves the code;
EE11 fixes the pattern.

## Ticket Order

1. `EE10.01` — Extract `types.ts`
2. `EE10.02` — Extract `env.ts`
3. `EE10.03` — Extract `runtime-config.ts`
4. `EE10.04` — Extract `format.ts`
5. `EE10.05` — Extract `platform-adapters.ts`; move naming utilities and artifact helpers
6. `EE10.06` — Extract `cli-runner.ts`; prune deprecated exports; shrink barrel; realign test files
7. `EE10.07` — Retrospective and docs

## Exit Condition

`orchestrator.ts` is a re-export barrel with no logic. Each extracted module owns
exactly one concern. Every source module has a corresponding test file. Deprecated
exports are removed. `bun test` is green. The module structure is ready for
template-repo extraction in the follow-up epic.

## Retrospective

Required. The decomposition decisions made here — what is app-agnostic vs. wiring,
how test files map to source modules, where ownership boundaries land — are durable
architectural choices that shape both pirate-claw and the template repo. Worth
capturing what held and what needed adjustment before extraction begins.
