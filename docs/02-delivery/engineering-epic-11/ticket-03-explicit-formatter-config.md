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

Red first:

Why this path:

Alternative considered:

Deferred:
