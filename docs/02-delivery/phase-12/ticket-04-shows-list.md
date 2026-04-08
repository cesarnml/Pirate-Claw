# P12.04 Shows List

## Goal

Migrate [`web/src/routes/shows/+page.svelte`](../../../web/src/routes/shows/+page.svelte) to the design system — list or grid of shows with posters/metadata as appropriate, consistent with Phase 11 TMDB display.

## Scope

- Preserve server load in `+page.server.ts` if present; do not change API usage.
- Apply shadcn-svelte layout components (cards, grid, typography) and align empty/error states with P12.02/P12.03.
- Add or extend route tests if there is no dedicated shows list test file — minimum smoke coverage for render with mock data (follow patterns from `candidates.test.ts`).

## Out Of Scope

- Show detail page (P12.05).

## Exit Condition

Shows list page is visually aligned with Phase 12; navigation to `/shows/[slug]` works; tests cover primary render path.

## Rationale

_To be filled during implementation — note any new test file path._
