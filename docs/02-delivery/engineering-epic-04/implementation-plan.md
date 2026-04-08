# Engineering Epic 04 — Implementation Plan

Epic doc: [docs/03-engineering/epic-04-reviewer-facing-pr-body-and-thread-hygiene.md](../../03-engineering/epic-04-reviewer-facing-pr-body-and-thread-hygiene.md)

## Ticket Order

1. `EE4.01 Per-finding disposition on patched PR bodies`
2. `EE4.02 Stale-SHA resolution sentence`
3. `EE4.03 Thread reply before resolve`
4. `EE4.04 PR body metadata polish`

## Ticket Files

- `ticket-01-per-finding-disposition-on-patched-bodies.md`
- `ticket-02-stale-sha-resolution-sentence.md`
- `ticket-03-thread-reply-before-resolve.md`
- `ticket-04-pr-body-metadata-polish.md`

## Exit Condition

All four EE4 stacked slices are delivered: patched PR bodies enumerate per-finding disposition, stale-SHA notices include a data-driven resolution line when appropriate, review threads receive a short reply before resolution, and summary metadata uses GitHub permalinks where applicable. `bun run verify` and `bun run test` pass for `tools/delivery`.

## Notes

- All tickets touch `tools/delivery/` only — no product CLI surface changes.
- Implementation landed as a single cohesive change set covering EE4.01–EE4.04 (see ticket `## Rationale` sections).
- EE4.01 is the structural fix; EE4.02 adds a sentence atop the section EE4.01 rewrites — doing them in this order avoids merge noise.
- EE4.03 uses Option A (generic reply text, `databaseId` via GraphQL fetch). Reply is best-effort and never blocks thread resolution.
- EE4.04 requires owner/repo context at render time — thread it through at orchestrator call time, do not call `gh` inside the render function.
- Each ticket is a thin, reviewable stacked PR following normal delivery discipline.
