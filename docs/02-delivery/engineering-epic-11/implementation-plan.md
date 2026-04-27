# Engineering Epic 11 — Implementation Plan

Epic doc: [docs/03-engineering/epic-11-delivery-tooling-context-object.md](../../03-engineering/epic-11-delivery-tooling-context-object.md)

## Ticket Order

1. `EE11.01 Context foundation`
2. `EE11.02 Platform adapter factory and PR contract`
3. `EE11.03 Explicit formatter config`
4. `EE11.04 CLI command context wiring and handler split`
5. `EE11.05 Clean singleton removal and test isolation`
6. `EE11.06 Docs, issue tracking, and retrospective`

## Ticket Files

- `ticket-01-context-foundation.md`
- `ticket-02-platform-adapter-factory-and-pr-contract.md`
- `ticket-03-explicit-formatter-config.md`
- `ticket-04-cli-command-context-wiring-and-handler-split.md`
- `ticket-05-clean-singleton-removal-and-test-isolation.md`
- `ticket-06-docs-issue-tracking-and-retrospective.md`

## Exit Condition

`_config`, `initOrchestratorConfig`, and `getOrchestratorConfig` are gone.
Delivery runtime dependencies flow through an explicit context. Platform
adapters are created by factory. Formatters receive config explicitly. CLI
command code is split into plain command helpers without introducing a command
framework. Tests construct local config/context values instead of mutating global
module state. `bun test` is green.

## Notes

- EE11 is a zero-behavior-change architecture epic. The delivery workflow,
  command semantics, state shape, review policy behavior, branch naming, and
  handoff behavior must remain unchanged except for the internal PR creation
  return contract.
- This is a clean break. Do not preserve deprecated compatibility exports for
  `_config`, `initOrchestratorConfig`, or `getOrchestratorConfig`.
- Keep the context bounded to `config`, `invocation`, and `platform`.
- Do not introduce a dependency injection container, command bus, class
  hierarchy, plugin registry, or framework-style abstraction.
- `materializeTicketContext` stays in `ticket-flow.ts`.
- `EE11.04` is intentionally after the platform and formatter migrations so the
  command split can use the final context shape rather than guessing.
- `EE11.05` is the cleanup gate: no `_config.` or `initOrchestratorConfig(`
  usage should remain after that ticket.

## Phase Closeout

Retrospective: required

Why: EE11 changes the durable dependency boundary of the delivery tooling and
settles the follow-up architecture promised by EE10.

Trigger: architecture/process impact

Artifact: `notes/public/ee11-retrospective.md`
