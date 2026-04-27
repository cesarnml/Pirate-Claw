# Engineering Epic 11: Delivery Tooling Context Object

## Overview

EE10 decomposed the delivery orchestrator into focused modules. The remaining
architectural debt is not file size; it is hidden shared runtime state.

`runtime-config.ts` currently owns a mutable `_config` singleton, and modules
such as `platform-adapters.ts`, `format.ts`, and `cli-runner.ts` read from it
directly. That pattern works, but it makes dependencies ambient, keeps test
setup coupled to `initOrchestratorConfig`, and weakens the path toward extracting
the delivery tooling into a reusable template.

EE11 replaces that singleton with an explicit, plain orchestration context.

## Goal

Make runtime dependencies visible without turning the orchestrator into a
framework.

The target shape is a small context object:

```ts
type DeliveryOrchestratorContext = {
  config: ResolvedOrchestratorConfig;
  invocation: string;
  platform: PlatformAdapters;
};
```

The context is created once after config resolution. Command handlers and helper
modules receive the context or the narrower values they need. Platform adapters
are built by a factory and close over `runtime` and `packageManager`.

## Design Decisions

### Clean break from `_config`

EE11 removes `_config`, `initOrchestratorConfig`, and
`getOrchestratorConfig`. This is repo-local tooling, not a published API, so
backward compatibility is not useful enough to justify keeping two config
patterns alive.

The remaining config helpers stay:

- `loadOrchestratorConfig`
- `resolveOrchestratorConfig`
- `generateRunDeliverInvocation`

### Full but bounded context

The context carries only stable runtime dependencies:

- `config`
- `invocation`
- `platform`

It does not carry delivery state, parsed CLI arguments, notifier instances,
process env, or command-local values. Those remain explicit function inputs.

### Platform adapter factory

`platform-adapters.ts` becomes a factory:

```ts
const platform = createPlatformAdapters(config);
```

Adapter methods close over `config.runtime` and `config.packageManager`. This
removes repeated singleton reads and makes command-level tests able to pass fake
adapter objects.

The PR creation contract also improves here. Instead of returning only a URL and
requiring a caller-side `parsePullRequestNumber`, `createPullRequest` returns:

```ts
{
  url: string;
  number: number;
}
```

PR URL parsing stays inside the platform boundary.

### Explicit formatter config

`format.ts` stops reading `_config`. Formatter functions that need boundary
mode, review policy, package manager, or invocation receive config/context
explicitly. Formatting remains pure string rendering.

### Command handler split without a framework

`cli-runner.ts` is allowed to become smaller, but EE11 must not introduce a
command bus, dependency injection container, class hierarchy, or plugin registry.

The acceptable shape is plain helper functions grouped by command concern:

- status/sync/repair/start
- self-audit/preflight
- open-pr/review/record-review/reconcile-late-review
- advance/restack

Each receives explicit values such as `cwd`, `state`, `context`, `notifier`, and
parsed command data.

### Keep canonical EE10 ownership

`materializeTicketContext` remains in `ticket-flow.ts`. EE10 confirmed that it
touches filesystem paths but owns delivery state and handoff artifacts, not raw
platform primitives.

## Explicit Deferrals

- No dependency injection container.
- No command bus.
- No package extraction or template-repo publishing.
- No behavior changes to the delivery workflow.
- No broad rename pass outside what the context migration requires.
- No move of `materializeTicketContext`.

## Exit Condition

The delivery orchestrator has no `_config`, `initOrchestratorConfig`, or
`getOrchestratorConfig` surface. Runtime config flows through an explicit
context. Platform adapters are constructed by factory. Formatters receive config
explicitly. `cli-runner.ts` is easier to scan through plain command helpers.
Tests construct local context/config values instead of mutating module state.

`bun test` is green.

## Retrospective

Required.

Why: EE11 changes the durable dependency boundary of the delivery tooling and
settles the follow-up architecture promised by EE10.

Trigger: architecture/process impact.
