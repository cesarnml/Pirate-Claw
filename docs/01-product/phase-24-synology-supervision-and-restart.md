# Phase 24: Synology Supervision and Restart Completion

**Delivery status:** Not started — product definition only; no `docs/02-delivery/phase-24/` implementation plan until tickets are approved.

Phase 24 closes the deployment loop on Synology, which is Pirate Claw's reference home. Browser-driven setup and config changes are not complete product behavior until Pirate Claw can restart reliably under Synology supervision without losing its durable state boundary.

## TL;DR

**Goal:** Pirate Claw can restart predictably under Synology supervision while preserving its durable config and SQLite state boundary.

**Ships:** explicit supervision contract; dependable restart-on-`SIGTERM` behavior; validated Synology reference flow; durability guarantees for the writable config directory plus `pirate-claw.db`; truthful Synology guidance for custom Transmission compatibility and Plex Media Server version/support reality; minimal UI copy adjustments only where current restart language would otherwise overclaim.

**Defers:** in-browser restart round-trip proof, Mac first-class always-on deployment, one-click installation packaging, non-Synology platform abstraction, and deep daemon hot-reload redesign.

## Phase Goal

Phase 24 should leave Pirate Claw in a state where:

- the Synology deployment story is a first-class product contract, not just a runbook habit
- `POST /api/daemon/restart` plus Synology supervision behave predictably enough to be trusted as a restart contract
- the durable Pirate Claw boundary survives restart: writable config directory and `pirate-claw.db`
- Pirate Claw can be treated as a self-service NAS app for routine config changes rather than a browser shell over a manually tended daemon
- the Synology story distinguishes supported **reference baseline** from allowed **operator-managed compatible services**
- the Synology story is explicit when package-center defaults lag Pirate Claw's documented Plex compatibility contract
- restart-backed setup remains truthful when the operator enabled Plex through the browser-managed auth flow

## Committed Scope

### Supervision Contract

- formalize the reference Synology supervision model for the daemon
- define what Pirate Claw expects after `SIGTERM` and what the supervisor must guarantee
- remove ambiguity around "restart offer" versus "actual product-supported restart path"
- make the config mount and SQLite mount requirements explicit as one durability boundary

### Restart UX Completion

- restart behavior must be validated against the documented Synology reference deployment
- if Plex auth/version compatibility is accepted in setup, restart-backed flows must not silently drop the operator back into a manual token/file-edit path
- any UI changes in this phase are limited to copy or affordances required to keep the current product claims truthful; browser round-trip proof belongs to Phase 25

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
- Phase 24 must ensure the Synology-facing product story preserves the Phase 23 browser-managed Plex auth state across the restart/supervision path

## Exit Condition

Under the documented Synology reference deployment, an operator can save restart-backed settings from the browser, request a daemon restart, and trust Pirate Claw's durable state boundary to survive while Synology supervision brings the daemon back without manual babysitting.

If the operator enables Plex, the Synology-facing product story also tells them plainly whether their installed PMS version satisfies Pirate Claw's documented Plex API compatibility contract, and what supported remediation path exists when it does not.

## Explicit Deferrals

- full hot reload of all daemon settings without restart
- browser-visible restart round-trip proof and restart state machine
- generic supervisor abstraction for every NAS or Linux distro
- Mac `launchd` or other non-Synology always-on deployment contracts
- marketplace installers, package feeds, or click-to-install distribution
- re-architecting the daemon away from the current process model solely to avoid restart semantics
- bundled Transmission + VPN completion or lifecycle ownership
- automatic upgrade management for third-party Synology packages such as Plex Media Server

## Rationale

Phase 16 introduced restart offers and Phase 06 documented Synology operation, but the system still relies on an operator mentally bridging those pieces. Phase 24 turns that bridge into product behavior. If setup/config changes can only be applied reliably by an operator who understands Synology task supervision and SSH fallback, Pirate Claw is still acting like an advanced tool rather than a finished local product.

The same standard applies to adjacent services. If Pirate Claw claims a Synology-friendly story while omitting the fact that a stock Package Center Plex build may lag below the documented PMS API floor, then the product contract is incomplete. Phase 24 should make that reality explicit and route the operator toward supported remediation rather than leaving them to infer it from broken integration.

The same is true for the durability boundary introduced by earlier phases. Phase 21 promised zero hand-edited Pirate Claw files after install, Phase 22 moved setup into the browser, and Phase 23 added a SQLite-backed Plex auth identity alongside config-backed `plex.token`. Phase 24 therefore has one clean job: make Synology supervision preserve that Pirate Claw-owned state boundary truthfully. Browser-side restart proof and richer restart UX belong in the next phase.
