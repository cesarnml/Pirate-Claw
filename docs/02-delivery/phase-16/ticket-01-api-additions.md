# P16.01 API Additions

## Goal

Add two missing API endpoints (`POST /api/daemon/restart`, `POST /api/transmission/ping`) and expose `tvDefaults` in `GET /api/config` so the TV Configuration card can be pre-populated with current values.

## Scope

### `POST /api/daemon/restart` — `src/api.ts`

- Requires `Authorization: Bearer <token>`; return 401 if missing, 403 if wrong or writes disabled.
- Body: none required. On auth success, call `process.kill(process.pid, 'SIGTERM')` and return `200 { ok: true }` before the process exits. (The NAS supervisor restarts the process.)
- No `If-Match` required — this is not a config mutation.
- Document in the handler: "This endpoint trusts the supervisor to restart. Run the daemon under Synology Task Scheduler or systemd with auto-restart on exit."
- Add to `docs/01-product/phase-06-synology-runbook.md`: a note that the daemon must run under a supervisor that auto-restarts on exit, and that `POST /api/daemon/restart` triggers a graceful shutdown.

### `POST /api/transmission/ping` — `src/api.ts`

- Requires `Authorization: Bearer <token>`; 401/403 as above.
- Body: none. Call `transmissionClient.sessionGet()` (or equivalent minimal Transmission RPC call).
- On success: `200 { ok: true, version: "<transmission version string>" }`.
- On Transmission connection failure: `502 { ok: false, error: "<message>" }`.
- No `If-Match` — read-only probe.

### Expose `tvDefaults` in `GET /api/config` — `src/api.ts`, `src/config.ts`, `web/src/lib/types.ts`

- Add `tvDefaults: { resolutions: string[]; codecs: string[] }` to the `AppConfig` type in `web/src/lib/types.ts`.
- In `src/api.ts` `GET /api/config` handler: after loading `activeConfig`, also read `config.tv.defaults` from the raw on-disk config (already available as `activeConfig` is a parsed `AppConfig` — check if `CompactTvDefaults` is accessible on the config holder). If `tvDefaults` is not already on `AppConfig` in the daemon-side type, extend it there too.
- `redactConfig` passes `tvDefaults` through unchanged (no secrets).
- Update `fixtures/api/config-with-tv-defaults.json` to include:
  ```json
  "tvDefaults": { "resolutions": ["1080p"], "codecs": ["x265"] }
  ```
  alongside the existing fields. This fixture is the source of truth for all UI tickets that read TV defaults.

### Tests — `src/api.test.ts` (or equivalent)

- `POST /api/daemon/restart`:
  - disabled writes (no token): 403
  - missing bearer: 401
  - wrong bearer: 403
  - happy path: 200 `{ ok: true }` (spy on `process.kill`, do not actually send SIGTERM in tests)
- `POST /api/transmission/ping`:
  - disabled writes: 403
  - missing bearer: 401
  - wrong bearer: 403
  - Transmission unreachable: 502 `{ ok: false, error: ... }`
  - happy path: 200 `{ ok: true, version: "..." }`
- `GET /api/config` with tvDefaults fixture: response includes `tvDefaults` object.

## Out of Scope

- Any web UI changes.
- Hot reload of interval timers.
- Standalone daemon restart button in the UI — the endpoint exists but the UI constraint (only offered post-save) is enforced in P16.02.

## Exit Condition

All three additions are live with tests green. `fixtures/api/config-with-tv-defaults.json` is updated and committed. Subsequent UI tickets can anchor types and load functions against the updated fixture.

## Rationale

Grouped into one ticket because all three are API-layer changes with no UI surface, and the TV defaults exposure and the two new endpoints are each small. Keeping them together avoids a one-liner ticket for `tvDefaults` and a separate one-liner for each endpoint.

`process.kill(process.pid, 'SIGTERM')` is the minimal, correct restart mechanism for a supervisor-managed process. The alternative (exec a new process) would require privilege escalation and is unnecessary when the supervisor already handles respawn.

Bearer-only auth on `POST /api/daemon/restart` is intentional — the endpoint is for a solo NAS operator who already holds the write token. A secondary confirmation parameter would be security theater on a localhost-bound service.
