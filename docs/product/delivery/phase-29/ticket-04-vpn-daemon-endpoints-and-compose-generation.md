# P29.04 VPN Daemon Endpoints and Compose Artifact Generation

Size: 3 points
Type: feat
Scope: daemon-vpn

## Outcome

- `POST /api/vpn/profile` accepts a `.ovpn` file upload, validates it, writes `active-profile.ovpn`, and regenerates the compose artifact
- `POST /api/vpn/credentials` accepts `{ username, password }`, writes the gluetun-format credentials file, and regenerates the compose artifact
- `GET /api/vpn/compose` serves the pre-generated `compose.synology.yml` (single artifact, gluetun always present); 404 with a structured error if no profile has been saved
- `POST /api/vpn/verify` checks gluetun HTTP health and Transmission RPC reachability; returns `{ status: 'vpn_bridge_active' | 'vpn_bridge_unreachable' | 'passthrough' }` synchronously (10s timeout); returns `passthrough` immediately if no credentials saved
- The compose artifact includes the `ALLOWED_ORIGINS` env var wired from `trusted-origins.json` in the pirate-claw-web service block
- All endpoints are behind `checkWriteAuth` (daemon write token); all new paths are covered by tests; CI passes

## Red

Write tests in `test/vpn-api.test.ts`:

- `POST /api/vpn/profile` with a valid `.ovpn` body → 200; `active-profile.ovpn` written; manifest updated; compose artifact generated
- `POST /api/vpn/profile` with a body that is not a valid `.ovpn` (e.g. empty, or JSON) → 400
- `POST /api/vpn/profile` without write auth → 401
- `POST /api/vpn/credentials` with `{ username: 'user', password: 'pass' }` → 200; credentials file contains `user\npass\n`
- `POST /api/vpn/credentials` without write auth → 401
- `GET /api/vpn/compose` when no profile saved → 404
- `GET /api/vpn/compose` when profile saved → 200; response body is a YAML string containing `gluetun`
- `POST /api/vpn/verify` when no credentials saved → `{ status: 'passthrough' }`
- `POST /api/vpn/verify` when gluetun is unreachable → `{ status: 'vpn_bridge_unreachable' }`
- `POST /api/vpn/verify` when gluetun + Transmission both reachable → `{ status: 'vpn_bridge_active' }`

Run `bun run ci` and confirm new tests fail. Commit: `test(P29.04): vpn daemon endpoints [red]`

## Green

**File: `src/vpn-api.ts`** (new module, registered in `src/api.ts`):

`POST /api/vpn/profile`:

- Parse raw body as bytes; validate it begins with `client` or `proto` (basic `.ovpn` signature check) — reject 400 if not
- Write to `activeProfilePath(configDir)` atomically (write to `.tmp`, then rename)
- Write `manifest.json` via `writeVpnManifest`
- Update `pirate-claw.config.json` `downloaderNetwork.mode = 'vpn_bridge'`, `status = 'pending_apply'`
- Call `generateComposeArtifacts(configDir, config)` (see below)
- Emit: `[vpn] profile saved — size: <bytes>; compose artifacts regenerated`
- Return `{ ok: true, manifest }`

`POST /api/vpn/credentials`:

- Parse body as `{ username: string, password: string }`; validate both non-empty strings
- Write `credentialsPath(configDir)` as `${username}\n${password}\n` (gluetun format) with mode `0o600`
- Update manifest `hasCredentials: true`
- Call `generateComposeArtifacts(configDir, config)`
- Emit: `[vpn] credentials saved (username: <username>); compose artifacts regenerated` — **never log password**
- Return `{ ok: true }`

`GET /api/vpn/compose`:

- Check file exists; return 404 `{ error: 'No VPN profile saved yet. Upload a profile first.' }` if not
- Stream file with `Content-Type: application/yaml` and `Content-Disposition: attachment; filename=compose.synology.yml`
- Emit: `[vpn] compose artifact served`

`POST /api/vpn/verify`:

- If no credentials saved (`manifest.hasCredentials === false`): return `{ status: 'passthrough' }` immediately
- Check gluetun health: `GET http://gluetun:8000/v1/openvpn/status` (or `/v1/vpn/status` — confirm endpoint against gluetun docs in rationale); timeout 10s
- Check Transmission RPC: use existing `fetchSessionInfo` from `src/transmission.ts`; timeout 10s
- If both pass: update config `downloaderNetwork.mode = 'vpn_bridge'`, `status = 'verified'`; return `{ status: 'vpn_bridge_active' }`
- If either fails: return `{ status: 'vpn_bridge_unreachable' }`
- Emit: `[vpn] verify — gluetun: <ok|error: message>; transmission: <ok|error: message>; result: <status>`

**`generateComposeArtifact(configDir, config)`** (called on every profile or credentials save):

- Read `trusted-origins.json` via `readTrustedOrigins(configDir)`
- Write `compose.synology.yml` (single artifact — gluetun always present):
  - `gluetun` service with `network_mode: bridge`, bind-mounted `active-profile.ovpn` and `credentials`
  - `transmission` service with `network_mode: service:gluetun`
  - `pirate-claw-web` service with `ALLOWED_ORIGINS: <space-separated trusted origins>`
  - `ORIGIN` env var set to the first trusted origin (the LAN IP registered during setup)
- Emit: `[compose] artifact generated — trustedOrigins: <N>; path: <path>`

## Refactor

- If gluetun hostname is hardcoded, extract to a constant or config field for testability
- If compose template string exceeds ~50 lines, extract to a template file under `src/templates/` rather than an inline string

## Review Focus

- **Credentials never in compose YAML** — grep the generated `compose.synology.yml` content in tests; assert no `password` or credential values appear
- **`ALLOWED_ORIGINS` in compose** — assert the generated artifact contains the `ALLOWED_ORIGINS` env var for the web service; this is the deployed CSRF fix
- **Atomic profile write** — verify `.tmp` + rename pattern; a partial write must not leave a corrupted `active-profile.ovpn`
- **Debug logging coverage** — every endpoint must emit a log line at the key decision point (profile saved, credentials saved, compose generated, verify result). These logs are the primary diagnostic surface for P29.06 hardware validation — a reviewer must be able to confirm every log line is present in the implementation
- **Gluetun health endpoint** — verify the exact endpoint path against gluetun documentation before merging; record the confirmed path in Rationale; if the endpoint differs from the assumed `/v1/openvpn/status`, update the test fixtures
- **404 shape** — `GET /api/vpn/compose/*` 404 must return `{ error: string }` JSON (not empty body) so the web UI can show a meaningful message

## Rationale

> Append here (do not edit above) when behavior or trade-offs change during implementation.

Red first: [what test failed first]
Why this path: [why this implementation was the smallest acceptable]
Alternative considered: [one rejected alternative and why]
Deferred: [what was intentionally left out of this ticket]
Contract note: record any deviation from the ticket metadata contract here, including missing/incorrect `Type:` or non-compliant `Scope:` fields, and why it happened.
