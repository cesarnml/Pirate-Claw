# Phase 16: Config Editing, Hot Reload, and Daemon Controls

**Delivery status:** Delivered — see `docs/02-delivery/phase-16/`.

## TL;DR

**Goal:** Unify all writable config sections into a single Config page with inline validation, toast feedback, and in-context daemon restart — eliminating the SSH → edit JSON → restart workflow.

**Ships:** Single `/config` route with four section cards (Transmission display, RSS Feeds, TV Configuration, Movie Policy); inline field validation; success/error toasts with restart offer; `POST /api/daemon/restart`; disabled controls with tooltips in read-only mode.

**Defers:** Hot reload of polling intervals without restart; standalone daemon restart button; raw JSON config editor; Transmission credential editing in UI; new writable fields beyond Phase 13/14 surface.

---

Phase 16 is the UX integration phase for config editing. Phases 13 and 14 delivered individual write endpoints per config section. Phase 16 unifies them into a coherent Config page with inline validation, toast feedback, and a post-save daemon restart offer — eliminating the SSH-into-NAS-and-edit-JSON-then-restart workflow entirely.

## Phase Goal

Phase 16 should leave Pirate Claw in a state where:

- all writable config sections (runtime, feeds, TV defaults, TV shows, movie policy) are editable from a single Config page without leaving the browser
- config saves give immediate feedback: success toast with a restart offer, or inline error showing which field failed validation
- operators understand at a glance whether config changes require a daemon restart
- the daemon restart is offered in-context after a save, not as a standalone button that could be triggered accidentally
- read-only mode when write token is absent is communicated through disabled controls with tooltips — no banners

## Committed Scope

### Daemon and API

**`POST /api/daemon/restart`**

- calls `process.kill(process.pid, 'SIGTERM')` and trusts the NAS supervisor (Synology Task Scheduler or systemd) to restart the process
- only offered as a follow-on action immediately after a successful config save in the SvelteKit Settings flow — not a standalone endpoint callable from the UI at any time
- documented requirement: the daemon must be run under a supervisor that auto-restarts on exit; the runbook (`docs/01-product/phase-06-synology-runbook.md`) is updated with this requirement

**Hot reload scope (API-layer only)**

- config changes from any of the Phase 13/14 write endpoints already take effect immediately for API reads via the `configHolder.current` pattern — this is already implemented
- polling intervals (`runIntervalMinutes`, `reconcileIntervalMinutes`) are read once at daemon startup and held in `setInterval` timers; changing them requires a daemon restart
- the UI makes this explicit: after saving runtime interval fields, the success toast reads "Saved — restart the daemon for interval changes to take effect"
- no changes to `daemon.ts` interval handling in Phase 16

### Web (`web/`)

**Config page — unified layout**

- single `/config` route with four collapsible section cards matching the Phase 14 API surface:
  - **Transmission** (read-only display): host, port, Transmission version from `GET /api/transmission/session`, connection status dot (green/red), username shown as `[configured]` or `[not set]`, password always `[redacted]`, "Edit credentials in .env" note, "Test Connection" button → `POST /api/transmission/ping`
  - **RSS Feeds**: list with name + URL + type badge + remove button; inline "Add Feed" form with name, URL, type select; URL fetch validation is blocking (server-side, 10s timeout, HTTP 2xx required) — spinner shown during validation
  - **TV Configuration**: global defaults (resolutions multi-select chips, codecs multi-select chips); shows list (name pills with remove); add show text input
  - **Movie Policy**: years (number input + add, year pills with remove); resolutions multi-select chips; codecs multi-select chips; codecPolicy segmented control (Prefer / Require)

**Read-only state**

- when `apiWriteToken` is absent, all form controls are `disabled` with a tooltip: "Configure PIRATE_CLAW_API_WRITE_TOKEN to enable editing"
- no site-wide banner — operator is technically capable and just needs the hint on the control itself

**Save feedback**

- successful save: green toast "Saved" — for interval/port changes, toast appends "Restart the daemon for this change to take effect"
- immediately after save: inline "Restart Daemon" button appears within the toast or below the saved section; clicking it calls `POST /api/daemon/restart` and shows a "Restarting…" state; button disappears after 10 seconds if not clicked
- failed save: inline field-level error from the API `error` response; red toast "Save failed — see errors above"
- ETag conflict (409): toast "Config changed elsewhere — reload and try again" with a Reload button

**Inline validation**

- client-side: required fields, URL format (must be http/https), year range (1900–2100), non-empty strings
- server-side validation errors from the API are mapped back to the field that caused them where possible

## Explicit Deferrals

- hot reload of daemon polling intervals without restart
- standalone daemon restart button not tied to a save action
- raw config JSON editor (no escape hatch to edit the file directly in the UI)
- Transmission credential editing in the UI (stays `.env`-only)
- additional writable config fields beyond those unlocked in Phase 13/14 (no new API surface in Phase 16)
- log streaming or terminal output in the dashboard

## Exit Condition

An operator can change any supported config field — feeds, TV targets, movie policy, runtime settings — from the browser, see immediate validation feedback, and restart the daemon from the same page without ever opening a terminal.

## Rationale

The highest-value workflow improvement in this roadmap is eliminating "SSH → edit JSON → restart daemon." Phases 13 and 14 build the write infrastructure section by section. Phase 16 is the payoff: a single Config page that surfaces all of it coherently. Hot reload of polling intervals is explicitly out of scope because it requires restructuring the daemon loop's `setInterval` lifecycle — a change with meaningful risk for limited benefit given restarts are fast on a NAS.
