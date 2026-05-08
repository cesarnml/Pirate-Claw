# Phase 29 — OpenVPN Bridge for Bundled Transmission

> Harden the bundled downloader network path: close P28 security carry-overs, then deliver a guided OpenVPN bridge via gluetun for DSM-first owners on both DSM 7.1 and DSM 7.2+.

## Epic

Phase 29 is a standalone phase. It closes the P28 CSRF gap, delivers the VPN bridge topology, and completes the last DSM 7.1 hardware validation before the operator upgrades to DSM 7.2.1.

## Product contract

- [`docs/product/plans/phase-29-openvpn-bridge-for-bundled-transmission.md`](../../plans/phase-29-openvpn-bridge-for-bundled-transmission.md)

## Grill-Me decisions locked

- **CSRF/`allowedOrigins` wiring → env var in generated Compose YAML.** Daemon reads `trusted-origins.json` at VPN config save and writes `ALLOWED_ORIGINS` (space-separated) into the generated compose artifacts. SvelteKit reads it at container start. Restart required to pick up new origins — this is documented behavior. No custom hooks I/O; compose encodes the runtime contract.
- **DSM 7.1 spike → pure research gate (P29.01).** No code changes. Findings documented in ticket rationale. DSM 7.1 UI copy (GUI-apply path or SSH-fallback path) is written in P29.05 after the answer is known.
- **VPN credential storage → two separate endpoints.** `POST /api/vpn/profile` handles `.ovpn` upload; `POST /api/vpn/credentials` handles username/password. Independent update paths so credentials can be rotated without re-uploading the profile.
- **Compose artifact generation → on save.** Daemon generates both `compose.synology.vpn.yml` and `compose.synology.direct.yml` on every profile or credential save. `GET /api/vpn/compose/vpn` and `GET /api/vpn/compose/direct` serve the pre-generated files; 404 if no profile has been saved yet.
- **VPN verification → one-shot synchronous.** `POST /api/vpn/verify` checks gluetun health + Transmission RPC reachability in a single HTTP response (10s timeout). "Try again" is the operator's responsibility if gluetun is slow to start. Consistent with the existing `GET /api/install-health` pattern.
- **Carry-overs → single bundled prerequisite PR (P29.02).** CSRF wiring, Plex PIN callback, `isStarter` routing, and debug logging ship as one coherent "P28 debt closure" PR. All VPN tickets gate on it.
- **Daemon VPN → schema ticket then endpoint ticket.** P29.03 delivers config types and file path helpers (no HTTP surface). P29.04 depends on it and delivers all HTTP endpoints + compose generation.
- **Web VPN UI → single full-page ticket (P29.05).** The complete Downloader Network route (form, save, download, verify, status) ships as one coherent user story.
- **Debug logging → mandatory on all critical paths.** P29.02, P29.04, and P29.05 each carry an explicit Review Focus requirement: every critical path (CSRF origin wiring, VPN file writes, compose generation, gluetun health check, Transmission RPC verify) must emit a structured log line at key decision points so P29.06 hardware validation can surface failures without SSH access.

## Ticket Order

1. `P29.01 DSM 7.1 VPN Apply Spike`
2. `P29.02 P28 Carry-Over Prerequisites`
3. `P29.03 VPN Config Types and File Path Helpers`
4. `P29.04 VPN Daemon Endpoints and Compose Artifact Generation`
5. `P29.05 Downloader Network Web UI`
6. `P29.06 DS918+ Exit Validation`
7. `P29.07 Docs and Phase Exit`

## Ticket Files

- `ticket-01-dsm71-vpn-apply-spike.md`
- `ticket-02-p28-carry-over-prerequisites.md`
- `ticket-03-vpn-config-types-and-file-paths.md`
- `ticket-04-vpn-daemon-endpoints-and-compose-generation.md`
- `ticket-05-downloader-network-web-ui.md`
- `ticket-06-ds918-exit-validation.md`
- `ticket-07-docs-and-phase-exit.md`

## Exit Condition

A DSM-first owner on either DSM 7.1 or DSM 7.2+ can:

1. Open Pirate Claw from both their LAN IP and Tailscale mesh IP — form submissions work from both (CSRF gap closed)
2. Upload an `.ovpn` profile and enter VPN credentials without those credentials appearing in any JSON config file or Compose YAML
3. Download a daemon-generated VPN Compose artifact and apply it via DSM GUI with no terminal commands (or via documented SSH steps on DSM 7.1 if GUI apply is not feasible)
4. Click "Verify VPN connection" and see `vpn_bridge_active` when gluetun and Transmission RPC are healthy
5. Download a rollback artifact (`compose.synology.direct.yml`) and revert to direct mode via DSM GUI
6. Complete a full fresh-install validation on DS918+ DSM 7.1 — the last DSM 7.1 hardware validation before upgrading to DSM 7.2.1

## CI Baseline

> Baseline recorded: 2026-05-09 — **pass** — 17 test files, 146 tests, 0 failures (daemon + web)

Run `bun run ci` on `main` to confirm before starting P29.02.

## Review Rules

- Tickets must be merged in order, with the exception that P29.01 (pure research, no code) may land in parallel with P29.02 development.
- Each ticket PR must pass CI before the next ticket starts.
- Pre-existing CI failures documented in **CI Baseline** above do not block a ticket; newly introduced failures do.
- P29.03 must be merged before P29.04 branch is opened.
- P29.04 must be merged before P29.05 branch is opened.
- P29.01 findings must be recorded before P29.05 is merged (DSM 7.1 UI copy depends on the spike answer).
- P29.05 must be merged before P29.06 begins.

## Explicit Deferrals

- **WireGuard:** v2; requires different gluetun config and a different profile upload UX
- **BYO Transmission VPN management:** operator-owned if they use an external Transmission instance
- **Docker socket / Container Manager mutation from Pirate Claw:** remains deferred; operator always applies artifacts via DSM GUI
- **VPN-provider account signup or automation:** out of scope; owner provides their own `.ovpn` profile
- **VPN exit IP attribution check:** deferred to v2 hardening; gluetun `/v1/publicip/ip` is the implementation path when ready
- **Public-internet Pirate Claw exposure:** not supported; Tailscale or LAN only
- **Dynamic `allowedOrigins` without restart:** origins added after daemon start require restart; fully dynamic request-time CSRF middleware is v2
- **DSM 7.2.1 upgrade:** happens after P29 ships; Phase 30+ targets DSM 7.2.1

## Stop Conditions

- Broken CI that cannot be resolved within the ticket scope
- DSM 7.1 spike (P29.01) reveals that GUI apply is impossible AND a workable SSH fallback is unclear — surface before writing DSM 7.1 UI copy
- Gluetun API contract differs materially from the health endpoint assumed in P29.04 — spike the actual endpoint before implementing verify
- Any discovery that the CSRF `ALLOWED_ORIGINS` env var approach is not supported by the SvelteKit version in use — surface immediately, do not work around silently

## Phase Closeout

Retrospective: required
Why: P29 is a DSM 7.1 hardware gate, introduces the VPN topology contract, closes the CSRF security gap, establishes the multi-origin trust model, and creates durable assumptions for P30+.
Trigger: Developer approval of final PR merge (P29.07).
Artifact: `notes/public/phase-29-openvpn-bridge-retrospective.md`
