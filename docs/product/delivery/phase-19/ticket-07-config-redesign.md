# P19.07 Config redesign

## Goal

Redesign the Config view (`/config`) to match the System Configuration
reference screenshot: replace the current single-column accordion with a
four-panel card grid, add a system metrics footer, and replace the read-only
banners with a write-access indicator chip. All existing write behavior is
preserved unchanged.

## Scope

- **`web/src/routes/config/+page.svelte`:** full rebuild (presentation only)
  - **Four-panel card grid:**
    - `01 · TRANSMISSION PROTOCOL` — host, port, RPC version, auth token
      (masked), test connection button
    - `02 · RSS INGESTION HUBS` — feed list as compact tag-style entries with
      type badges (TV_SHOWS, MOVIES) and remove buttons; add-feed inline form
      at bottom
    - `03 · TV SERIAL PARAMETERS` — target resolutions (pill toggles),
      preferred codecs (pill toggles), active watchlist (tag chips per tracked
      show)
    - `04 · MOVIE ACQUISITION POLICIES` — release year range, required specs
      (codec/resolution toggles), constraint level (PREFER / REQUIRE toggle)
  - **System metrics footer row:** storage pool, transfer rate, CPU load,
    uptime; sourced from existing `/api/health` + `/api/status` responses
  - **Write-access indicator chip** (top right of page):
    - `WRITE ACCESS: ACTIVE` in primary accent when bearer token is present
    - `WRITE ACCESS: RESTRICTED` in muted text when absent
    - Replaces current read-only banner/tooltip affordances
  - All existing write behavior preserved: ETag checks, bearer token auth,
    per-section validation toasts, post-save daemon restart affordance,
    Transmission ping

## Out Of Scope

- New config fields or intake behavior
- Any change to the `/api/config` response shape or server-side actions
- New daemon API endpoints

## Exit Condition

The Config view renders the four-panel card grid. Each panel contains the
correct fields and controls. The system metrics footer shows live data from
`/api/health` + `/api/status`. The write-access chip reflects the correct auth
state. All existing config write operations (add feed, remove feed, update TV
defaults, update movie policy, update Transmission settings) continue to work
with toast feedback. The existing read-only behavior when write auth is absent
is preserved.

## Rationale

Config is the lowest-risk view in this phase: it introduces no new data
patterns, no route changes, and no new components beyond the write-access chip.
Placing it last means the design token system, sidebar, and more complex view
patterns are all proven before tackling the write-critical form surface.

Implementation note: the footer keeps the screenshot's four-metric shape while
staying inside the existing endpoint constraint. Host-level storage/CPU stats do
not exist on `/api/health` or `/api/status`, so the footer uses the available
live operator proxies instead: storage target path, transfer speed, last run
cycle duration, and daemon uptime.
