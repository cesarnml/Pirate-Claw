# EE7.01 — Boundary Policy Plumbing And Visibility

## Goal

Add explicit boundary-mode selection and visibility to the orchestrator without
changing current ticket-boundary behavior yet.

## Current Behavior

The orchestrator assumes one ticket-boundary policy:

- `advance` always emits the EE6 compaction stop contract
- there is no repo config field for boundary mode
- there is no CLI override for boundary mode
- `status` does not show which boundary policy is active

This makes EE7 behavior changes hard to stage safely because there is no stable
policy surface to hang them on first.

## Target Behavior

Add a resolved boundary-policy surface with these properties:

- supported values: `cook`, `gated`, `glide`
- repo config field: `ticketBoundaryMode`
- CLI override: `--boundary-mode <mode>`
- default unresolved mode: `cook`
- `status` renders the effective boundary mode for the run
- command output can reference the effective mode where relevant

Behavioral constraint for this ticket:

- keep current `advance`/`start` behavior unchanged aside from reading,
  carrying, and rendering the resolved mode

## Change Surface

- `tools/delivery/config.ts`
- `tools/delivery/cli.ts`
- `tools/delivery/orchestrator.ts`
- `tools/delivery/orchestrator.test.ts`
- `orchestrator.config.json`

## Acceptance Criteria

- [ ] `orchestrator.config.json` accepts `ticketBoundaryMode`
- [ ] invalid boundary-mode values are rejected with a clear error
- [ ] `--boundary-mode` overrides repo config for a single run
- [ ] `status` shows the effective boundary mode
- [ ] existing `advance` behavior is unchanged in this ticket
- [ ] existing non-boundary commands keep working without regression

## Rationale

Boundary mode is resolved at run start from repo config plus an optional CLI
override, then surfaced through the existing `_config` path instead of being
persisted into delivery state. That keeps EE7.01 plumbing-only: status and
current-ticket output can report the effective mode for the active run without
changing stored ticket state or boundary semantics yet.

## Notes

- Keep this slice plumbing-first. Do not mix in `advance` semantic changes here.
- If tests need fixture config updates, keep them minimal and local to
  orchestrator config coverage.
