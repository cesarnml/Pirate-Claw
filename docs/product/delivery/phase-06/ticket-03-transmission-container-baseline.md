# `P6.03 Transmission Container Baseline`

## Goal

Document and validate the always-on Transmission container baseline that Pirate Claw will depend on in the Synology runbook.

## Why This Ticket Exists

Phase 06 owns the full Pirate Claw + Transmission operator baseline. Transmission needs its own thin ticket because its storage, networking, and verification path are distinct from Pirate Claw's daemon and config concerns.

## Scope

- document the Docker package steps for the validated Transmission baseline
- validate that Transmission runs continuously against the Phase 06 bind-mounted paths
- capture the network and operator checks needed to confirm the Transmission baseline is healthy on the local-LAN-first setup
- add only the operator-facing verification cues to the canonical runbook
- capture proof artifacts and any UI-dependent evidence in the ticket rationale

## Out Of Scope

- Pirate Claw container creation
- Pirate Claw daemon behavior
- Pirate Claw secret/env injection
- restart behavior beyond what is minimally required to prove the Transmission container baseline exists

## Rationale

- `Red first:` the runbook should prove the downstream dependency is stable before layering Pirate Claw on top of it.
- `Why this path:` a standalone Transmission baseline ticket keeps the operator journey honest and makes it easier to isolate future failures as downloader-side versus Pirate Claw-side.
- `Alternative considered:` a combined application-containers ticket was rejected because it would weaken the reviewability of both the downloader setup and the app-specific daemon validation.
- `Deferred:` Pirate Claw setup, shared secret handling, and broader lifecycle validation remain later tickets.
- `Validation result:` the target `DS918+ / DSM 7.1.1-42962 Update 9` NAS now has a running `linuxserver/transmission:latest` container with validated bind mounts, ports, restart policy, and a `200` curl health check. The canonical runbook Section 3 reflects the proven baseline.
- `DSM package naming:` DSM 7.1.x names the package `Docker`, not `Container Manager` (renamed in DSM 7.2). The runbook has been corrected to use the validated name.
- `Permission finding:` Synology shared folders default to restrictive ACLs that block container writes. The runbook now includes the required `chmod 755` / `chown` fix before first container start.
- `Storage layout addition:` the `linuxserver/transmission` image expects `/downloads/complete`; `media/downloads/complete` was added to the P6.02 storage layout to match.
