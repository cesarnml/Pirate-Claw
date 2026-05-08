# EE11.04 — CLI Command Context Wiring And Handler Split

## Goal

Build the delivery context once in `runDeliveryOrchestrator` and split the large
CLI dispatch switch into plain command helpers.

## Current Behavior

`cli-runner.ts` loads config, initializes `_config`, parses args, loads state,
dispatches commands, saves state, formats output, emits notifications, and wires
platform/review/ticket dependencies. The command switch is readable but large,
and many command paths still read singleton config directly.

## Target Behavior

`runDeliveryOrchestrator` resolves config, creates
`DeliveryOrchestratorContext`, and passes it into command helpers.

Command helpers are plain functions grouped by concern, not a framework:

- status/sync/repair/start
- self-audit/preflight
- open-pr/review/record-review/reconcile-late-review
- advance/restack

Each helper receives explicit inputs such as `cwd`, `state`, `context`,
`notifier`, parsed command data, and command-local dependencies.

## Change Surface

- `tools/delivery/cli-runner.ts`
- optional new command helper module(s) under `tools/delivery/` if that is
  clearer than keeping helpers in `cli-runner.ts`
- `tools/delivery/test/orchestrator.test.ts`
- focused command-helper tests if helpers become exported for testing

## Acceptance Criteria

- [ ] `runDeliveryOrchestrator` creates context once after config and boundary
      override resolution
- [ ] Command paths use context/config instead of `_config`
- [ ] The main dispatch body is split into plain helper functions
- [ ] No command bus, DI container, class hierarchy, or plugin registry is added
- [ ] Command behavior and output remain unchanged
- [ ] Existing integration smoke tests remain meaningful
- [ ] `bun test` passes

## Tests

Keep existing integration tests that exercise `runDeliveryOrchestrator`. Add
focused tests only where command helpers expose logic that was previously hard
to test without the full dispatcher.

## Rationale

Red first: the orchestrator integration tests were run after threading context
through the command paths, and `verify:quiet` caught no behavioral drift.

Why this path: `runDeliveryOrchestrator` now creates one
`DeliveryOrchestratorContext` from the resolved config and passes it through the
live command path while preserving exported helper defaults for the existing
test surface.

Alternative considered: changing every exported helper signature as a hard
break, but that would force a broad test migration before EE11.05's final
singleton cleanup and would make this ticket harder to review.

Deferred: remaining compatibility defaults that still fall back to the current
singleton are intentionally left for EE11.05, where the deprecated singleton
exports are removed in one cleanup pass.
