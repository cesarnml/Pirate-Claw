# Phase 28: Owner Web Security

**Delivery status:** Not started — product definition only; no `docs/02-delivery/phase-28/` implementation plan until tickets are approved.

Phase 28 adds the human security boundary required before Pirate Claw can be treated as a release-ready NAS appliance. The daemon bearer token protects internal web-to-daemon writes; it does not identify the owner using the browser.

## TL;DR

**Goal:** require a local owner login before Pirate Claw exposes detailed app state or destructive web controls.

**Ships:** first-owner setup, login/logout, durable daemon-owned owner auth state, web-issued sessions, trusted origin hardening, CSRF protection, destructive action gates, and direct downloader network acknowledgement.

**Defers:** OpenVPN bridge setup (Phase 29), multi-user/delegated household operators, SSO, HTTPS/public-internet hardening, audit logs.

## Phase Goal

Phase 28 should leave Pirate Claw in a state where:

- opening Pirate Claw on `8888` requires owner setup or login before detailed diagnostics and app controls are shown
- a single local owner account is enough for v1
- owner password material is stored as a password hash in daemon-owned durable state, not in config JSON
- browser sessions are issued by the web app and backed by daemon-owned install/session secrets
- destructive web actions are unavailable without a valid owner session
- CSRF protection is explicit for mutating browser actions
- trusted origins are persisted as install state and support LAN and Tailscale/private mesh access
- direct bundled Transmission mode is allowed only after a clear risk acknowledgement

## Security Stance

Pirate Claw v1 is for LAN or private mesh access, including Tailscale. It is not hardened for direct public internet exposure.

Supported:

- trusted LAN
- private mesh access such as Tailscale
- owner-authenticated web UI

Unsupported:

- public internet port forwarding
- anonymous household access
- multi-user role separation
- delegated non-admin DSM user flows

## Owner Auth Contract

First-run order:

1. Browser opens Pirate Claw web.
2. Web checks daemon auth state.
3. If no owner exists, only owner setup is shown.
4. Owner creates username/password.
5. Web issues a session cookie.
6. Install health checks and setup flow become available.

The unauthenticated UI may show only minimal startup failure text such as "Pirate Claw is starting" or "Pirate Claw web cannot reach daemon." It must not show detailed paths, diagnostics, config, torrent state, or destructive controls.

## Durable Auth State

The daemon owns durable auth state. The web app owns browser session cookies.

Suggested durable boundary:

```text
/volume1/pirate-claw/config/auth/
  owner.json
  session-secret
```

The daemon exposes narrow internal auth endpoints for the web container:

```text
GET  /api/auth/state
POST /api/auth/setup-owner
POST /api/auth/verify-login
```

The daemon does not need to track every browser session. The web verifies login and signs sessions using daemon-owned install/session material.

## Trusted Origins

Phase 28 hardens the first-origin behavior introduced by the DSM-first install path.

Requirements:

- first authenticated setup persists the observed origin
- LAN IP and Tailscale/private mesh hostnames can both be trusted
- Config can show and manage trusted origins after login
- cross-site form posts are rejected unless origin is trusted
- no owner-facing DSM import step requires hand-entering `ORIGIN`

Suggested state:

```text
/volume1/pirate-claw/config/web/trusted-origins.json
```

## Destructive Action Gate

The web session gate applies to the app shell, not only individual buttons.

At minimum, these flows require a valid owner session:

- dashboard torrent pause/resume/remove
- remove-with-delete
- missing-torrent disposition
- failed-candidate requeue
- config writes
- daemon restart request
- Transmission ping/action surfaces
- Plex auth/config actions
- future VPN setup actions

The web server still calls the daemon using the internal daemon write token. Owner auth and daemon write auth are separate trust boundaries.

## Direct Downloader Network Acknowledgement

Phase 28 does not build the VPN bridge, but it must make the downloader network posture explicit.

Default Phase 27 stack starts bundled Transmission in direct mode. Before queueing is treated as release-safe, the owner must see and acknowledge:

> Transmission will connect directly through your NAS network. Pirate Claw recommends a VPN bridge for most torrent use.

Accepted states:

- `direct_acknowledged`
- `already_secured_externally`
- `vpn_bridge_pending` / future Phase 29 state

The warning should be persistent but not noisy. It belongs in setup summary and Config/security posture, not on every page.

## Validation Contract

Phase 28 must be validated on the DS918+ DSM 7.1 baseline:

- first visit creates owner account
- unauthenticated user sees no detailed diagnostics/app shell
- login works
- logout works
- session survives normal navigation
- destructive actions are blocked when logged out
- destructive actions work only after login
- LAN and Tailscale/private mesh origins behave correctly
- direct-mode acknowledgement state is persisted and visible

## Exit Condition

Pirate Claw web is no longer an unauthenticated NAS control surface. A DSM-first owner creates a local owner account, logs in, and then uses setup/config/torrent actions through authenticated browser sessions. Destructive actions and detailed operational diagnostics are blocked when logged out.

## Explicit Deferrals

- OpenVPN bridge creation and verification (Phase 29)
- WireGuard support (v2)
- multi-user roles
- SSO/OIDC
- HTTPS certificate management
- public internet support
- audit logs
- password reset via email or external identity

## Rationale

Phase 20 made the dashboard capable of destructive Transmission actions, including remove-with-delete. A LAN-only assumption and an internal bearer token are not enough for that surface. Phase 28 adds the minimum real owner security model while keeping v1 appliance-shaped: one local owner, daemon-owned durable auth state, web-issued sessions, no public-internet promise.
