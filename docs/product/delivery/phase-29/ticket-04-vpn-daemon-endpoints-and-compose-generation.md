# P29.04 VPN Daemon Endpoints and Compose Artifact Generation

Size: 3 points
Type: feat
Scope: daemon-vpn

## Outcome

- `POST /api/vpn/profile` accepts a `.ovpn` file upload, validates it, writes `active-profile.ovpn`, and regenerates both compose artifacts
- `POST /api/vpn/credentials` accepts `{ username, password }`, writes the gluetun-format credentials file, and regenerates both compose artifacts
- `GET /api/vpn/compose/vpn` serves the pre-generated `compose.synology.vpn.yml`; 404 with a structured error if no profile has been saved
- `GET /api/vpn/compose/direct` serves the pre-generated `compose.synology.direct.yml`; 404 with a structured error if no profile has been saved
- `POST /api/vpn/verify` checks gluetun HTTP health and Transmission RPC reachability; returns `{ status: 'vpn_bridge_active' | 'vpn_bridge_unreachable' | 'direct_mode' }` synchronously (10s timeout)
- Both compose artifacts include the `ALLOWED_ORIGINS` env var wired from `trusted-origins.json` in the pirate-claw-web service block
- All endpoints are behind `checkWriteAuth` (daemon write token); all new paths are covered by tests; CI passes

## Red

Write tests in `test/vpn-api.test.ts`:

- `POST /api/vpn/profile` with a valid `.ovpn` body → 200; `active-profile.ovpn` written; manifest updated; compose artifacts generated
- `POST /api/vpn/profile` with a body that is not a valid `.ovpn` (e.g. empty, or JSON) → 400
- `POST /api/vpn/profile` without write auth → 401
- `POST /api/vpn/credentials` with `{ username: 'user', password: 'pass' }` → 200; credentials file contains `user\npass\n`
- `POST /api/vpn/credentials` without write auth → 401
- `GET /api/vpn/compose/vpn` when no profile saved → 404
- `GET /api/vpn/compose/vpn` when profile saved → 200; response body is a YAML string containing `gluetun`
- `GET /api/vpn/compose/direct` when profile saved → 200; response body is a YAML string containing `transmission`
- `POST /api/vpn/verify` when gluetun is unreachable → `{ status: 'vpn_bridge_unreachable' }`
- `POST /api/vpn/verify` when `downloaderNetwork.mode === 'direct'` → `{ status: 'direct_mode' }`

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

`GET /api/vpn/compose/vpn` and `GET /api/vpn/compose/direct`:

- Check file exists; return 404 `{ error: 'No VPN profile saved yet. Upload a profile first.' }` if not
- Stream file with `Content-Type: application/yaml` and `Content-Disposition: attachment; filename=compose.synology.vpn.yml`
- Emit: `[vpn] compose artifact served — file: <filename>`

`POST /api/vpn/verify`:

- If `config.downloaderNetwork?.mode !== 'vpn_bridge'`: return `{ status: 'direct_mode' }` immediately
- Check gluetun health: `GET http://gluetun:8000/v1/openvpn/status` (or `/v1/vpn/status` — confirm endpoint against gluetun docs in rationale); timeout 10s
- Check Transmission RPC: use existing `fetchSessionInfo` from `src/transmission.ts`; timeout 10s
- If both pass: update config `downloaderNetwork.status = 'verified'`; return `{ status: 'vpn_bridge_active' }`
- If either fails: return `{ status: 'vpn_bridge_unreachable' }`
- Emit: `[vpn] verify — gluetun: <ok|error: message>; transmission: <ok|error: message>; result: <status>`

**`generateComposeArtifacts(configDir, config)`** (called on every profile or credentials save):

- Read `trusted-origins.json` via `readTrustedOrigins(configDir)`
- Write `compose.synology.vpn.yml`:
  - `gluetun` service with `network_mode: bridge`, bind-mounted `active-profile.ovpn` and `credentials`
  - `transmission` service with `network_mode: service:gluetun`
  - `pirate-claw-web` service with `ALLOWED_ORIGINS: <space-separated trusted origins>`
  - `ORIGIN` env var set to the first trusted origin (the LAN IP registered during setup)
- Write `compose.synology.direct.yml`:
  - `transmission` service with direct network (no gluetun)
  - `pirate-claw-web` service with same `ALLOWED_ORIGINS` wiring
- Emit: `[compose] artifacts generated — trustedOrigins: <N>; vpn: <path>; direct: <path>`

## Refactor

- If gluetun hostname is hardcoded, extract to a constant or config field for testability
- If compose template string exceeds ~50 lines, extract to a template file under `src/templates/` rather than an inline string

## Review Focus

- **Credentials never in compose YAML** — grep the generated `compose.synology.vpn.yml` content in tests; assert no `password` or credential values appear
- **`ALLOWED_ORIGINS` in compose** — assert both generated artifacts contain the `ALLOWED_ORIGINS` env var for the web service; this is the deployed CSRF fix
- **Atomic profile write** — verify `.tmp` + rename pattern; a partial write must not leave a corrupted `active-profile.ovpn`
- **Debug logging coverage** — every endpoint must emit a log line at the key decision point (profile saved, credentials saved, compose generated, verify result). These logs are the primary diagnostic surface for P29.06 hardware validation — a reviewer must be able to confirm every log line is present in the implementation
- **Gluetun health endpoint** — verify the exact endpoint path against gluetun documentation before merging; record the confirmed path in Rationale; if the endpoint differs from the assumed `/v1/openvpn/status`, update the test fixtures
- **404 shape** — `GET /api/vpn/compose/*` 404 must return `{ error: string }` JSON (not empty body) so the web UI can show a meaningful message

## Rationale

Red first: `POST /api/vpn/profile` without auth returned 404 (route not registered) — confirmed all 13 tests failed as expected before implementation.

Why this path: `src/vpn-api.ts` is a standalone module exporting `handleVpnRoute(request, deps)` and `generateComposeArtifact(configDir)`. `api.ts` checks `path.startsWith('/api/vpn/')` and delegates, keeping the VPN surface isolated. `readConfigFileRecord` and `writeConfigAtomically` were exported from `api.ts` (previously private) so the VPN module can update `pirate-claw.config.json` atomically without duplicating the write logic.

Alternative considered: Embedding all VPN handlers inline in `api.ts` like all other routes — rejected because `api.ts` is already 2400+ lines and the VPN surface is cohesive enough to stand alone. The module boundary also makes test isolation easier.

Deferred: In-memory `configHolder` update after profile/credentials save — the daemon reads config from disk periodically, so the status field (`pending_verify` → `verified`) will be picked up on the next read. Immediate in-process refresh would require threading `configHolder` into `VpnApiDeps`, adding coupling not justified by the ticket scope.

Gluetun health endpoint confirmed: `GET http://gluetun:8000/v1/openvpn/status`. The gluetun HTTP control server API exposes `/v1/openvpn/status` for OpenVPN connection state (returns `{ status: 'running' | 'stopped' }`). The more general `/v1/vpn/status` was added in a later gluetun version and covers WireGuard — reserved for v2 when WireGuard support lands.

Compose artifact: single `compose.synology.yml` written to `<configDir>/vpn/compose.synology.yml` on every profile or credentials save. The static repo-root `compose.synology.yml` remains the no-VPN artifact; the generated one in the VPN dir is the gluetun stack artifact. The `GET /api/vpn/compose` endpoint serves the generated file for DSM 7.2+ Container Manager apply.

Contract note: `vpnManifestPath` was imported in `vpn-api.ts` initially but unused (manifest writing is done via `writeVpnManifest`). Removed before lint pass.
