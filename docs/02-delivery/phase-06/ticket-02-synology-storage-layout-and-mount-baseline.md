# `P6.02 Synology Storage Layout And Mount Baseline`

## Goal

Document and validate the durable Synology folder layout, bind mounts, and permission expectations the rest of the Phase 06 baseline depends on.

## Why This Ticket Exists

Storage layout and mount behavior are a separate failure domain from container creation. If this baseline is vague, every later ticket inherits avoidable ambiguity around permissions, persistence, and troubleshooting.

## Scope

- document the required Synology shared folders or folder tree for:
  - Pirate Claw config/runtime/log state
  - Transmission config/runtime state
  - download/media paths
- validate the bind-mounted path layout on the `DS918+ / DSM 7.1.1-42962 Update 9` baseline
- document the expected ownership, permissions, and operator checks for those paths
- add operator-facing verification cues to the canonical runbook
- capture proof artifacts or validation notes in the ticket rationale

## Out Of Scope

- Transmission container creation
- Pirate Claw container creation
- secret injection
- restart behavior or upgrade flow

## Rationale

- `Red first:` the baseline must prove durable storage outside container filesystems before container setup can be considered credible.
- `Why this path:` separating path preparation from container creation keeps the validation evidence clear when a later failure turns out to be a mount or permission problem rather than an application problem.
- `Alternative considered:` folding storage and container creation together was rejected because it would blur one of the highest-risk setup boundaries for a Synology runbook.
- `Deferred:` container runtime validation stays in later tickets once the durable storage baseline is proven.
