# E3.06 Command Handler Rewire And Final Orchestrator Slim-Down

Finish the modularization by turning the orchestrator file into a composition shell.

## Deliverable

- rewire top-level command handling to compose extracted modules
- keep `runDeliveryOrchestrator(argv, cwd)` as the stable facade
- slim `tools/delivery/orchestrator.ts` down to a thin composition shell

## Acceptance

- the public facade and `scripts/deliver.ts` entrypoint remain intact
- the orchestrator file no longer owns every concern directly
- current commands, storage roots, and user-visible delivery behavior remain unchanged

## Explicit Deferrals

- no new commands
- no redesign of `stacked-closeout`
- no workflow-semantic expansion
