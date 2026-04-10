# P14.06 Docs and Phase Exit

## Goal

Close the Phase 14 operator and delivery documentation loop after all write endpoints and UI sections land.

## Scope

- Update `README.md`:
  - confirm `PUT /api/config/feeds`, `PUT /api/config/tv/defaults`, `PUT /api/config/movies` are listed in the API endpoint table with correct descriptions (remove the `Phase 14` annotation from the planned entries)
  - update the Current Scope section to reflect that feed and target management are now available from the dashboard
- Update [`docs/00-overview/start-here.md`](../../00-overview/start-here.md):
  - move Phase 14 from the "Still deferred" list into the delivered surface description
  - update "Last verified" date
- Update [`docs/00-overview/roadmap.md`](../../00-overview/roadmap.md):
  - update Phase 14 current status from "product definition only" to "implemented on `main`"
  - update Current Planning Posture to reflect phases 01–14 complete
- Ensure all Phase 14 ticket docs (`P14.01`–`P14.05`) have non-empty `## Rationale` sections reflecting actual implementation choices before this ticket is opened as a PR

## Out Of Scope

- New product-surface features.
- Any additional API or UI capability beyond what landed in P14.01–P14.05.

## Exit Condition

Operator-facing and phase-status docs accurately reflect shipped Phase 14 behavior. All Phase 14 ticket rationale sections are documentation-complete.

## Rationale

_To be filled in after implementation._
