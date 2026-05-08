# P27.05 Install Health Daemon Endpoint

## Goal

Add a daemon endpoint that checks and reports install health for the Synology appliance stack, returning structured results that the web first-run surface can render with DSM-language remediation guidance.

## Scope

- Add `GET /api/setup/install-health` to the daemon API.
- Endpoint returns a structured response with a named result per check:
  - install root exists
  - each expected subdirectory exists or can be created: `config/`, `data/`, `downloads/`, `downloads/incomplete/`, `media/movies/`, `media/shows/`, `transmission/config/`
  - config directory is writable
  - data directory is writable
  - downloads directory is writable
  - incomplete downloads directory is writable
  - movie target directory is writable
  - show target directory is writable
  - daemon internal write token is present and non-empty
  - bundled Transmission RPC is reachable from daemon
  - bundled Transmission can authenticate (RPC session opens)
  - bundled Transmission can write to the downloads path
  - bundled Transmission can write to the media target paths
- Each check result includes: `status` (`pass` | `fail` | `skip`), and a `remediation` string in DSM-language (no terminal commands) for failures.
- Overall response includes a top-level `healthy: boolean`.
- Endpoint is unauthenticated in P27 (P28 will gate it).
- Add tests for:
  - healthy install returns `healthy: true` with all checks passing
  - missing directory returns correct failing check with remediation text
  - Transmission unreachable returns correct failing check

## Out Of Scope

- Web rendering of health results (P27.06).
- Owner auth gating (P28).
- VPN health checks (P29).

## Exit Condition

`GET /api/setup/install-health` returns structured per-check results with remediation text. `healthy` reflects the aggregate state. Tests pass.

## Rationale

Added unauthenticated `GET /api/setup/install-health` to the daemon API for the Phase 27 first-run surface. The response is a structured record of named checks plus top-level `healthy` and `installRoot`.

The endpoint is diagnostic rather than mutating. P27.02 owns create-if-absent bootstrapping; this endpoint reports missing or not-writable paths with DSM-language remediation so the browser can block first-run setup without silently changing filesystem state during a health read.

Transmission checks use the existing RPC session negotiation path for reachability/authentication and a new `free-space` RPC helper for the bundled container path checks. That proves Transmission can inspect the mounted downloads/media paths from inside its own container boundary without exposing the daemon or Transmission ports to the LAN and without shelling into DSM.
