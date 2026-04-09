# P12.06 Movies View

## Goal

Migrate [`web/src/routes/movies/+page.svelte`](../../../web/src/routes/movies/+page.svelte) to the design system — movie cards/list, posters, ratings, overviews, empty and error states aligned with other routes.

## Scope

- Preserve [`web/src/routes/movies/+page.server.ts`](../../../web/src/routes/movies/+page.server.ts).
- Add colocated tests if missing (e.g. `movies.test.ts` next to the route) using the same patterns as candidates/shows; otherwise extend existing tests.
- Ensure empty/error messaging matches tone and component patterns from P12.02–P12.05.

## Out Of Scope

- `GET /api/movies` contract changes.

## Exit Condition

Movies page is visually consistent with Phase 12; primary render and error paths tested.

## Rationale

Migrated the movies route to **shadcn** `Card` rows (poster + metadata), `Badge` with **`aria-label`** for TMDB rating, and the shared **destructive `Alert`** pattern for API errors. Metadata uses token-aligned `text-foreground` / `text-muted-foreground` instead of raw grays.

Tests: **`web/src/routes/movies/movies.test.ts`** (happy path, empty, error).
