# P21.02 GET /api/setup/state Endpoint

## Goal

Add a dedicated `GET /api/setup/state` endpoint so the web app and future onboarding flows have a single, nameable contract for the operator's current setup state.

## Scope

- Add `GET /api/setup/state` to `src/api.ts`
- Response shape: `{ state: "starter" | "partially_configured" | "ready" }`
- State logic (config-file-only — no live connectivity checks):
  - `starter`: current config contains `_starter: true` at top level
  - `ready`: `_starter` absent AND `feeds` array non-empty AND (`tv` rules non-empty OR `movies.years` differs from starter default) AND `transmission.url` is not `"http://localhost:9091/transmission/rpc"`
  - `partially_configured`: everything else
- No auth required — endpoint must be readable before a write token is configured
- Endpoint must be available in starter mode (API starts before operator has configured anything)
- Add fixture snapshots for all three states in `tests/fixtures/setup-state/` (or equivalent fixture location used by this project)
- Add unit + integration tests covering all three state transitions

## Out Of Scope

- Live Transmission or Plex connectivity checks (deferred — keep state derivation config-file-only for P21)
- Plex version detection (P22)
- Any change to `validateConfig`

## Exit Condition

`GET /api/setup/state` returns the correct `{ state }` for all three config variants. Fixture snapshots exist. Endpoint is reachable in starter mode with no auth.

## Blocked By

P21.01 — `ensureStarterConfig` (starter config must exist before state derivation is testable end-to-end)

## Rationale

- A dedicated endpoint keeps setup-state logic out of `GET /api/config`, avoiding coupling between config reads and readiness derivation.
- No auth on this endpoint is intentional: the operator needs to see setup state before they've configured a write token.
- Config-file-only state derivation keeps P21 scope tight; live connectivity checks belong in P22 where the onboarding flow can surface actionable errors.
