# P12.02 Candidates View

## Goal

Migrate [`web/src/routes/candidates/+page.svelte`](../../../web/src/routes/candidates/+page.svelte) to the Phase 12 design system — table, filters, badges, and dense data layout using shadcn-svelte patterns established in P12.01.

## Scope

- Preserve [`web/src/routes/candidates/+page.server.ts`](../../../web/src/routes/candidates/+page.server.ts) behavior and types (no API contract changes).
- Replace ad hoc Tailwind markup with shared components (table, input/select for filters, badges for status/media type, etc.) consistent with the shell.
- Keep existing behaviors: client-side sort, TV title links to `/shows/[slug]`, empty and error states.
- Update [`web/src/routes/candidates/candidates.test.ts`](../../../web/src/routes/candidates/candidates.test.ts) for new DOM structure; keep the same behavioral assertions (columns, sort, empty, error).

## Out Of Scope

- Changing `GET /api/candidates` or response shapes.
- Show detail or movies-specific layout (other tickets).

## Exit Condition

Candidates page matches Phase 12 visually and passes existing test intent; no regression in load or link behavior.

## Rationale

_To be filled during implementation — note reusable primitives introduced for later tickets._
