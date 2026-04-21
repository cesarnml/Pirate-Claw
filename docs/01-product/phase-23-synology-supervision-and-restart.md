# Phase 23: Synology Supervision and Restart Completion

**Delivery status:** Not started — product definition only; no `docs/02-delivery/phase-23/` implementation plan until tickets are approved.

Phase 23 closes the deployment loop on Synology, which is Pirate Claw's reference home. Browser-driven setup and config changes are not complete product behavior until restart-backed changes can be applied reliably under Synology supervision.

## TL;DR

**Goal:** UI-driven setup and config changes can request a daemon restart and trust Pirate Claw to come back correctly on Synology.

**Ships:** explicit supervision contract; dependable restart-on-`SIGTERM` behavior; UI status for restart requests and completion; validated Synology reference flow; Synology-specific guidance for custom Transmission compatibility and Plex Media Server version/support reality; restart-backed completion of bundled downloader/VPN choices and Plex auth state.

**Defers:** one-click installation packaging, non-Synology platform abstraction, and deep daemon hot-reload redesign.

## Phase Goal

Phase 23 should leave Pirate Claw in a state where:

- the Synology deployment story is a first-class product contract, not just a runbook habit
- restart-required setup/config changes can be applied from the UI without SSH
- `POST /api/daemon/restart` plus Synology supervision behave predictably enough to be trusted by operators
- Pirate Claw can be treated as a self-service NAS app rather than a browser shell over a manually tended daemon
- the Synology story distinguishes supported **reference baseline** from allowed **operator-managed compatible services**
- the Synology story is explicit when package-center defaults lag Pirate Claw's documented Plex compatibility contract
- restart-backed setup remains truthful even when the operator chose the bundled Transmission + VPN path or enabled Plex through the browser-managed auth flow

## Committed Scope

### Supervision Contract

- formalize the reference Synology supervision model for the daemon
- define what Pirate Claw expects after `SIGTERM` and what the supervisor must guarantee
- remove ambiguity around "restart offer" versus "actual product-supported restart path"

### Restart UX Completion

- UI restart flows must surface `requested`, `restarting`, `back online`, and `failed to return` states clearly
- setup/onboarding completion may depend on restart where required, but the operator should stay inside the browser flow
- restart behavior must be validated against the documented Synology reference deployment
- if bundled downloader/VPN choices require restart-backed application, that state must be visible and recoverable from the browser
- if Plex auth/version compatibility is accepted in setup, restart-backed flows must not silently drop the operator back into a manual token/file-edit path

### Runbook/Product Alignment

- the current runbook and the product contract must say the same thing about restart behavior
- any Synology-specific requirements needed for restart reliability should be made explicit and reviewable

### Synology Service Reality

- the Synology reference deployment remains the reviewed baseline for Pirate Claw itself
- operators may still point Pirate Claw at a pre-existing compatible Transmission endpoint instead of the bundled downloader topology
- the product/runbook should describe that as a supported compatibility path with a weaker "operator-managed" support posture, not as an invalid setup
- Plex integration on Synology must document both the **API compatibility floor** and the **package-distribution reality**
- on the observed `DS918+ / DSM 7.1.1-42962 Update 9` baseline (captured 2026-04-21), Synology Package Center surfaced Plex Media Server `1.41.5.9626` as the newest online version, while Plex's own Synology DSM 7 download path offered PMS `1.43.1.10611`
- because the official Plex PMS API `1.2.0` contract is documented as supported in PMS `>= 1.43.0`, the out-of-the-box Synology package-center version on that baseline is below Pirate Claw's documented Plex compatibility floor
- manual PMS install through Synology's Package Center GUI remains a supported operator path and should be documented as the expected remediation when the vendor-packaged Plex build lags behind the required API version
- if Pirate Claw adopts Plex's recommended JWT authentication flow in Phase 22, Phase 23 must ensure the Synology-facing product story preserves that browser-managed auth state across the restart/supervision path

## Exit Condition

An operator can save restart-backed settings from the browser, request a daemon restart, and trust Pirate Claw to return under Synology supervision without opening a shell or manually babysitting the process.

If the operator enables Plex, the Synology-facing product story also tells them plainly whether their installed PMS version satisfies Pirate Claw's documented Plex API compatibility contract, and what supported remediation path exists when it does not.

## Explicit Deferrals

- full hot reload of all daemon settings without restart
- generic supervisor abstraction for every NAS or Linux distro
- marketplace installers, package feeds, or click-to-install distribution
- re-architecting the daemon away from the current process model solely to avoid restart semantics
- automatic upgrade management for third-party Synology packages such as Plex Media Server

## Rationale

Phase 16 introduced restart offers and Phase 06 documented Synology operation, but the system still relies on an operator mentally bridging those pieces. Phase 23 turns that bridge into product behavior. If setup/config changes can only be applied reliably by an operator who understands Synology task supervision and SSH fallback, Pirate Claw is still acting like an advanced tool rather than a finished local product.

The same standard applies to adjacent services. If Pirate Claw claims a Synology-friendly story while omitting the fact that a stock Package Center Plex build may lag below the documented PMS API floor, then the product contract is incomplete. Phase 23 should make that reality explicit and route the operator toward supported remediation rather than leaving them to infer it from broken integration.

The same is true for the last restart-backed edges of setup. If browser-only onboarding says it can configure bundled Transmission + VPN or connect Plex without manual token spelunking, then the supervised Synology flow must carry those choices through restart cleanly. Otherwise the browser-only claim still leaks hidden operator work.
