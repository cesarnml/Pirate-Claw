# EE7.02 — Gated Boundary Semantics And Resume Prompt

## Goal

Turn the current EE6 stop behavior into the final `gated` contract: hard stop,
operator reset guidance, and a canonical next-session resume prompt.

## Current Behavior

Today `advance` marks the current ticket done and prints:

- `compaction_required=true`
- a compaction-only directive
- a bare `bun run deliver --plan ... start` continuation instruction

This has two problems:

- the output prescribes `/compact` even when `/clear` is the better choice for a
  true gated boundary
- the continuation instruction is operator-oriented, not a ready-to-paste agent
  resume prompt

## Target Behavior

When the effective mode is `gated`:

- `advance` marks the current ticket done and stops
- `advance` does not create the next handoff or worktree
- output includes a short operator-facing reset note:
  - prefer `/clear` for minimum token usage
  - use `/compact` only when intentionally preserving compressed carry-forward
    context
- output includes the canonical agent-facing resume prompt:

`Immediately execute \`bun run deliver --plan <plan> start\`, read the generated handoff artifact as the source of truth for context, and implement <next-ticket-id>.`

The prompt must resolve the actual plan path and next pending ticket ID from
state; the operator should not have to compose it manually.

## Change Surface

- `tools/delivery/orchestrator.ts`
- `tools/delivery/ticket-flow.ts` only if needed to protect handoff-creation
  ownership
- `tools/delivery/orchestrator.test.ts`

## Acceptance Criteria

- [ ] `gated` `advance` emits reset guidance instead of compaction-only wording
- [ ] `gated` `advance` emits the canonical resume prompt with the resolved plan
      path and next ticket ID
- [ ] `gated` `advance` does not create the next handoff or worktree
- [ ] `start` remains the command that creates the next handoff in gated flow
- [ ] existing done-state transitions and notifications still work

## Rationale

The gated reset text now lives in `formatAdvanceBoundaryGuidance(state,
nextState)` and is only emitted when the effective mode is `gated`. That keeps
EE7.02 focused on the operator/agent output contract while preserving EE6's
existing `advanceToNextTicket` behavior and `start`-owned handoff creation for
the next slice.

## Notes

- Preserve EE6's key separation: no next handoff creation during `advance` in
  gated mode.
- This ticket changes only the gated path. Do not restore automatic
  continuation here.
