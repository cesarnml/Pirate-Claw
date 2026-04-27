# EE11.01 — Context Foundation

## Goal

Add the explicit delivery orchestrator context shape without migrating broad
call sites yet.

## Current Behavior

Runtime configuration is held in the mutable `_config` singleton in
`runtime-config.ts`. Callers that need runtime values import `_config` directly
or call `initOrchestratorConfig` before using singleton-backed functions.

## Target Behavior

Introduce a small, plain context object that will become the runtime dependency
carrier for EE11:

```ts
type DeliveryOrchestratorContext = {
  config: ResolvedOrchestratorConfig;
  invocation: string;
  platform: PlatformAdapters;
};
```

Add a factory that builds this context from resolved config. Keep the ticket
mostly additive so reviewers can inspect the shape before churn begins.

## Change Surface

- `tools/delivery/runtime-config.ts` or a new focused context module
- `tools/delivery/platform-adapters.ts` type surface as needed
- `tools/delivery/orchestrator.ts` barrel exports
- focused tests for context construction

## Acceptance Criteria

- [ ] `DeliveryOrchestratorContext` exists and is exported from a canonical module
- [ ] Context includes only `config`, `invocation`, and `platform`
- [ ] `createDeliveryOrchestratorContext(config)` exists
- [ ] `invocation` is derived from `generateRunDeliverInvocation(config.packageManager)`
- [ ] The context does not include delivery state, parsed CLI args, notifier,
      process env, or command-local values
- [ ] Existing behavior remains unchanged
- [ ] `bun test` passes

## Tests

Add focused tests proving context construction derives the invocation and carries
the resolved config. Use existing config fixtures where practical.

## Rationale

Red first:

Why this path:

Alternative considered:

Deferred:
