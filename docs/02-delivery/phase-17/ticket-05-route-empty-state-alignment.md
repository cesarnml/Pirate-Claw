# P17.05 Route-Level Empty State Alignment

## Goal

Align empty-state copy and CTA behavior on the route-level surfaces that already render independent empty states: `/shows`, `/movies`, `/candidates/unmatched`, and the feeds area on `/config`.

## Scope

### Route surfaces

- [`web/src/routes/shows/+page.svelte`](../../../web/src/routes/shows/+page.svelte)
  - align the no-data copy to the Phase 17 contract
  - add CTA to the Config page TV section
- [`web/src/routes/movies/+page.svelte`](../../../web/src/routes/movies/+page.svelte)
  - align the no-data copy to the Phase 17 contract
  - add CTA to the Config page Movie section
- [`web/src/routes/candidates/unmatched/+page.svelte`](../../../web/src/routes/candidates/unmatched/+page.svelte)
  - align unmatched empty-state copy to the Phase 17 contract
- [`web/src/routes/config/+page.svelte`](../../../web/src/routes/config/+page.svelte)
  - align the feeds empty-state copy and inline add-feed CTA language with the Phase 17 product wording

### Tests

- update the existing route tests so empty-state assertions match the Phase 17 contract
- assert CTA links target the correct config destination where applicable

## Out of Scope

- onboarding route logic
- dashboard `/` empty states
- broader dashboard layout changes

## Exit Condition

The route-level pages with existing local empty states match the Phase 17 contract and point users toward the next action instead of presenting silent or inconsistent placeholders.

## Rationale

These surfaces already have isolated tests and local load/render ownership. Keeping them in one ticket makes the copy/CTA review straightforward without mixing in the home dashboard.
