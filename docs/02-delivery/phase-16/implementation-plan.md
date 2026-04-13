# Phase 16 Implementation Plan

Phase 16 completes the config-editing UX. Phases 13 and 14 built the write infrastructure and put all four save actions on the existing `/config` route. Phase 16 refines that page into the coherent, toast-driven, collapsible-card layout the PRD describes — plus the two missing API endpoints (`POST /api/daemon/restart` and `POST /api/transmission/ping`) and a one-field API extension that unblocks the TV defaults card.

## Epic

`Phase 16 Config Editing, Hot Reload, and Daemon Controls`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Product contract

[`docs/01-product/phase-16-config-editing-hot-reload-and-daemon-controls.md`](../../01-product/phase-16-config-editing-hot-reload-and-daemon-controls.md)

## Grill-Me decisions locked for this phase

- **Framing:** P14 already built the unified `/config` route with all four save actions. Phase 16 tickets enhance/refactor the existing cards — nothing to "port" or migrate from a separate page.
- **tvDefaults API gap:** `GET /api/config` does not expose the global TV defaults object. P16.01 adds `tvDefaults: { resolutions: string[]; codecs: string[] }` to `AppConfig` and surfaces it in the `GET /api/config` response. This is the minimal extension needed to pre-populate the TV Configuration card. `fixtures/api/config-with-tv-defaults.json` is updated in P16.01.
- **Transmission ping:** `POST /api/transmission/ping` does not exist. P16.01 adds it alongside `POST /api/daemon/restart`.
- **Runtime/TV shows split:** The existing `saveSettings` action handles both TV show names and runtime interval fields in a single PUT. P16.07 splits this into `saveShows` (PUT to `/api/config`, `tv.shows` only) and `saveRuntime` (PUT to `/api/config`, `runtime` only). Runtime stays as an implicit fifth card — the PRD's "four card" count describes the new cards; Runtime was already present from P13 and is not removed.
- **Toast ordering:** The toast utility (P16.02) is built before any card refinement ticket (P16.03–P16.07). Cards are not refactored to use toasts until the utility exists. Implementing cards before the toast system creates rework.
- **Collapsible cards:** Shadcn/UI Accordion component is available. P16.08 wraps each card in an Accordion item.
- **Daemon restart reconnect:** After `POST /api/daemon/restart`, the UI shows "Restarting… the page may become temporarily unavailable" and lets the operator reload manually. No reconnect polling — simple and honest for a NAS tool.
- **Daemon restart auth:** Bearer-only gate is correct and intentional. The UI's "only offered after save" constraint is the right guardrail; no additional API-level confirmation needed.

## Stack

- Bun + TypeScript daemon/API in `src/`
- SvelteKit 2 + Svelte 5 + TypeScript in `web/`
- Shadcn/UI component library in `web/src/lib/components/ui/`
- Existing config write infrastructure in `src/api.ts`
- Existing `/config` route in `web/src/routes/config/`

## Ticket Order

1. `P16.01 API Additions` — daemon restart, transmission ping, tvDefaults in GET /api/config
2. `P16.02 Toast Utility and Save Feedback` — shared toast helper, 409 reload toast, restart-offer logic
3. `P16.03 Transmission Card` — session display, status dot, Test Connection button
4. `P16.04 RSS Feeds Card` — toast integration, inline URL error refinement
5. `P16.05 TV Configuration Card` — fix tvDefaults pre-population bug, toast integration
6. `P16.06 Movie Policy Card` — toast integration
7. `P16.07 Runtime and TV Shows Split` — separate saveSettings into saveShows + saveRuntime
8. `P16.08 Collapsible Cards and Read-Only Audit` — Accordion wrapping, read-only verification
9. `P16.09 Docs and Phase Exit`

## Ticket Files

- `ticket-01-api-additions.md`
- `ticket-02-toast-utility.md`
- `ticket-03-transmission-card.md`
- `ticket-04-feeds-card.md`
- `ticket-05-tv-configuration-card.md`
- `ticket-06-movie-policy-card.md`
- `ticket-07-runtime-tv-shows-split.md`
- `ticket-08-collapsible-cards-readonly.md`
- `ticket-09-docs-and-phase-exit.md`

## Exit Condition

An operator can change any supported config field — feeds, TV targets, movie policy, runtime settings — from the browser, see transient toast feedback per section, restart the daemon in-context after a save, and verify Transmission connectivity — without opening a terminal.

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- tests/checks for the current ticket are green
- ticket rationale is updated for behavior/tradeoff changes
- any fixture updates committed in P16.01 are visible to dependent UI tickets before they begin

## Explicit Deferrals

- hot reload of daemon polling intervals without restart
- standalone daemon restart button not tied to a save action
- raw config JSON editor
- Transmission credential editing in the UI
- additional writable config fields beyond Phase 13/14 surface
- reconnect polling / auto-reload after daemon restart

## Stop Conditions

Pause for review if:

- implementing `POST /api/daemon/restart` requires changes to how the supervisor or process lifecycle is managed beyond `process.kill(process.pid, 'SIGTERM')`
- the toast utility requires a third-party library not already in the project
- the Accordion wrapping introduces layout regressions in any existing card

## Developer approval gate

**Do not begin implementation** until this implementation plan and all Phase 16 ticket docs are merged to `main` and explicitly approved for delivery.

## Delivery status

Delivered on `main` via `P16.01`-`P16.09`.
