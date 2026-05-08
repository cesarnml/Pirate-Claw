# P17.06 Dashboard Empty States and Onboarding Affordances

## Goal

Update the home dashboard to render explicit empty states for overview sections and surface the agreed onboarding/resume affordances on `/` and `/config`.

## Prerequisites

- P17.01 merged
- P17.04 merged

## Scope

### Dashboard empty states — `web/src/routes/+page.svelte`

- Render explicit empty states for:
  - Active Downloads
  - Recently Completed / archive grid
- Keep the event-log placeholder coherent with the Phase 17 “no data yet” tone if copy alignment is needed.
- Empty states remain simple and informational; no illustrations or major layout redesign.

### Home-page affordances — `/`

- Finalize the onboarding entry/resume CTA on the dashboard:
  - initial-empty users route into onboarding via the existing trigger behavior
  - partial-setup users see a clear “Resume onboarding” path

### Config-page affordance — `/config`

- Add a visible “Resume onboarding” affordance on `/config` so config-first users can re-enter the guided flow intentionally.
- Do not force redirect from `/config`.

### Tests

- dashboard tests cover explicit empty-state rendering for active downloads and recently completed
- home/config tests cover the presence of the onboarding/resume affordances under the correct config conditions

## Out of Scope

- onboarding write behavior itself
- route-level empty-state alignment handled in P17.05
- docs/status updates

## Exit Condition

The dashboard no longer drops empty overview sections silently, and both `/` and `/config` expose the agreed onboarding affordances without trapping users in the flow.

## Rationale

This ticket keeps the home/dashboard contract together: overview empty states and onboarding affordances both shape the operator’s first impression and belong in the same reviewable slice.
