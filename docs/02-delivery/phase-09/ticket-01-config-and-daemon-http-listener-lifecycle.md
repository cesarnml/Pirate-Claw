# P9.01 Config And Daemon HTTP Listener Lifecycle

## Goal

Add `runtime.apiPort` to config and wire a `Bun.serve()` HTTP listener into the daemon lifecycle so it starts alongside the daemon loop and stops cleanly on shutdown.

## Scope

- Add optional `apiPort?: number` to `RuntimeConfig`
- Validate `runtime.apiPort` in `validateRuntime`: must be a positive integer when present, omitted means no API
- Extend `runDaemonLoop` input to accept an optional `server` (or start callback) that produces an HTTP server
- Start the HTTP server before entering the daemon loop when `apiPort` is configured
- Stop the HTTP server after the daemon loop exits (same `AbortSignal` shutdown path)
- The server returns `404 { error: "not found" }` for all routes in this ticket — real endpoints come in P9.02/P9.03
- Add config validation tests for `apiPort` (valid, invalid, omitted)
- Add daemon lifecycle tests: server starts, server stops on signal, daemon works without server when `apiPort` is omitted

## Out Of Scope

- Real endpoint handlers (P9.02, P9.03)
- Docs/example config update (P9.04)

## Exit Condition

Config validation accepts/rejects `runtime.apiPort` correctly. The daemon starts an HTTP listener on the configured port that responds to any request with a 404 JSON body. The listener stops cleanly when the daemon receives SIGINT/SIGTERM. When `apiPort` is omitted, no listener starts and the daemon behaves identically to pre-Phase-09.
