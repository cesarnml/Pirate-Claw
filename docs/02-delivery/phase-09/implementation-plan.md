# Phase 09 Implementation Plan

Phase 09 adds a read-only HTTP JSON API to the daemon so external consumers can query run history, candidate states, per-show breakdowns, and effective config.

## Epic

- `Phase 09 Daemon HTTP API`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Ticket Order

1. `P9.01 Config And Daemon HTTP Listener Lifecycle`
2. `P9.02 Status, Health, And Candidates Endpoints`
3. `P9.03 Shows, Movies, Feeds, And Config Endpoints`
4. `P9.04 Docs And Example Config Update`

## Ticket Files

- `ticket-01-config-and-daemon-http-listener-lifecycle.md`
- `ticket-02-status-and-candidates-endpoints.md`
- `ticket-03-shows-movies-feeds-and-config-endpoints.md`
- `ticket-04-docs-and-example-config-update.md`

## Exit Condition

An operator running the daemon with `runtime.apiPort` configured can `curl` each endpoint (`/api/health`, `/api/status`, `/api/candidates`, `/api/shows`, `/api/movies`, `/api/feeds`, `/api/config`) and receive well-structured JSON. The daemon process lifecycle is unaffected — the HTTP server starts and stops cleanly with the daemon. When `runtime.apiPort` is omitted, no HTTP listener starts.

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- the previous tests are green
- the behavior change is explained in the ticket and rationale
- the phase-level defaults and deferrals remain unchanged

## Explicit Deferrals

These are intentionally out of scope for Phase 09:

- write endpoints (config editing, manual queue/retry triggers)
- authentication or TLS
- WebSocket or push-based updates
- web UI frontend (Phase 10)
- TMDB or other external metadata (Phase 11)
- CORS configuration beyond permissive localhost defaults
- pagination or filtering query parameters on list endpoints

## Stop Conditions

Pause for review if:

- the HTTP listener lifecycle requires changes to the daemon's existing `AbortSignal` shutdown flow beyond wiring in a `server.stop()` call
- endpoint response shapes require changes to the existing `Repository` interface
- the `/api/shows` grouping logic needs a new database query rather than post-processing of `listCandidateStates`
