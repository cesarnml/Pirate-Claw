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

## Rationale

The final extraction moved the remaining top-level orchestration seams out of `tools/delivery/orchestrator.ts` without changing the public `runDeliveryOrchestrator(argv, cwd)` facade.

- `tools/delivery/cli.ts` now owns argv parsing, usage rendering, and plan-path resolution for command execution.
- `tools/delivery/notifications.ts` now owns notifier resolution, milestone-event mapping, review-window messaging, and best-effort Telegram delivery.
- `tools/delivery/ticket-flow.ts` now owns ticket progression, handoff rendering, PR-opening orchestration, and restack/advance flow mechanics.

The orchestrator remains the stable facade and runtime composition shell, but no longer directly owns every command concern. User-visible commands, storage roots, PR semantics, and review behavior were intentionally preserved.
