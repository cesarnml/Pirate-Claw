# `P6.07 Upgrade Path`

## Goal

Document and validate the supported path for moving from one known-good Pirate Claw image/config state to the next without losing the Synology baseline.

## Why This Ticket Exists

Upgrade behavior is a separate operator concern from restart behavior. The runbook needs one concrete, validated answer for how a later image tag should be adopted once the baseline is already live.

## Scope

- document the supported upgrade procedure for the canonical Pirate Claw image reference and tag convention
- validate that the baseline survives a bounded image-tag replacement without losing durable state or operator clarity
- document the operator checks that confirm the upgraded baseline is still healthy
- keep raw upgrade evidence and caveats in the ticket rationale while adding only the operator-facing steps to the canonical runbook

## Out Of Scope

- building images on the NAS
- generalized image-source matrices
- backup and restore automation
- remote-access concerns

## Rationale

- `Red first:` a validated runbook should answer how an operator changes the known-good image tag without guessing.
- `Why this path:` isolating upgrades from restart semantics makes the operational continuity claims more precise and prevents the runbook from quietly assuming “restart” and “upgrade” are the same thing.
- `Alternative considered:` folding upgrades into the restart ticket was rejected because image replacement adds its own state, configuration, and operator-verification concerns.
- `Deferred:` the final clean-environment walkthrough and troubleshooting consolidation remain later tickets.

## Rationale

- The upgrade path is `stop → rm → docker load → docker create → start`. This is the standard Docker image-replacement flow.
- All persistent state survives because bind mounts are specified at container creation time, not baked into the image. The new container picks up the same mounts.
- An optional database backup step (`cp pirate-claw.db pirate-claw.db.bak`) is included as a precaution for future schema migrations but is not strictly required for image-only upgrades.
- Config-only changes (no new image) require only `docker restart`, not full container recreation.
- Transmission upgrades follow the same pattern but use `docker pull` since that image comes from a public registry.
