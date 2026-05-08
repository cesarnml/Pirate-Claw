# Phase 31: Synology DSM 7.2.1 Container Manager Install Path

**Delivery status:** Not started — product definition only; no `docs/product/delivery/phase-31/` implementation plan until tickets are approved.

Phase 31 adds a preferred Synology install path using DSM 7.2.1 Container Manager. The DSM 7.1 Docker GUI path from Phase 27 required ~30 manual steps. Container Manager's Compose Project import collapses this to roughly a dozen GUI actions with no terminal and no hand-edited files.

## TL;DR

**Goal:** cut the Synology install step count from ~30 to ~12 using DSM 7.2.1 Container Manager's Compose Project import flow.

**Ships:** Compose Project artifact for Container Manager, updated cold-start validation for the 7.2.1 path, and documented side-by-side install matrix (DSM 7.1 Docker GUI vs. DSM 7.2.1 Container Manager).

**Defers:** dropping DSM 7.1 Docker GUI support, WireGuard VPN path, Container Manager auto-update hooks.

## Phase Goal

Phase 31 should leave Pirate Claw in a state where:

- a DSM 7.2.1 owner installs Pirate Claw by importing a Compose Project artifact through Container Manager GUI — no SSH, no terminal, no hand-edited files
- the Container Manager path is the recommended Synology install path going forward
- DSM 7.1 Docker GUI path from Phase 27 remains supported but is documented as the legacy path
- Phase 29 VPN bridge artifacts include a Container Manager variant
- cold-start validation and browser-confirmed health checks work identically on DSM 7.2.1

## Committed Scope

_To be defined during grill-me session before Phase 31 ticket creation._

Anticipated areas:

- `compose.synology.container-manager.yml` artifact generation
- Container Manager Project import, start, and update flow screenshots
- updated Phase 27 runbook to note DSM 7.2.1 as preferred path
- VPN bridge Compose artifact variant for Container Manager (coordinates with Phase 29)
- install step count comparison documented

## Explicit Deferrals

- dropping or deprecating DSM 7.1 Docker GUI support before v1
- Container Manager API automation (still GUI-only, no privileged web socket)
- WireGuard VPN support (v2)
- Synology Package Center distribution

## Exit Condition

A DS918+ (or equivalent) running DSM 7.2.1 can install Pirate Claw via Container Manager in ~12 GUI steps with no terminal. The DSM 7.1 path continues to work. Both paths are documented in the install matrix.

## Rationale

The Phase 27 DSM 7.1 install path works but is long. DSM 7.2.1 Container Manager's Compose Project import is purpose-built for this workflow. The operator upgrades DSM to 7.2.1 once; Pirate Claw provides the artifact. The step reduction is significant enough to make this the preferred Synology path before v1.
