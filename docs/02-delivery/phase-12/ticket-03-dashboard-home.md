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

Migrated the home dashboard to **shadcn-svelte** `Card` sections for daemon metadata and recent runs, `Table` for the run list (matching the candidates page pattern), and `Alert` + `AlertDescription` for the API error path. Quick links use `Button` with `href` (outline) for consistent focus and hit targets. Section titles remain semantic `h2` elements so existing Vitest queries for `heading` roles stay valid. Added an assertion for the **Movies** quick link to match the ticket’s “including to Movies” requirement.

Follow-up (AI review): `Alert` root now maps `role` to **`alert`** for the destructive variant and **`status`** for the default variant, with an optional `role` override. The error state includes **`AlertTitle`** (“API unavailable”) plus description. The “Loading…” branch documents that it is defensive relative to current `load` behavior.
