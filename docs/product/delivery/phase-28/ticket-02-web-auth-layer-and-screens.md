# P28.02 Web Auth Layer and Screens

## Goal

Add JWT session issuance, web-enforced auth guard, owner setup screen, and login/logout screens. After this ticket, the full owner auth loop works end-to-end.

## Scope

**Session layer (`web/src/hooks.server.ts`):**

- Read `config/auth/session-secret` from the filesystem at startup alongside the existing daemon write token (same pattern, same shared volume mount)
- Sign and verify JWTs using the secret; 30-day absolute expiry
- Issue as `httpOnly + SameSite=Strict` cookie named `pc_session`
- Expose session state to SvelteKit layouts via `locals`

**Auth guard:**

- On every server request, resolve auth state from the JWT cookie and, when needed, `GET /api/auth/state`
- Redirect rules:
  - No owner exists → `/setup`
  - Owner exists, no valid session → `/login`
  - Valid session, setup incomplete → `/setup`
  - Valid session, setup complete → allow through
- Guard result cached in `locals` for the request lifetime; no redundant daemon calls per request

**Owner setup screen (`/setup`):**

- Shown only when no owner exists
- Form: username + password + password confirm
- On submit: `POST /api/auth/setup-owner` (proxied to daemon); on success, issue `pc_session` cookie and redirect to onboarding/dashboard
- No app shell, no diagnostics, no torrent state visible before submission

**Login screen (`/login`):**

- Shown when owner exists but session is absent or expired
- Form: username + password
- On submit: `POST /api/auth/verify-login` (proxied to daemon); on success, issue `pc_session` cookie and redirect to dashboard
- Silent redirect to `/login` on expired session; credential error shown only on wrong password

**Logout:**

- `POST /logout` SvelteKit action: clear `pc_session` cookie, redirect to `/login`
- Accessible from app shell nav

**Web API middleware:**

- All SvelteKit server routes that proxy mutating requests to the daemon verify a valid `pc_session` before forwarding
- Unauthenticated mutating requests return 401; browser-facing routes redirect to `/login`

**Tests:**

- JWT issued on successful setup and login
- Expired/missing JWT redirects to `/login` (or `/setup` when no owner)
- Logout clears the cookie and redirects
- Unauthenticated mutating proxy request returns 401

## Out Of Scope

- Trust-on-first-visit origin banner (P28.03)
- Direct-mode acknowledgement banner (P28.03)
- Explicit CSRF token layer — deferred; `SameSite=Strict` covers the v1 threat model. Add a CSRF token only if a gap is found during implementation.

## Exit Condition

Owner setup creates an account, issues a session, and lands on the app. Login works. Logout clears the session and redirects to `/login`. Unauthenticated users cannot reach the app shell or trigger mutating actions. Session survives normal navigation. Tests pass.

## Rationale

JWT signed with Web Crypto API (HMAC-SHA256) rather than a third-party library — Bun's runtime exposes `crypto.subtle` natively, keeping the dependency surface minimal. The `b64url` helper was widened to accept `ArrayBuffer | Uint8Array` to satisfy TypeScript's strict SubtleCrypto typings (TS requires `ArrayBuffer` for `importKey`, `Uint8Array<ArrayBuffer>` for `verify`).

The auth guard in `hooks.server.ts` checks the daemon's `/api/auth/state` only for unauthenticated requests needing a redirect target (setup vs. login). Authenticated requests never call the daemon — the JWT is self-contained. Response uses snake_case `owner_exists` per the daemon JSON contract.

The "setup incomplete with valid session" redirect was intentionally omitted: the daemon equates `setup_complete === owner_exists`, so a valid session implies the owner exists and setup is complete by definition.

`SameSite=Strict` without `secure: true` is intentional for v1 — the appliance runs on a local LAN without HTTPS. The v1 threat model accepts this; HTTPS termination is a post-v1 concern.
