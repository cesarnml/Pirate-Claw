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

Rebuilt show detail with **shadcn** `Alert` (API error), `Card` (not-found + per-season blocks), `Table` for episode rows, and `Badge` for TMDB vote average. The back control is a ghost **`Button` → `/shows`** (aligned with the new list route). Hero backdrop uses **`hsl(var(--background) / 0.92)`** over the TMDB backdrop so the overlay tracks theme tokens. Episode stills use non-empty **`alt`** when a title exists. `shows.test.ts` assertions are unchanged (headings, E01, error/not-found).

Follow-up (AI review): backdrop **`url()`** only uses **parsed `https:`** URLs; hero poster **`loading="eager"`** + **`fetchpriority="high"`**; vote **`Badge`** uses **`aria-label`**; first table column header has **`sr-only` “Still image”**.
