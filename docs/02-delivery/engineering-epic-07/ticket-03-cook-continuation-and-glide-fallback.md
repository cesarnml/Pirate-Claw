# EE7.03 — Cook Continuation And Glide Fallback

## Goal

Restore uninterrupted continuation for `cook` mode and add explicit fallback
behavior for `glide`.

## Current Behavior

The orchestrator behaves as if every run were gated:

- `advance` stops at the ticket boundary
- continuation requires a separate `start`
- there is no explicit runtime distinction between a real gated choice and a
  continuation-first mode

This means Son-of-Anton no longer defaults to its original continuation bias.

## Target Behavior

When the effective mode is `cook`:

- `advance` marks the current ticket done
- it immediately initializes the next pending ticket
- it creates the next worktree/branch/handoff automatically
- it prints continuation output that points at the generated handoff

When the effective mode is `glide`:

- this repo treats `glide` as selectable but unsupported for full continuation
- `advance` falls back explicitly to `gated`
- output states that `glide` was requested and `gated` behavior was applied

Repo default requirement:

- this ticket makes the repo's active default `ticketBoundaryMode` equal
  `cook`

## Change Surface

- `orchestrator.config.json`
- `tools/delivery/orchestrator.ts`
- `tools/delivery/ticket-flow.ts`
- `tools/delivery/orchestrator.test.ts`

## Acceptance Criteria

- [ ] `cook` `advance` auto-starts the next pending ticket
- [ ] `cook` generates the next handoff through shared ticket-start logic rather
      than duplicating unsafe start behavior
- [ ] `cook` output surfaces the next handoff path clearly
- [ ] `glide` falls back explicitly to `gated`
- [ ] `glide` never silently behaves like `cook`
- [ ] repo default boundary mode is `cook`

## Rationale

`cook` continuation now composes the existing advance and start paths instead of
reimplementing ticket-start mechanics inside `advance`. That keeps handoff
generation, worktree bootstrap, branch setup, and local environment copying
aligned with the existing `start` contract.

`glide` remains selectable but resolves explicitly to `gated` in repo-local
code. That preserves the third operator-facing mode without pretending the
orchestrator can perform host-runtime context resets it does not control.

The repo now carries an explicit root `orchestrator.config.json` with
`ticketBoundaryMode: "cook"` so Son-of-Anton's continuation bias is a visible
default instead of an implicit assumption.

## Notes

- Do not invent host-runtime self-reset plumbing here. `glide` is fallback-only
  in EE7.
- Keep `cook` implementation aligned with existing `start` logic so handoff,
  worktree bootstrap, and `.env` copy behavior stay consistent.
