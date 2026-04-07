# `P6.03 Transmission Container Baseline`

## Goal

Document and validate the always-on Transmission container baseline that Pirate Claw will depend on in the Synology runbook.

## Why This Ticket Exists

Phase 06 owns the full Pirate Claw + Transmission operator baseline. Transmission needs its own thin ticket because its storage, networking, and verification path are distinct from Pirate Claw's daemon and config concerns.

## Scope

- document the Container Manager steps for the validated Transmission baseline
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
