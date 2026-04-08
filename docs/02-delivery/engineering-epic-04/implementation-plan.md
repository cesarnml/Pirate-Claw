# Engineering Epic 04 — Implementation Plan

Epic doc: [docs/03-engineering/epic-04-reviewer-facing-pr-body-and-thread-hygiene.md](../../03-engineering/epic-04-reviewer-facing-pr-body-and-thread-hygiene.md)

## Delivery Order

```
EE4.01 — per-finding disposition on patched bodies   [base]
EE4.02 — stale-SHA resolution sentence               [stacks on EE4.01]
EE4.03 — thread reply before resolve                 [stacks on EE4.02]
EE4.04 — PR body metadata polish                     [stacks on EE4.03]
```

## Tickets

| ID     | Title                                        | Status      |
| ------ | -------------------------------------------- | ----------- |
| EE4.01 | Per-finding disposition on patched PR bodies | not started |
| EE4.02 | Stale-SHA resolution sentence                | not started |
| EE4.03 | Thread reply before resolve                  | not started |
| EE4.04 | PR body metadata polish                      | not started |

## Notes

- All tickets touch `tools/delivery/` only — no product CLI surface changes.
- EE4.01 is the structural fix; EE4.02 adds a sentence atop the section EE4.01 rewrites — doing them in this order avoids merge noise.
- EE4.03 uses Option A (generic reply text, `databaseId` via GraphQL fetch). Reply is best-effort and never blocks thread resolution.
- EE4.04 requires owner/repo context at render time — thread it through at orchestrator call time, do not call `gh` inside the render function.
- Each ticket is a thin, reviewable stacked PR following normal delivery discipline.
