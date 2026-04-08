# Phase 12 Dashboard Design System and Read-Only UI Redesign

**Delivery status:** Not started — product definition only; no `docs/02-delivery/phase-12/` implementation plan until tickets are approved.

Phase 12 replaces the Phase 10 “functional styling only” dashboard with a cohesive UI built on **shadcn-svelte**, themed to approximate the Stitch design reference, while remaining **read-only** against the existing daemon HTTP API (Phase 09). There is no runtime dependency on Stitch or any MCP tool — design tokens and components live in the repo and CI builds the `web/` app without external design tooling.

## Phase Goal

Phase 12 should leave Pirate Claw in a state where:

- the SvelteKit dashboard uses shared layout, navigation, typography, and component primitives (shadcn-svelte patterns) across all read-only views
- existing daemon API contracts are unchanged — all data still flows server-side via `PIRATE_CLAW_API_URL` (no browser-direct daemon access beyond what Phase 10 already established)
- the operator experience is visually consistent, accessible, and reasonably responsive across common screen sizes
- the `web/` Docker deployment story remains viable for NAS-style deployment

## Product Goals For This Phase

- align the dashboard with a maintainable component system (shadcn-svelte) so future features (Settings writes, richer forms) do not re-litigate layout and tokens
- validate that TMDB-enriched views (Phase 11) render correctly inside the new shell without API changes
- keep review scope bounded: **no** daemon write endpoints and **no** persistent Settings forms in this phase

## Committed Scope

- adopt shadcn-svelte (and required tooling) in `web/` with a coherent theme aligned to the Stitch reference (approximation, not pixel-perfect parity)
- migrate existing routes to the new system:
  - dashboard home
  - candidates list
  - show detail
  - movies
  - **read-only** effective config presentation (same redaction rules as today via the API)
- preserve server-side data loading patterns (`+page.server.ts` / load functions); do not expose daemon URLs or secrets to the client
- establish baseline **accessibility** (keyboard operability, semantic structure, sufficient contrast) and **responsive** behavior for primary flows
- document any new build-time or runtime environment variables only if strictly required for this phase

## Exit Condition

An operator can run the dashboard end-to-end on a trusted LAN, browse all current read-only views under the new design system, and build and run the `web/` app (including containerized deployment as documented). No new daemon endpoints are required for this phase to be complete.

## Explicit Deferrals

These are intentionally outside Phase 12:

- `POST` / `PUT` / `PATCH` (or any mutating) daemon API routes
- Settings UI that persists changes to `pirate-claw.config.json`
- feed or rule authoring in the browser
- authentication beyond what already exists (read API remains as documented for Phase 09)
- real-time push updates (page-load or navigation-driven refresh remains sufficient)

## Rationale

Phase 10 deliberately deferred visual polish so the API and data path could be validated first. Phase 11 added metadata richness. Phase 12 closes the gap on **operator-facing quality** without coupling it to file writes, validation, or security decisions that belong in Phase 13. Keeping mutations out preserves a clean review boundary: this phase is design and read-path parity only.
