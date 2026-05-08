# Engineering Epic 07 — Implementation Plan

Epic doc: [docs/engineering/epic-07-configurable-ticket-boundary-modes-for-son-of-anton.md](../../03-engineering/epic-07-configurable-ticket-boundary-modes-for-son-of-anton.md)

## Ticket Order

1. `EE7.01 Boundary policy plumbing and visibility`
2. `EE7.02 Gated boundary semantics and resume prompt`
3. `EE7.03 Cook continuation and glide fallback`
4. `EE7.04 Docs, skill guidance, and workflow examples`

## Ticket Files

- `ticket-01-boundary-policy-plumbing-and-visibility.md`
- `ticket-02-gated-boundary-semantics-and-resume-prompt.md`
- `ticket-03-cook-continuation-and-glide-fallback.md`
- `ticket-04-docs-skill-guidance-and-workflow-examples.md`

## Exit Condition

The delivery orchestrator supports explicit ticket-boundary modes
(`cook|gated|glide`), resolves the effective mode from repo config plus CLI
override, defaults this repo to `cook`, applies the correct `advance` behavior
for each mode, and ships matching docs and skill guidance for Son-of-Anton.

## Notes

- `glide` remains fallback-only in this repo for now: it is selectable and
  visible, but degrades explicitly to `gated` unless a future host/runtime
  capability signal is added.
- `EE7.01` is intentionally plumbing-first. Do not change `advance` semantics
  until the mode-selection surface and status visibility exist.
- `EE7.02` preserves EE6's key structural correction: in `gated`, `advance`
  does not create the next handoff; `start` still owns that.
- `EE7.03` restores Son-of-Anton's default continuation bias by making `cook`
  the repo default as part of the implementation, not as a later cleanup.
- `EE7.04` is a required docs-only phase-exit slice for this epic because stale
  workflow wording would immediately mislead the next orchestrated run.
