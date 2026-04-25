# Engineering Epic 10 — Implementation Plan

Epic doc: [docs/03-engineering/epic-10-delivery-tooling-module-decomposition.md](../../03-engineering/epic-10-delivery-tooling-module-decomposition.md)

## Ticket Order

1. `EE10.01 Extract types.ts`
2. `EE10.02 Extract env.ts`
3. `EE10.03 Extract runtime-config.ts`
4. `EE10.04 Extract format.ts`
5. `EE10.05 Extract platform-adapters.ts`
6. `EE10.06 Extract cli-runner.ts and shrink barrel`
7. `EE10.07 Retrospective and docs`

## Ticket Files

- `ticket-01-extract-types.md`
- `ticket-02-extract-env.md`
- `ticket-03-extract-runtime-config.md`
- `ticket-04-extract-format.md`
- `ticket-05-extract-platform-adapters.md`
- `ticket-06-extract-cli-runner-and-shrink-barrel.md`
- `ticket-07-retrospective-and-docs.md`

## Exit Condition

`orchestrator.ts` is a re-export barrel with no logic. Each extracted module owns
exactly one concern. Every source module has a corresponding test file. Deprecated
exports are removed. `bun test` is green. The module structure is ready for
template-repo extraction.

## Notes

- Every ticket is zero behavior change. `bun test` must be green before and after
  each PR.
- Tickets are strictly linear — each PR bases on the previous. No parallel work.
- `EE10.01` (types) is the foundation. All subsequent tickets depend on the
  import path it establishes.
- `EE10.05` is the largest ticket — it moves naming utilities into `planning.ts`,
  artifact helpers into `ticket-flow.ts`, and all platform adapter wrappers into
  `platform-adapters.ts`.
- `EE10.06` is the final structural ticket. It shrinks `orchestrator.ts` to a
  pure barrel, removes `recordInternalReview`, and realigns all three test files.
- `EE10.07` is docs-only. No external AI review polling — record `clean`
  immediately and advance.
- The `_config` singleton moves to `runtime-config.ts` in EE10. Context-object
  refactor and test isolation improvements are EE11 scope.
