# P28.01 Daemon Auth State

## Goal

Add daemon-owned durable auth state and the internal auth endpoints the web app requires for owner login, session issuance, and trusted origin management.

## Scope

**Durable auth state (create-if-absent, never overwrites):**

- `config/auth/owner.json` — bcrypt password hash for the single owner account
- `config/auth/session-secret` — 32 random bytes (hex) used by the web app to sign JWTs; generated on daemon first startup if absent; same create-if-absent pattern as the P27.02 daemon write token
- `config/web/trusted-origins.json` — list of trusted origins; auto-populated with the request `Origin` on first `POST /api/auth/setup-owner`
- `config/web/network-posture.json` — direct-mode acknowledgement state; initial value `{ "state": "unacknowledged" }`

**Auth endpoints (internal, require daemon write token):**

- `GET /api/auth/state` — returns:
  ```json
  {
    "owner_exists": boolean,
    "setup_complete": boolean,
    "trusted_origins": string[],
    "network_posture": "unacknowledged" | "direct_acknowledged" | "already_secured_externally" | "vpn_bridge_pending"
  }
  ```
  `setup_complete` is `true` when `owner_exists` is `true` (v1: no additional daemon-tracked setup steps).
- `POST /api/auth/setup-owner` — creates the owner account; body: `{ username: string, password: string }`; writes bcrypt hash to `owner.json`; persists the request `Origin` header to `trusted-origins.json`; 409 if owner already exists
- `POST /api/auth/verify-login` — verifies credentials; body: `{ username: string, password: string }`; returns `{ ok: boolean }`; timing-safe comparison
- `POST /api/auth/trust-origin` — appends a new origin to `trusted-origins.json`; body: `{ origin: string }`; idempotent (no-op if already trusted)
- `POST /api/auth/acknowledge-network-posture` — updates `network-posture.json`; body: `{ state: "direct_acknowledged" | "already_secured_externally" | "vpn_bridge_pending" }`

**Tests:**

- `GET /api/auth/state` returns correct shape before and after owner creation
- `POST /api/auth/setup-owner` creates `owner.json` and `trusted-origins.json`; 409 on duplicate call
- `POST /api/auth/verify-login` returns `{ ok: true }` for correct credentials, `{ ok: false }` for wrong password
- `POST /api/auth/trust-origin` is idempotent
- `POST /api/auth/acknowledge-network-posture` persists all three valid states
- `session-secret` is generated on first startup; not overwritten on second startup

## Out Of Scope

- JWT signing and verification (web layer, P28.02)
- CSRF enforcement (web layer, P28.02)
- Web screens (P28.02)
- Trust-on-first-visit banner (P28.03)
- Direct-mode acknowledgement banner (P28.03)

## Exit Condition

All five auth endpoints behave correctly. `session-secret` is generated on first daemon startup and stable on subsequent startups. Durable auth files are written correctly with create-if-absent semantics. Tests pass.

## Rationale

Auth state lives in a new `src/auth-state.ts` module (not mixed into `install-bootstrap.ts` or `api.ts`) so the file I/O contract and bcrypt operations are testable in isolation. Session-secret generation was added to `ensureFirstStartupBootstrap` following the same create-if-absent pattern as the daemon write token; `auth/` and `web/` subdirectories are created lazily by each write function rather than added to `INSTALL_ROOT_DIRECTORIES`, matching the existing `config/generated` pattern. All five auth endpoints are behind `checkWriteAuth` (daemon write token) so the web layer remains the only caller, preventing direct unauthenticated access from LAN. Bcrypt cost 12 was chosen as the standard hardening value; the timing-safe comparison relies on bcrypt's inherent constant-time properties plus always calling `Bun.password.verify` before the username check when an owner exists.
