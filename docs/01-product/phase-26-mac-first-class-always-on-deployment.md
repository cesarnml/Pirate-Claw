# Phase 26: Mac First-Class Always-On Deployment

**Delivery status:** Not started — product definition only; no `docs/02-delivery/phase-26/` implementation plan until tickets are approved.

Phase 26 makes Mac a first-class always-on deployment target for Pirate Claw. The immediate pressure is local dev-server testing, but the product stance should also support credible 24/7 use on Mac Mini and Mac Studio installs without treating them as accidental edge cases.

## TL;DR

**Goal:** make always-on Pirate Claw on macOS feel like a supported deployment shape, not a developer workaround.

**Ships:** documented and validated Mac supervisor contract, first-class restart/lifecycle expectations on macOS, and operator guidance for credible always-on deployment on Mac hardware.

**Defers:** App Store packaging, native macOS GUI packaging, and cross-platform supervisor abstraction beyond supported deployment targets.

## Phase Goal

Phase 26 should leave Pirate Claw in a state where:

- macOS is a supported always-on deployment target, not just a local development environment
- a Mac operator can run Pirate Claw continuously with a documented supervisor contract instead of hand-managed shells
- restart-backed product behavior has a truthful macOS story alongside the Synology reference path
- Mac Mini and Mac Studio deployments fit the same "no hand-edited Pirate Claw files after install" promise as the Synology story

## Committed Scope

### macOS supervisor contract

- define the supported macOS always-on process model
- document what Pirate Claw expects from the Mac-side supervisor after `SIGTERM` or equivalent restart events
- validate the reference flow on a real Mac deployment shape, not only in theory

### Deployment guidance

- provide operator-facing guidance for credible 24/7 Mac deployment
- make path, launch, restart, and persistence expectations explicit
- distinguish supported reference posture from looser developer-only shortcuts

### Product alignment

- ensure restart-backed browser flows remain truthful when the daemon is running under the supported macOS always-on contract
- keep the Mac contract within Pirate Claw's product boundary rather than widening into unrelated desktop-app packaging

## Explicit Deferrals

- broad UX/UI polish outside deployment/lifecycle work (Phase 27)
- v1 release/versioning ceremony (Phase 28)
- native GUI app packaging or menu-bar app work
- generic supervisor abstraction for every Linux distro or NAS
- one-click installer marketplaces

## Exit Condition

Pirate Claw has a documented, validated, and supportable always-on macOS deployment story that works for both local dev-server continuity and real 24/7 Mac hardware installs, without requiring routine shell babysitting or hand-edited Pirate Claw config files after install.

## Rationale

Synology remains the reference home, but that should not force macOS into a permanent second-class role. The repo already depends on Mac for active development, and the same hardware profile that makes a Mac useful for development also makes Mac Mini and Mac Studio credible always-on hosts. Treating that deployment shape explicitly keeps the product honest and prevents "works on my dev box" from being the only Mac story Pirate Claw can tell.
