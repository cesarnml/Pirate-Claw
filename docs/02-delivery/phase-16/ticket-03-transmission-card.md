# P16.03 Transmission Card

## Goal

Enhance the existing Transmission card on `/config` to show the live connection status dot, Transmission version (from `GET /api/transmission/session`), credentials as `[configured]`/`[not set]`/`[redacted]`, an "Edit credentials in .env" note, and a "Test Connection" button backed by `POST /api/transmission/ping` (added in P16.01).

## Scope

### Fixture anchor

The Transmission card reads from two sources:

- `GET /api/config` → `config.transmission` — already in `fixtures/api/config-with-tv-defaults.json` (updated in P16.01).
- `GET /api/transmission/session` — already in `fixtures/api/transmission-session.json`.

Both fixtures must be committed before implementation begins (P16.01 guarantees this).

### `+page.server.ts` — load function

- Extend the `load` function to also call `GET /api/transmission/session`.
- Return `{ transmissionSession: { version: string } | null }` — `null` if the call fails (daemon unreachable or Transmission down). Do not throw; a null session just means the status dot shows red.
- The existing `config` load and the new `transmissionSession` load can be parallel (`Promise.all`).

### `+page.svelte` — Transmission card

Replace the existing Transmission `<dl>` block with:

**Connection status:**

- Small dot (green = session loaded successfully, red = null session) next to the "Transmission" heading.
- If session loaded: show `version` string below the status dot: "Transmission X.Y.Z".

**Credentials display:**

- `host`: show `config.transmission.url` (already displayed — keep).
- `username`: if value is `[redacted]` → show `[configured]`; if empty/absent → show `[not set]`.
- `password`: always show `[redacted]`.
- Add note: "Edit credentials in `.env`" in muted small text below credentials.

**Test Connection button:**

- Label: "Test Connection".
- On click: call the `testConnection` server action (see below), show a spinner while pending.
- On success: brief success toast "Transmission reachable — version X.Y.Z".
- On failure: error toast "Transmission unreachable — check .env credentials and host".
- Button is not disabled in read-only mode (testing connection doesn't require write token).

### `+page.server.ts` — `testConnection` action

- New action: calls `POST /api/transmission/ping` (bearer auth from `PIRATE_CLAW_API_WRITE_TOKEN`).
- Returns `{ pingOk: true, version: string }` or `fail(502, { pingError: string })`.
- Note: if `PIRATE_CLAW_API_WRITE_TOKEN` is absent, the ping endpoint returns 403 — surface this as "write token not configured; cannot test connection" rather than a generic error.

### Tests

- `testConnection` action: happy path returns `{ pingOk: true, version }`. Transmission unreachable returns `fail(502, ...)`. No write token configured returns `fail(403, ...)`.
- `load` function: session fetch failure returns `transmissionSession: null` without throwing.

## Out of Scope

- Transmission credential editing in the UI — stays `.env`-only.
- Collapsible card wrapping — P16.08.

## Exit Condition

The Transmission card shows a live status dot, Transmission version, properly masked credentials, a working "Test Connection" button, and the `.env` edit note. Tests green.

## Rationale

Running `GET /api/transmission/session` in the load function gives an honest at-a-glance status without a user action. Keeping it parallel with the config load means no added latency on page load.

`testConnection` needs the write token to reach the ping endpoint — this is a side effect of the ping endpoint's auth model (decided in the grill-me). The 403-specific error message avoids the operator thinking Transmission is down when the real issue is the token isn't configured.
