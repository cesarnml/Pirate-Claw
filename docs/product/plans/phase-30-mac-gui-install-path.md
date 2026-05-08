# Phase 30: Mac GUI Install Path

**Delivery status:** Not started — product definition only; no `docs/product/delivery/phase-30/` implementation plan until tickets are approved.

Phase 30 delivers a first-class Mac install experience equivalent to what Phase 27 delivered for Synology DSM 7.1. Phase 26 established the Mac always-on supervisor contract and deployment posture. Phase 30 turns that contract into a guided, GUI-only install path — no terminal commands required after the initial binary placement.

## TL;DR

**Goal:** let a Mac operator install Pirate Claw as a persistent always-on service through a GUI-only flow, mirroring the DSM-first install quality of Phase 27.

**Ships:** GUI-guided Mac installer flow, launchd service registration, first-run cold-start validation, and documented Mac reference install path.

**Defers:** App Store packaging, native menu-bar app, Mac-specific VPN bridge UI differences from Phase 29 Synology path, cross-platform installer abstraction.

## Phase Goal

Phase 30 should leave Pirate Claw in a state where:

- a Mac operator installs Pirate Claw as a persistent launchd service without opening Terminal after the initial setup step
- the install flow matches the quality bar set by Phase 27: guided, browser-confirmed, no hand-edited config files
- cold-start validation (daemon reachability, config presence, Transmission RPC) runs in the browser after install
- the Mac install path is documented and screenshots are captured for the reference flow
- owner security (Phase 28) and VPN bridge (Phase 29) work correctly under the Mac launchd-managed deployment shape

## Committed Scope

_To be defined during grill-me session before Phase 30 ticket creation._

Anticipated areas:

- GUI installer artifact or guided setup script that registers the launchd plist
- browser-confirmed cold-start health check equivalent to Phase 27 DSM validation
- launchd service lifecycle (start, stop, restart) exposed through the Pirate Claw web UI
- Mac-specific path conventions documented (config root, media path defaults)
- reference install screenshots

## Explicit Deferrals

- App Store or Sparkle auto-update packaging
- native menu-bar or dock app
- Mac-specific VPN GUI divergence from Phase 29 (same flow, different topology notes if needed)
- Windows or Linux always-on packaging
- broad UI/UX polish (Phase 34)

## Exit Condition

A Mac operator follows a documented GUI-only install path, ends up with a launchd-managed Pirate Claw service, confirms health in the browser, and has the same "no hand-edited config files after install" guarantee as the Synology DSM reference path.

## Rationale

Phase 26 proved the Mac deployment posture is credible and documented the supervisor contract. Phase 27 proved the guided install pattern for Synology. Phase 30 applies the Phase 27 install quality to the Mac target so both primary deployment shapes ship with equivalent guided-install experiences before v1.
