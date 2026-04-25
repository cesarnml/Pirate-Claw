# Phase 29: OpenVPN Bridge for Bundled Transmission

**Delivery status:** Not started — product definition only; no `docs/02-delivery/phase-29/` implementation plan until tickets are approved.

Phase 29 hardens the bundled downloader network path. Pirate Claw should be usable immediately after Phase 27 in direct mode, but the release-quality Synology appliance should guide owners toward a VPN-backed bundled Transmission topology without requiring terminal commands.

## TL;DR

**Goal:** let a DSM-first owner configure an OpenVPN-backed downloader bridge for bundled Transmission through Pirate Claw and DSM GUI flows.

**Ships:** OpenVPN profile upload, VPN credential storage, bundled-Transmission-only VPN topology, `gluetun` bridge, generated DSM artifacts for DSM 7.1 and DSM 7.2 paths, rollback artifacts, and VPN health verification.

**Defers:** WireGuard (v2), arbitrary BYO Transmission VPN management, public VPN-provider account automation, direct Docker socket mutation from Pirate Claw web.

## Phase Goal

Phase 29 should leave Pirate Claw in a state where:

- the owner can upload an OpenVPN profile from the browser
- VPN credentials are stored in daemon-owned secret state, never JSON config
- VPN bridge applies only to the bundled Transmission stack
- DSM 7.1 owners do not hand-edit Docker containers
- DSM 7.2+ owners receive/update a Compose Project artifact through DSM GUI
- Pirate Claw verifies VPN/container health and Transmission RPC after the topology change
- rollback to direct bundled Transmission is clear and DSM-GUI-only
- direct downloader mode remains available with explicit acknowledgement for owners who cannot or do not want to use VPN

## Scope Boundary

Phase 29 supports:

- OpenVPN profiles (`.ovpn`)
- bundled Transmission from the Phase 27 stack
- `gluetun` as the VPN network bridge
- DSM GUI apply/rollback

Phase 29 does not support:

- WireGuard
- BYO Transmission VPN management
- arbitrary Docker topology editing
- direct Docker socket or Container Manager mutation from the web app
- VPN-provider account signup
- public-internet Pirate Claw exposure

If a user connects Pirate Claw to an existing Transmission instance outside the supported DSM-first stack, securing that Transmission traffic is operator-owned.

## Browser Flow

The authenticated owner flow:

1. Open Config → Downloader Network.
2. Choose VPN bridge.
3. Upload `.ovpn`.
4. Enter VPN username/password if required by the profile/provider.
5. Save VPN profile and credentials.
6. Download or prepare the DSM apply artifact.
7. Apply through DSM GUI.
8. Return to Pirate Claw.
9. Verify VPN health, Transmission RPC, and downloader network state.
10. Keep rollback artifact available.

Direct mode remains a first-class state, but it requires explicit risk acknowledgement from Phase 28.

## Secret and File Contract

VPN material lives under daemon-owned app-managed state:

```text
/volume1/pirate-claw/config/vpn/
  active-profile.ovpn
  credentials
  manifest.json
```

Generated artifacts may live under:

```text
/volume1/pirate-claw/config/generated/
  compose.synology.direct.yml
  compose.synology.vpn.yml
```

Generated Compose files should reference mounted secret/profile files where possible and avoid inlining raw VPN passwords.

`pirate-claw.config.json` stores only non-secret network posture:

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

## DSM 7.1 Package Path

For the validated DSM 7.1 `.spk` owner path, Docker remains hidden behind the Pirate Claw package.

The intended apply path is Package Center based:

- package repair/reconfigure/update if Synology tooling supports it
- or a generated `.spk` update artifact if that is the only DSM GUI mechanism

The owner must not be asked to manually edit Docker containers in the legacy Docker GUI.

If Synology package tooling cannot update the VPN topology through DSM GUI without manual Docker edits, Phase 29 must either:

- defer DSM 7.1 VPN support explicitly, or
- delay v1 until the DSM-first VPN apply path is solved

## DSM 7.2+ Container Manager Path

For modern DSM systems, Pirate Claw generates a VPN-enabled Project/Compose artifact:

```text
compose.synology.vpn.yml
```

The owner applies it through Container Manager Project update/import, then starts the project through DSM GUI. Pirate Claw also provides a direct-mode rollback artifact.

## Runtime Topology

Direct mode:

```text
pirate-claw-daemon -> bundled Transmission
```

VPN bridge mode:

```text
pirate-claw-daemon -> VPN bridge endpoint -> bundled Transmission
```

Implementation may resolve the internal RPC URL differently in direct and VPN modes. The owner should never see or edit raw service hostnames. The UI shows:

- Bundled Transmission: Direct
- Bundled Transmission: VPN Bridge

## Verification Contract

After apply/restart, Pirate Claw verifies:

- VPN bridge service/container is healthy
- Transmission RPC is reachable through the expected VPN topology
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

## Rationale

A direct bundled Transmission path is useful for cold start, but it is not the downloader posture many end users expect from a media-ingestion appliance. Phase 29 makes VPN hardening a guided product flow while preserving the DSM-first contract. The owner supplies provider-specific OpenVPN material; Pirate Claw owns the storage, topology, verification, and rollback story for its bundled Transmission stack.
