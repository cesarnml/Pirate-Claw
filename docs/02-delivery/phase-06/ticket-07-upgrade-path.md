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
