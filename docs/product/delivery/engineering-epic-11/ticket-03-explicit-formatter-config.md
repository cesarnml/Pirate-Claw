# EE11.03 — Explicit Formatter Config

## Goal

Remove hidden `_config` reads from formatter code by passing config or context
explicitly to formatting functions.

## Current Behavior

`format.ts` imports `_config` and reads boundary mode, review policy, and package
manager directly while rendering terminal output. Format tests must initialize
global config state before assertions.

## Target Behavior

Formatting functions remain pure string renderers. Any formatter that needs
runtime configuration receives it explicitly.

Examples:

```ts
formatStatus(state, context.config);
formatAdvanceBoundaryGuidance(state, advancedState, nextState, context);
formatCurrentTicketStatus(state, context.config, ticketId);
```

The exact signature may vary, but formatters must not read singleton state.

## Change Surface

- `tools/delivery/format.ts`
- `tools/delivery/cli-runner.ts`
- `tools/delivery/test/format.test.ts`
- any tests that call formatter functions directly

## Acceptance Criteria

- [ ] `format.ts` no longer imports `_config`
- [ ] Formatter functions that need config receive config/context explicitly
- [ ] Invocation text is derived from explicit config/context, not singleton state
- [ ] Format tests construct local config/context values directly
- [ ] Output behavior remains unchanged
- [ ] `bun test` passes

## Tests

Update direct formatter tests to pass explicit config/context. Keep expected
output unchanged unless a test only encoded previous singleton setup mechanics.

## Rationale

Red first: direct formatter, ticket-flow, and orchestrator tests were updated to
pass explicit config values before the full `verify:quiet` gate. The formatter
module now has no `_config` import to satisfy the ticket's hidden-state check.

Why this path: passing `ResolvedOrchestratorConfig` directly keeps formatter
functions as pure string renderers while preserving existing terminal output and
avoiding a broader CLI command-context migration before EE11.04.

Alternative considered: passing the full delivery context everywhere, but the
formatters only need config values today, so taking the narrower dependency
keeps this ticket smaller and makes future context threading mechanical.

Deferred: command helper splitting and full context ownership remain in EE11.04;
final singleton export removal remains in EE11.05.
