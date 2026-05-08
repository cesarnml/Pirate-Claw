# Phase 29: OpenVPN Bridge for Bundled Transmission

**Delivery status:** Product plan approved — pending ticket decomposition. No `docs/product/delivery/phase-29/` implementation plan until tickets are approved.

Phase 29 hardens the bundled downloader network path. Pirate Claw should be usable immediately after Phase 27 in direct mode, but the release-quality Synology appliance must guide owners toward a VPN-backed bundled Transmission topology. VPN security for torrent traffic is not optional — it is a product requirement. This is also the last Phase validated on DSM 7.1 (DS918+); after P29 ships the operator upgrades to DSM 7.2.1 in preparation for Phase 31. Phases 30 and onward must not break DSM 7.1 compatibility until that upgrade lands.

## TL;DR

**Goal:** Let a DSM-first owner configure an OpenVPN-backed downloader bridge for bundled Transmission through Pirate Claw and DSM GUI flows, on both DSM 7.1 and DSM 7.2+.

**Ships:**

- P28 carry-over fixes: CSRF/`allowedOrigins` wiring, Plex PIN callback redirect, `isStarter` routing cleanup
- Multi-origin support: both LAN IP and Tailscale mesh IP as full-write trusted origins
- Debug logging in SvelteKit server and daemon for fresh-install validation
- Gluetun as first-class install-stack service — always present, single compose artifact, no post-install network migration
- DSM 7.1 VPN apply path spike finding: no Network tab in Docker GUI Edit dialog, no Compose Project support in legacy Docker package; install-time container creation is the correct model
- OpenVPN profile upload and VPN credential storage (mounted file, never in Compose YAML)
- `gluetun` bridge — passthrough until VPN credentials saved and verified; UI shows "VPN not configured" banner and disables queueing
- Operator-triggered VPN verification: gluetun health + Transmission RPC
- DSM 7.2+ Container Manager Compose Project path for VPN topology apply
- DSM 7.1 individual container creation path via legacy Docker GUI (fresh install only; no compose Project tab)

**Defers:** WireGuard (v2), arbitrary BYO Transmission VPN management, public VPN-provider account automation, direct Docker socket mutation from Pirate Claw web, VPN exit IP attribution check (v2).

---

P28 shipped owner auth as a stable baseline. P29 closes the remaining P28 carry-overs first (CSRF gap, Plex redirect, routing cleanup), then delivers the VPN bridge. The CSRF fix is a prerequisite: without it, form-submission flows from a secondary trusted origin (e.g. Tailscale address) will fail mid-VPN-setup.

## Phase Goal

Phase 29 should leave Pirate Claw in a state where:

- P28 CSRF gap is resolved: `allowedOrigins` is wired from `trusted-origins.json` at daemon startup; both LAN IP and Tailscale IP are recognized as full-write origins
- The owner can upload an OpenVPN profile from the browser
- VPN credentials are stored in daemon-owned secret state (mounted file), never in JSON config or Compose YAML
- VPN bridge applies only to the bundled Transmission stack via a daemon-generated Compose artifact
- Gluetun is always in the install stack — Transmission and daemon are reachable immediately after fresh install (gluetun passthrough); UI shows "VPN not configured" banner and disables queueing until credentials are saved and verified
- DSM 7.1: operator creates containers individually via the legacy Docker GUI (gluetun first to establish the bridge network, then Transmission and pirate-claw containers attached) — no post-install network migration, no SSH required
- DSM 7.2+: operator applies `compose.synology.yml` via Container Manager Projects; single compose includes gluetun always
- After install, the owner enters VPN credentials in the Downloader Network settings page, clicks "Verify VPN connection", and Pirate Claw confirms gluetun health + Transmission RPC reachability
- Rollback = clear VPN credentials in UI; gluetun continues running in passthrough; no second compose artifact
- Direct downloader mode remains available with explicit risk acknowledgement (P28 baseline)
- SvelteKit server and daemon emit structured debug logs sufficient to diagnose fresh-install failures without SSH access
- Plex PIN callback redirects to the correct post-auth destination
- `isStarter` layout guard exclusion list is not hard-coded; auth-flow routing is defensible

## Committed Scope

### P28 Carry-Over Prerequisites

- **CSRF / `allowedOrigins` wiring:** Read `trusted-origins.json` at daemon startup and inject into SvelteKit's `allowedOrigins`. Operator is prompted during onboarding to register both LAN IP and Tailscale mesh IP. Both receive full write access. New origins added post-start require daemon restart to take effect (documented behavior).
- **Plex PIN callback redirect fix:** Callback returns to `/onboarding` when the originating flow is onboarding, not unconditionally to `/login`.
- **`isStarter` routing:** Audit-route exclusion list is config-driven or at minimum not silently brittle. Any new auth-flow route must have both a `load` function and a form action.
- **Debug logging:** SvelteKit server and daemon emit structured request/lifecycle debug logs at a configurable log level. Logs must be sufficient to diagnose fresh-install failures without SSH access to the NAS.

### VPN Profile and Credential Management

- Owner uploads `.ovpn` profile via Config → Downloader Network
- VPN username/password (if required by provider) entered in browser, stored by daemon as a gluetun-format credential file
- File contract:
  ```text
  /volume1/pirate-claw/config/vpn/
    active-profile.ovpn
    credentials
    manifest.json
  ```
- Credentials never written to `pirate-claw.config.json` or any generated Compose YAML
- `pirate-claw.config.json` stores only non-secret network posture:
  ```json
  {
    "downloaderNetwork": {
      "mode": "vpn_bridge",
      "provider": "custom_openvpn",
      "profile": "active",
      "status": "pending_apply"
    }
  }
  ```

### Compose Artifact Generation

- Daemon generates a single `compose.synology.yml` — always includes gluetun; gluetun idles in passthrough until VPN credentials are configured
- Artifact downloadable from the browser (reference for DSM 7.2+ Container Manager Project apply)
- Generated artifact lives under:
  ```text
  /volume1/pirate-claw/config/generated/
    compose.synology.yml
  ```
- No `compose.synology.direct.yml` rollback artifact — "direct mode" is gluetun passthrough (clear credentials in UI)

### DSM 7.1 Apply Path

- **P29.01 spike finding (recorded):** DSM 7.1 legacy Docker package Edit dialog has only General / Port / Volume tabs — no Network tab. Compose Project support is not present in the legacy Docker package. Post-install network migration via GUI is not possible.
- **Correct model:** gluetun is part of the install stack from the outset. Operator creates all containers fresh via the legacy Docker GUI — gluetun first (which establishes the bridge network), then Transmission and pirate-claw containers attached to it. Network is specified at container creation time, which the GUI does support.
- No SSH fallback required. No compose Project tab required. Fresh install only — no in-place migration.

### DSM 7.2+ Apply Path

- Owner applies `compose.synology.vpn.yml` through Container Manager Project update/import via DSM GUI
- Rollback via `compose.synology.direct.yml` through the same flow

### Runtime Topology

Gluetun is always in the stack. Runtime topology has two states:

Passthrough (VPN credentials absent or unverified):

```text
pirate-claw-daemon -> gluetun (passthrough) -> bundled Transmission
```

VPN bridge (credentials saved and verified):

```text
pirate-claw-daemon -> gluetun VPN bridge -> bundled Transmission
```

The owner never sees or edits raw service hostnames. The UI shows:

- **VPN not configured** (banner, queueing disabled) — until credentials saved and verified
- **Bundled Transmission: VPN Bridge** — after `vpn_bridge_active` verified

### Verification Contract

After the operator applies the VPN Compose artifact in DSM GUI and returns to Pirate Claw:

1. Owner clicks **"Verify VPN connection"** button
2. Daemon checks gluetun HTTP health endpoint (`/v1/openvpn/status` or equivalent)
3. Daemon checks Transmission RPC reachability through the expected network path
4. UI shows one of: `vpn_bridge_active`, `vpn_bridge_unreachable`, `direct_mode`

IP attribution / exit IP check deferred to v2.

### Rollback

- Operator clears VPN credentials in the Downloader Network settings page
- Gluetun continues running in passthrough; Transmission remains reachable
- No compose teardown, no second compose artifact, no SSH required
- If VPN bridge is unreachable, queueing is disabled until the operator acts — this is the correct behavior; the operator is in control

## Explicit Deferrals

- **WireGuard:** v2; requires different gluetun config and a different profile upload UX
- **BYO Transmission VPN management:** operator-owned if they use an external Transmission instance
- **Docker socket / Container Manager mutation from Pirate Claw:** remains deferred; operator always applies artifacts via DSM GUI
- **VPN-provider account signup or automation:** out of scope; owner provides their own `.ovpn` profile
- **VPN exit IP attribution check:** deferred to v2 hardening; gluetun `/v1/publicip/ip` is the implementation path when ready
- **Public-internet Pirate Claw exposure:** not supported; Tailscale or LAN only
- **Dynamic `allowedOrigins` without restart:** origins added after daemon start require restart; fully dynamic request-time CSRF middleware is v2

## Exit Condition

A DSM-first owner on either DSM 7.1 or DSM 7.2+ can:

1. Open Pirate Claw in a browser from both their LAN IP and Tailscale mesh IP — form submissions work from both
2. Complete a fresh install with gluetun in the stack — Transmission and daemon are reachable immediately; UI shows "VPN not configured" banner
3. Upload an `.ovpn` profile, enter VPN credentials, and save without exposing secrets in any config file or Compose YAML
4. Click "Verify VPN connection" and see `vpn_bridge_active` when gluetun and Transmission RPC are healthy; queueing enabled
5. Clear VPN credentials to return to passthrough (gluetun stays in stack; no compose teardown needed)
6. Complete a full fresh-install validation on DS918+ DSM 7.1 — the last DSM 7.1 hardware gate before upgrading to DSM 7.2.1

## Retrospective

`required` — P29 is a DSM 7.1 hardware gate, introduces the VPN topology contract, closes the CSRF security gap, and establishes the multi-origin trust model. All of these change operator workflow and create assumptions for P30+.

- Transmission can write downloads/media paths
- daemon can authenticate to Transmission
- downloader network state matches the expected mode
- public IP check if available and reliable
- failure state includes rollback guidance

## Documentation and Screenshots

Phase 29 requires browser and DSM screenshots for supported apply/rollback paths.

Browser screenshots:

- Downloader Network page
- OpenVPN upload
- credential entry
- direct-mode warning/acknowledgement
- artifact download/apply instructions
- VPN verification success/failure
- rollback artifact

DSM screenshots:

- DSM 7.1 package update/reconfigure/apply flow, if supported
- DSM 7.2+ Project update/import flow
- stop/start project where required
- rollback path

## Exit Condition

A DSM-first owner can configure an OpenVPN bridge for bundled Transmission without SSH, Docker CLI, manual JSON edits, manual `.env` edits, or manual Docker container edits. Pirate Claw stores VPN material outside JSON config, generates or applies the DSM GUI artifact, verifies the resulting downloader topology, and provides a clear rollback path.

## Explicit Deferrals

- WireGuard support (v2)
- VPN-provider-specific account automation
- BYO Transmission VPN management
- automatic Docker/Container Manager mutation through a privileged web app
- public-internet Pirate Claw support
- mandatory VPN enforcement before any queueing

## Reshape Rationale (post-approval, pre-P29.02)

P29.01 hardware spike on DS918+ DSM 7.1.1 confirmed: the legacy Docker GUI Edit dialog has no Network tab — network cannot be changed on an existing container. The original plan assumed a post-install compose migration that was blocked by this DSM limitation.

Grill-me decisions locked during reshape:

- **Gluetun always in stack** — single compose artifact; gluetun always present; passthrough until credentials configured. No opt-in branching at install time.
- **Transmission in passthrough until VPN verified** — stack is immediately reachable after install; UI shows "VPN not configured" banner and disables queueing.
- **No migration path** — single operator, always fresh install. Upgrade compat not a concern for P29.
- **VPN config = standalone settings page** — not in setup wizard; "VPN not configured" banner drives operator there when ready.
- **No rollback artifact** — `compose.synology.direct.yml` dropped; rollback = clear credentials in UI; gluetun idles in passthrough.
- **P29.06 exit validation scope** — fresh install on DSM 7.1, gluetun stack up, credentials saved, verify returns `vpn_bridge_active`, download queued. Last DSM 7.1 gate before upgrade.

## Rationale

A direct bundled Transmission path is useful for cold start, but it is not the downloader posture many end users expect from a media-ingestion appliance. Phase 29 makes VPN hardening a guided product flow while preserving the DSM-first contract. The owner supplies provider-specific OpenVPN material; Pirate Claw owns the storage, topology, verification, and rollback story for its bundled Transmission stack.
