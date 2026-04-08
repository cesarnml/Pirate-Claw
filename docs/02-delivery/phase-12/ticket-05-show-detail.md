# P12.05 Show Detail

## Goal

Migrate [`web/src/routes/shows/[slug]/+page.svelte`](../../../web/src/routes/shows/[slug]/+page.svelte) to the design system — the largest surface: poster, overview, season/episode grids, download status, TMDB-enriched fields.

## Scope

- Preserve [`web/src/routes/shows/[slug]/+page.server.ts`](../../../web/src/routes/shows/[slug]/+page.server.ts).
- Rebuild layout with shadcn-svelte (tables, cards, scroll areas, badges) while preserving information hierarchy and accessibility (keyboard, headings).
- Update [`web/src/routes/shows/[slug]/shows.test.ts`](../../../web/src/routes/shows/[slug]/shows.test.ts).

## Out Of Scope

- Performance optimization beyond reasonable defaults.
- API changes.

## Exit Condition

Show detail page matches Phase 12; tests pass; no loss of displayed fields vs pre-migration behavior.

## Rationale

_To be filled during implementation._
