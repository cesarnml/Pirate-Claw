# P28.03 Origin Trust and Direct-Mode Banner

## Goal

Add the trust-on-first-visit origin banner for new access origins (e.g. Tailscale) and the direct-mode network acknowledgement banner in Config.

## Scope

**Trust-on-first-visit:**

- On any authenticated page load, compare the request `Origin` against `trusted_origins` from `GET /api/auth/state`
- If the current origin is not in the trusted list, show a persistent in-app banner:
  > "You're accessing Pirate Claw from an untrusted origin (`<origin>`). [Trust this origin]"
- "Trust this origin" button: calls `POST /api/auth/trust-origin` (proxied to daemon); on success, dismisses the banner
- Banner is absent when the current origin is already trusted
- Persisted in daemon `trusted-origins.json` — survives page reload and daemon restart

**Direct-mode acknowledgement banner:**

- Shown in Config (security posture section) when `network_posture === "unacknowledged"`
- Banner text:
  > "Transmission connects directly through your NAS network. Pirate Claw recommends a VPN bridge for most torrent use."
- Three action buttons:
  - "Understood, using direct" → `direct_acknowledged`
  - "I have external routing" → `already_secured_externally`
  - "I'll set up a VPN bridge" → `vpn_bridge_pending`
- On selection: calls `POST /api/auth/acknowledge-network-posture` (proxied to daemon); banner disappears permanently
- Banner appears only in Config — not on every page

**Tests:**

- Untrusted origin shows banner; trusted origin does not
- Trust-origin action persists and banner does not reappear after reload
- Network posture banner shown when `unacknowledged`; absent after any of the three acknowledgement actions
- All three acknowledgement states persist correctly across daemon restarts

## Out Of Scope

- VPN bridge setup (Phase 29)
- Explicit CSRF token layer
- Trusted origins management UI beyond the single-click trust banner

## Exit Condition

Tailscale access from a new origin shows the trust banner; one click adds the origin and the banner does not reappear. Direct-mode acknowledgement banner appears in Config on first authenticated visit and disappears permanently after any of the three actions. Tests pass.

## Rationale

`untrustedOrigin` is computed from `url.origin` (scheme+host+port of the request), not the HTTP `Origin` header. Direct browser navigation doesn't send an `Origin` header; `url.origin` is always present and correctly represents the access origin (LAN IP, Tailscale IP, etc.).

The auth state fetch (`GET /api/auth/state`) runs on every authenticated page load inside `+layout.server.ts`. This adds one daemon round-trip per navigation but keeps trust-origin and network-posture state always fresh without client-side caching. For a local NAS appliance, this latency is acceptable.

The `apiRequest` mock in layout tests required an explicit `.mockRejectedValue(...)` default to prevent `undefined.then()` errors when `PIRATE_CLAW_API_WRITE_TOKEN` is set in the `.env` file. The layout tests only care about `apiFetch` calls; auth state is intentionally absent from the layout test fixtures (always null).
