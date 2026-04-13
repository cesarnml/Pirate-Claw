# EE7.04 — Docs, Skill Guidance, And Workflow Examples

## Goal

Bring delivery docs and Son-of-Anton guidance into exact alignment with the
shipped EE7 boundary-mode behavior.

## Current Behavior

Repo docs and skill guidance still describe the EE6 world:

- every `advance` implies compaction before `start`
- Son-of-Anton guidance assumes one universal boundary policy
- examples do not distinguish `cook`, `gated`, and `glide`

If left unchanged after EE7 code lands, the next orchestrated run will be
guided by stale workflow doctrine.

## Target Behavior

Update the docs so they describe the shipped policy model exactly:

- `cook` is the repo-default uninterrupted continuation path
- `gated` is the hard-reset path optimized for token minimization
- `glide` is capability-dependent and currently fallback-only in this repo
- `gated` examples use the canonical resume prompt from EE7.02
- no doc still claims that every `advance` requires `/compact`

## Change Surface

- `docs/03-engineering/delivery-orchestrator.md`
- `.agents/skills/son-of-anton-ethos/SKILL.md`
- `docs/00-overview/start-here.md` only if the workflow summary there needs the
  new default called out
- any related test snapshots or rendered usage text touched by the wording

## Acceptance Criteria

- [ ] delivery-orchestrator docs describe all three modes accurately
- [ ] Son-of-Anton skill guidance matches the new default and stop/continue
      contracts
- [ ] all examples are mode-aware
- [ ] `gated` examples use the canonical resume prompt
- [ ] no stale EE6-only compaction language remains in the updated guidance

## Rationale

The main documentation risk after EE7 was stale EE6 language that still treated
every `advance` as a compaction stop. The updated guidance now makes boundary
policy mode-specific: `cook` continues automatically, `gated` stops with reset
guidance and the canonical resume prompt, and `glide` is documented as an
explicit fallback to `gated` in this repo.

This ticket also corrects the operator guide's config example so it matches the
actual shipped orchestrator fields instead of documenting forward-looking review
policy settings that are not implemented yet.

## Notes

- Keep this as a docs-only cleanup slice. Do not mix further orchestrator
  behavior changes into it.
- This ticket closes the epic because stale workflow docs here would be a
  near-immediate operator hazard.
