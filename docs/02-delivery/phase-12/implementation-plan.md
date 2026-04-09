# Phase 12 Implementation Plan

Phase 12 redesigns the read-only SvelteKit dashboard around **shadcn-svelte** and a coherent theme (Stitch reference approximation), without changing the daemon HTTP API or adding write paths.

## Epic

- `Phase 12 Dashboard Design System and Read-Only UI Redesign`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Product contract

- [`docs/01-product/phase-12-dashboard-design-system-and-read-ui.md`](../../01-product/phase-12-dashboard-design-system-and-read-ui.md)

## Stack

- SvelteKit 2 + Svelte 5 + TypeScript (unchanged from Phase 10)
- Tailwind 4 + `@tailwindcss/vite`
- **shadcn-svelte** — component primitives and patterns under `web/` (exact setup is P12.01)
- `prettier-plugin-tailwindcss`
- Vitest + `@testing-library/svelte` + `@testing-library/jest-dom` — **no** Playwright or screenshot baselines in this phase
- ESLint flat config
- `adapter-node` for Docker deployment
- Bun throughout (`web/` mirrors repo-root package manager)
- Server-side `load` / `apiFetch` — `PIRATE_CLAW_API_URL` remains server-only, never exposed to the browser

## Ticket Order

1. `P12.01 Design System Foundations`
2. `P12.02 Candidates View`
3. `P12.03 Dashboard Home`
4. `P12.04 Shows List`
5. `P12.05 Show Detail`
6. `P12.06 Movies View`
7. `P12.07 Config View`
8. `P12.08 Documentation and Phase Exit`

## Ticket Files

- `ticket-01-design-system-foundations.md`
- `ticket-02-candidates-view.md`
- `ticket-03-dashboard-home.md`
- `ticket-04-shows-list.md`
- `ticket-05-show-detail.md`
- `ticket-06-movies-view.md`
- `ticket-07-config-view.md`
- `ticket-08-documentation-exit.md`

## Exit Condition

An operator can browse all read-only dashboard routes (home, candidates, shows list, show detail, movies, config) under the new design system; builds and Docker deployment for `web/` remain viable; daemon API contracts are unchanged.

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- the previous tests are green
- the behavior change is explained in the ticket rationale
- the phase-level deferrals in the product doc remain unchanged

## Explicit Deferrals

These are intentionally out of scope for Phase 12 (see product doc):

- daemon `POST` / `PUT` / `PATCH` or any mutating API routes
- Settings UI that persists `pirate-claw.config.json`
- feed or rule authoring in the browser
- authentication beyond Phase 09 read API behavior
- real-time push updates
- Playwright or automated visual regression baselines

## Stop Conditions

Pause for review if:

- a view requires an API shape change to render in the new system (should not happen — escalate to product/Phase 09 discussion)
- shadcn-svelte + Tailwind 4 integration forces a toolchain change that breaks `adapter-node` or Docker build

## Developer approval gate

**Do not begin implementation** until these ticket documents are merged to `main` and the ticket stack is explicitly approved for delivery (per `.agents/skills/grill-me/SKILL.md` phase → ticket workflow).

## Delivery status

Implementation proceeded via stacked PRs **P12.01–P12.08**; merge to `main` follows the developer closeout step when the stack is approved (`bun run closeout-stack --plan docs/02-delivery/phase-12/implementation-plan.md`).
