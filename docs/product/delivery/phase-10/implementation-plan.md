# Phase 10 Implementation Plan

Phase 10 adds a SvelteKit read-only dashboard that consumes the daemon HTTP API, giving the operator browser-based visibility into Pirate Claw state.

## Epic

- `Phase 10 Read-Only SvelteKit Dashboard`

Follow the shared guidance in [`docs/product/delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Stack

- SvelteKit 2 + Svelte 5 + TypeScript
- Tailwind 4 + `@tailwindcss/vite`
- `prettier-plugin-tailwindcss`
- Vitest + `@testing-library/svelte` + `@testing-library/jest-dom`
- ESLint flat config (what `bun create svelte` scaffolds: `eslint-plugin-svelte`, `@typescript-eslint`, `globals`)
- `adapter-node` for Docker deployment
- Bun throughout (`web/` uses bun, mirrors repo-root package manager)
- Server-side `load` functions — `PIRATE_CLAW_API_URL` is a server-only env var, never exposed to the browser

## Ticket Order

1. `P10.01 Scaffold: SvelteKit App, Tooling, Nav Shell, Dockerfile`
2. `P10.02 Candidates List View`
3. `P10.03 Show Detail View`
4. `P10.04 Config View`
5. `P10.05 Dashboard Home`

## Ticket Files

- `ticket-01-scaffold.md`
- `ticket-02-candidates-list.md`
- `ticket-03-show-detail.md`
- `ticket-04-config-view.md`
- `ticket-05-dashboard-home.md`

## Exit Condition

An operator can open the dashboard in a browser, navigate between the home, candidates, show detail, and config views, and see the same data the CLI and API surface. The SvelteKit app builds and runs in a Docker container deployable alongside the existing daemon container on the NAS.

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- the previous tests are green
- the behavior change is explained in the ticket rationale
- the phase-level deferrals remain unchanged

## Explicit Deferrals

These are intentionally out of scope for Phase 10:

- config editing through the UI
- TMDB metadata, posters, or ratings display
- visually rich styling, animations, or theming
- authentication or access control
- real-time push updates (polling on page load is sufficient)
- mobile-specific responsive design beyond basic readability
- Docker Compose orchestration of daemon + web (operator wires the two containers manually)
- CORS configuration on the daemon (private NAS network)
- pagination or filtering query parameters

## Stop Conditions

Pause for review if:

- the Phase 09 API response shapes need changes to satisfy a view's data requirements
- `adapter-node` build behavior differs materially from `adapter-static` in a way that affects the Dockerfile
- Tailwind 4 + `@tailwindcss/vite` integration requires config changes beyond the documented Vite plugin setup
