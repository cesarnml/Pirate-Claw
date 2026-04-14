# P17.07 Docs and Phase Exit

## Goal

Update the onboarding/runbook docs, mark Phase 17 delivered across status docs, and close the delivery directory with a phase-exit checklist.

## Scope

### Product docs

- [`docs/01-product/phase-17-onboarding-and-empty-state.md`](../../01-product/phase-17-onboarding-and-empty-state.md)
  - update delivery status from product-definition-only to delivered, with pointer to `docs/02-delivery/phase-17/`
- relevant install/runbook docs
  - document the starter-config copy step clearly as the first-run prerequisite before the daemon starts
  - point operators to the browser onboarding flow after daemon startup

### Status docs

- [`docs/00-overview/start-here.md`](../../00-overview/start-here.md)
  - mark Phase 17 delivered and advance the current planning pointer
- [`docs/00-overview/roadmap.md`](../../00-overview/roadmap.md)
  - update Phase 17 delivery status and notes
- [`docs/README.md`](../../README.md)
  - list the new Phase 17 delivery artifacts
- [`docs/02-delivery/phase-17/implementation-plan.md`](./implementation-plan.md)
  - update delivery status to delivered

### Phase exit verification checklist

- [x] onboarding route exists and honors strict initial-empty auto-trigger only
- [x] dismissal suppression and explicit resume behavior implemented
- [x] write-disabled onboarding blocked state implemented
- [x] first feed save works via existing feeds write path
- [x] TV target onboarding appends without clobbering existing shows
- [x] movie target onboarding preserves existing movie policy when present
- [x] Done step enforces the minimum completion gate and renders a summary
- [x] route-level empty states aligned (`/shows`, `/movies`, `/candidates/unmatched`, `/config`)
- [x] dashboard empty states and `/` + `/config` onboarding affordances aligned
- [x] onboarding fixture snapshots committed and referenced by dependent tests

## Out of Scope

- any new product behavior

## Exit Condition

Docs are updated, phase status is marked delivered, and the Phase 17 closeout checklist confirms the shipped onboarding and empty-state behavior.

## Rationale

Phase 17 changes both product behavior and first-run/operator guidance. A dedicated docs-and-exit slice keeps status bookkeeping and user-facing documentation out of the feature tickets and matches the repo’s established phase-closeout pattern.
