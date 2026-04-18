# Phase 20 Implementation Plan

**Status:** Not started — ticket decomposition approved; ready for orchestrator.

Phase 20 makes the dashboard a functional proxy for the Transmission client. It introduces torrent lifecycle actions (pause, resume, remove, remove+delete, missing resolution) via a right-click context menu, wires the Queue button for manual candidate requeue, and performs a clean data model break — replacing the redundant `CandidateLifecycleStatus` field with a derived state pattern and a new `pirateClawDisposition` terminal field.

**Product contract:** [`docs/01-product/phase-20-dashboard-torrent-actions.md`](../../01-product/phase-20-dashboard-torrent-actions.md)

## Epic

- `Phase 20 — Dashboard Torrent Actions`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Decomposition Decisions (grill-me)

| Decision                          | Choice                                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Data model clean break scope      | One ticket — backend type changes, startup migration, reconciler guard, and frontend derived function are one atomic concern |
| `torrentDisplayState()` placement | Same ticket as data model clean break — build breaks if backend lands without frontend                                       |
| Service functions vs endpoints    | Same ticket per action group — shipping RPC functions without endpoints is dead code                                         |
| Pause/resume vs remove            | Split — remove writes terminal `pirateClawDisposition`; different risk profile                                               |
| Dispose (missing resolution)      | Own ticket — conceptually distinct from remove; no RPC call, just DB write                                                   |
| Context menu UI timing            | One ticket after all endpoints exist — avoids shipping a partial menu twice                                                  |
| Queue button                      | Independent ticket — no context menu dependency; can run in parallel with P20.02–P20.05                                      |
| Requeue response contract         | Inline in ticket spec (`{ ok: true; torrentHash; torrentId }` / `{ ok: false; error }`); no fixture file needed              |

## Ticket Sequence

```
P20.01 (data model)
  └── P20.02 (pause/resume)
        └── P20.03 (remove/remove+delete)
              └── P20.04 (dispose)
                    └── P20.05 (context menu UI)
                          └── P20.07 (exit verification)

P20.06 (queue button) — independent, parallel
```

## Tickets

| #      | Title                           | Dependency     |
| ------ | ------------------------------- | -------------- |
| P20.01 | Data model clean break          | none           |
| P20.02 | Pause / Resume                  | P20.01         |
| P20.03 | Remove / Remove + Delete        | P20.02         |
| P20.04 | Dispose (missing resolution)    | P20.03         |
| P20.05 | Context menu UI                 | P20.04         |
| P20.06 | Queue button (FeedEventLogCard) | P20.01         |
| P20.07 | Docs + exit verification        | P20.05, P20.06 |

## Ticket Order

1. `P20.01 Data model clean break`
2. `P20.02 Pause / Resume`
3. `P20.03 Remove / Remove + Delete`
4. `P20.04 Dispose (missing resolution)`
5. `P20.05 Context menu UI`
6. `P20.06 Queue button (FeedEventLogCard)`
7. `P20.07 Docs + exit verification`

## Ticket Files

- `ticket-01-data-model-clean-break.md`
- `ticket-02-pause-resume.md`
- `ticket-03-remove.md`
- `ticket-04-dispose.md`
- `ticket-05-context-menu.md`
- `ticket-06-queue-button.md`
- `ticket-07-exit-verification.md`

## Exit Condition

All checks in P20.07 pass:

- `grep -r "lifecycleStatus\|CandidateLifecycleStatus" src/ web/src/` returns zero matches
- All six action endpoints smoke-test clean
- UI context menu and Queue button verified in browser
- `bun run typecheck` passes
- Phase 20 retrospective written in product doc

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

1. The current ticket's PR is merged to `main`
2. The merged commit is green on CI (or typecheck passes locally if CI is not configured)

P20.06 is independent of P20.02–P20.05 and may be developed in parallel, but must be merged before P20.07 begins.
