# Phase 09 Daemon HTTP API

Phase 09 adds a read-only HTTP JSON API to the Pirate Claw daemon so external consumers (starting with the Phase 10 web dashboard) can query daemon and database state without touching SQLite or the config file directly.

## Phase Goal

Phase 09 should leave Pirate Claw in a state where:

- the daemon exposes a lightweight HTTP server on a configurable port
- external consumers can query run history, candidate states, per-show season/episode breakdowns, and the effective normalized config
- the API is read-only and adds no write paths to the daemon
- the daemon remains the single owner of SQLite and config

## Product Goals For This Phase

- establish a clean data boundary between the daemon and future UI consumers
- position the daemon as the authoritative API server so the web UI never needs direct file or database access
- keep the API surface small and aligned with data the daemon already computes

## Committed Scope

- add an HTTP listener to the daemon process on a configurable port
  - default port in `runtime` config (e.g., `runtime.apiPort: 2700`)
  - the listener starts alongside the daemon loop and stops on shutdown
- expose read-only JSON endpoints:
  - `GET /api/health` — daemon uptime and last cycle snapshots (doubles as Docker HEALTHCHECK target)
  - `GET /api/status` — recent runs and candidate states (mirrors `pirate-claw status`)
  - `GET /api/candidates` — full candidate state list with lifecycle and Transmission metadata
  - `GET /api/shows` — per-show season/episode breakdown derived from candidate state
  - `GET /api/movies` — movie candidates grouped by title with year, resolution, codec, and lifecycle metadata
  - `GET /api/feeds` — configured feeds with poll state (last polled, next due, poll interval)
  - `GET /api/config` — effective normalized config (mirrors `pirate-claw config show`, with Transmission credentials redacted)
- return structured JSON with consistent error shapes
- no authentication in this phase (the daemon is on a private NAS network)

## Configuration Surface Added In This Phase

```json
{
  "runtime": {
    "apiPort": 2700
  }
}
```

The field is optional. When omitted, the HTTP API is not started by the daemon.

## Exit Condition

An operator running the daemon with `runtime.apiPort` configured can `curl` each endpoint and receive well-structured JSON that matches the data available through the existing CLI commands. The daemon process lifecycle is unaffected — the HTTP server starts and stops cleanly with the daemon.

## Explicit Deferrals

These are intentionally outside Phase 09:

- write endpoints (config editing, manual queue/retry triggers)
- authentication or TLS
- WebSocket or push-based updates
- web UI frontend (Phase 10)
- TMDB or other external metadata (Phase 11)
- CORS configuration beyond localhost defaults

## Why The Scope Stays Narrow

The web dashboard needs a data source. Building the API as its own phase means the data contract is tested, stable, and curl-verifiable before any frontend code exists. It also means the API is independently useful for scripting, monitoring, or other integrations that don't need a browser.
