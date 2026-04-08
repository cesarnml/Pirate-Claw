# P12.07 Config View

## Goal

Migrate [`web/src/routes/config/+page.svelte`](../../../web/src/routes/config/+page.svelte) to the design system — read-only effective config presentation (redacted secrets from API) with scrollable, readable JSON or structured layout using shadcn-svelte (e.g. card, scroll area, monospace-friendly styling).

## Scope

- Preserve [`web/src/routes/config/+page.server.ts`](../../../web/src/routes/config/+page.server.ts).
- Update [`web/src/routes/config/config.test.ts`](../../../web/src/routes/config/config.test.ts).

## Out Of Scope

- Editing config or calling write APIs (Phase 13).

## Exit Condition

Config view matches Phase 12; redaction behavior unchanged; tests pass.

## Rationale

_To be filled during implementation._
