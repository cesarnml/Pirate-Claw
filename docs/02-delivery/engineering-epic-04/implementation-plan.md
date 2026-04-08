# Engineering Epic 04 — Implementation Plan

Epic doc: [docs/03-engineering/epic-04-reviewer-facing-pr-body-and-thread-hygiene.md](../../03-engineering/epic-04-reviewer-facing-pr-body-and-thread-hygiene.md)

## Delivery Order

```
EE4.01 — stale-SHA resolution sentence           [standalone or base for EE4.02]
EE4.02 — per-finding disposition on patched bodies  [stacks on EE4.01]
EE4.03 — thread reply before resolve               [stacks on EE4.02]
```

## Tickets

| ID     | Title                                        | Status      |
| ------ | -------------------------------------------- | ----------- |
| EE4.01 | Stale-SHA resolution sentence                | not started |
| EE4.02 | Per-finding disposition on patched PR bodies | not started |
| EE4.03 | Thread reply before resolve                  | not started |

## Notes

- All three tickets touch `tools/delivery/` only — no product CLI surface changes.
- EE4.03 has a prerequisite: if `databaseId` is not in the `AiReviewComment` schema, it must be added as part of that ticket before the reply endpoint can be called.
- Each ticket is a thin, reviewable stacked PR following normal delivery discipline.
