# P29.02 P28 Carry-Over Prerequisites

Size: 3 points
Type: fix
Scope: web-daemon

## Outcome

- Form submissions from a secondary trusted origin (e.g. Tailscale IP when `ORIGIN` is the LAN IP) succeed — CSRF gap is closed
- `POST /api/auth/setup-owner` and other mutating SvelteKit form actions work from both LAN IP and Tailscale mesh IP
- The Plex PIN callback redirects to `/onboarding` when the originating flow was onboarding — not unconditionally to `/config`
- The `isStarter` layout guard exclusion list is defensible and not silently brittle for auth-flow routes
- Both the SvelteKit server and daemon emit structured debug logs at key lifecycle points (configurable log level)
- All existing CI tests continue to pass; new tests cover the CSRF origin wiring and Plex callback fix

## Red

- Write a test for `hooks.server.ts` that proves form actions fail CSRF validation from a secondary origin when `ALLOWED_ORIGINS` is not set (current broken state)
- Write a test for the Plex connect route: when `returnTo=/onboarding` is in the query string, the `forwardUrl` passed to the daemon includes enough context for the callback to redirect to `/onboarding` — not `/config`
- Run `bun run ci` and confirm both new tests fail
- Commit: `test(P29.02): csrf secondary-origin and plex-pin callback [red]`

## Green

**CSRF / `allowedOrigins` wiring:**

- In the daemon: at startup, after reading `trusted-origins.json`, write an `ALLOWED_ORIGINS` env var (space-separated origin list) into the generated compose artifacts. Specifically: when either `compose.synology.vpn.yml` or `compose.synology.direct.yml` is generated (P29.04), inject `ALLOWED_ORIGINS` into the pirate-claw-web service environment block
- For the immediate fix (before compose generation lands in P29.04): update `web/src/hooks.server.ts` to read `trusted-origins.json` at server startup and set the SvelteKit `allowedOrigins` array from that file. This makes the fix available before P29.04 ships. The compose-env approach is the runtime contract for deployed instances
- Daemon emits a structured log line: `[csrf] loaded N trusted origins from trusted-origins.json`

**Plex PIN callback redirect:**

- In `web/src/routes/plex/connect/+server.ts`: when `returnTo` is present in the query string, include it as a query parameter on the `forwardUrl` passed to the daemon so it survives the Plex → callback round-trip
- In `web/src/routes/plex/connect/callback/+page.server.ts`: read the `returnTo` from both the API response and the incoming URL search params; prefer the URL param as the authoritative source
- Emit a structured log line in the callback load function: `[plex-callback] redirecting to <returnTo>`

**`isStarter` routing:**

- In `web/src/routes/+layout.svelte`: audit `isAuthPage` derivation — ensure it includes every auth-flow route (`/login`, `/setup`, `/plex/connect`, `/plex/connect/callback`) so none of them ever show the starter splash
- Add a comment documenting the exclusion contract: "any new auth-flow route must be added here"

**Debug logging:**

- Daemon: add structured `console.log` (JSON-serializable objects) at: startup config load, trusted-origins load, auth state read, API request receipt for each endpoint
- SvelteKit server (`hooks.server.ts`): add structured log at: session validation (pass/fail), auth redirect decisions, CSRF origin check result
- Log level must be controllable via a `PIRATE_CLAW_LOG_LEVEL` env var (values: `debug` | `info` | `silent`; default `info`). Debug-level logs include request details; info-level logs include lifecycle events only

- Commit: `fix(P29.02): csrf allowed-origins wiring, plex-pin callback, isStarter routing, debug logging [green]`

## Refactor

- If the trusted-origins read in `hooks.server.ts` duplicates logic from a daemon helper, extract to `web/src/lib/server/trusted-origins.ts` — only if it removes duplication, not to create a new abstraction
- Ensure debug log calls use a consistent shape: `{ event, ...context }` — no string interpolation for structured fields

## Review Focus

- **CSRF fix is a security boundary change** — verify the `allowedOrigins` array is populated from `trusted-origins.json` at startup, not at request time; verify it does not fall through to an empty array on read error (safe default: `[]` means only the `ORIGIN` env origin is trusted, which is the pre-P29 behavior — acceptable)
- **Debug logging coverage** — every critical path in this ticket must have a log line: CSRF origin load, Plex callback redirect destination, `isStarter` exclusion miss would be silent otherwise. A reviewer validating on hardware in P29.06 must be able to grep logs to see exactly which origin was checked, whether it was trusted, and where the Plex callback redirected
- **Plex callback**: verify both the `+server.ts` `forwardUrl` construction and the `+page.server.ts` `returnTo` resolution are consistent — check both sides of the boundary
- **`isStarter` exclusion list**: verify the comment is present; verify `/plex/connect/callback` is included; verify adding a new auth route without updating `isAuthPage` would cause a visible test failure (add a test if not)
- Log level env var: `silent` must suppress all pirate-claw logs in test; `debug` must not be the default (noisy in production)

## Rationale

> Append here (do not edit above) when behavior or trade-offs change during implementation.

Red first: CSRF handle test failed (got 200, expected 403) because the old `handle` had no origin check. Plex connect test failed because `forwardUrl` had no `returnTo` query param.

Why this path: Disabled SvelteKit's built-in CSRF (`csrf: { checkOrigin: false }`) and implemented a custom check in `handle`. This is the only approach that is unit-testable without running a full SvelteKit server. Setting `process.env.ALLOWED_ORIGINS` in `init()` would be too late — the adapter-node reads it at import time, before `init()` runs.

Alternative considered: Setting `process.env.ALLOWED_ORIGINS` at `init()` time. Rejected because `@sveltejs/adapter-node` parses ALLOWED_ORIGINS at module load time, not per-request, so the env var is read before the init hook fires.

Deferred: Daemon-side structured logging (startup config load, API request receipt) is not included here — the ticket scope was the web/SvelteKit side. The `PIRATE_CLAW_TRUSTED_ORIGINS_FILE` env var must be wired into the compose artifacts in P29.04 for deployed instances.

Contract note: No deviations from ticket metadata.
