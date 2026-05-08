# Phase 10 Read-Only SvelteKit Dashboard

Phase 10 adds a web-based read-only dashboard that consumes the daemon HTTP API from Phase 09, giving the operator browser-based visibility into Pirate Claw state without touching the CLI or database directly.

## Phase Goal

Phase 10 should leave Pirate Claw in a state where:

- a SvelteKit (Svelte 5) application runs as a separate service (or container)
- the dashboard displays run history, candidate states, and per-show season/episode grids
- all data comes from the daemon HTTP API — no direct SQLite or config file access
- the UI is functional and readable, not yet visually rich

## Product Goals For This Phase

- give the operator a browser-based view of everything `pirate-claw status` shows today, plus per-show drill-down
- validate the Phase 09 API contract under real frontend consumption
- establish the SvelteKit project structure and deployment baseline for future UI phases

## Committed Scope

- scaffold a SvelteKit (Svelte 5) project in a `web/` directory at the repo root
- configure the SvelteKit app to consume the daemon API base URL from an environment variable
- implement the following views:
  - **Dashboard home** — summary of recent daemon runs (count, last run time, success/failure) and high-level candidate stats
  - **Candidates list** — table of all candidates with status, media type, rule, resolution, lifecycle state, and timestamps; sortable and filterable by status and media type
  - **Show detail** — per-show page listing seasons and episodes derived from candidate data, showing download status per episode
  - **Config view** — rendered view of the effective normalized config (read-only, credentials redacted by the API)
- add a Dockerfile for the SvelteKit app suitable for NAS deployment alongside the daemon container
- keep styling functional (readable layout, basic table formatting) — visual polish is a future iteration

## Exit Condition

An operator can open the dashboard in a browser, navigate between the home, candidates, show detail, and config views, and see the same data that the CLI and API surface. The SvelteKit app builds and runs in a Docker container that can be deployed alongside the existing daemon container on the NAS.

## Explicit Deferrals

These are intentionally outside Phase 10:

- config editing through the UI
- TMDB metadata, posters, or ratings display
- visually rich styling, animations, or theming
- authentication or access control
- real-time push updates (polling on page load is sufficient)
- mobile-specific responsive design beyond basic readability
- Docker Compose orchestration of daemon + web (operator wires the two containers manually for now)

## Why The Scope Stays Narrow

The dashboard is the most user-visible deliverable in this ideation wave, but it depends entirely on the API being correct and the data model being stable. Shipping a functional read-only dashboard first validates the full vertical stack (daemon → API → frontend) before adding visual richness, write paths, or external metadata. The SvelteKit scaffold also becomes the foundation for every future UI feature.
