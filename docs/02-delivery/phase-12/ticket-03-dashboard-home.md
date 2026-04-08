# P12.03 Dashboard Home

## Goal

Migrate [`web/src/routes/+page.svelte`](../../../web/src/routes/+page.svelte) to the design system — daemon health, recent runs, summary stats, and links (including to Movies) using cards, typography, and spacing from P12.01.

## Scope

- Preserve [`web/src/routes/+page.server.ts`](../../../web/src/routes/+page.server.ts) data loading.
- Restructure the dashboard using shadcn-svelte components (cards, lists, alerts for errors) for a consistent look with P12.02.
- Update [`web/src/routes/dashboard.test.ts`](../../../web/src/routes/dashboard.test.ts) for any changed markup while preserving behavioral coverage.

## Out Of Scope

- New metrics or API fields not already provided by existing loads.

## Exit Condition

Home page renders correctly with API data and error paths; dashboard tests pass.

## Rationale

_To be filled during implementation._
