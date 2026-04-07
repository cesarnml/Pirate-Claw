# `P6.04 Pirate Claw Container Baseline`

## Goal

Document and validate the known-good Pirate Claw container baseline, including the existing daemon mode, on the target Synology setup.

## Why This Ticket Exists

Phase 06 needs one concrete always-on Pirate Claw baseline, not a generic “containerize it somehow” note. This ticket establishes that operator-facing daemon path on the exact validated NAS/DSM baseline.

## Scope

- document the Container Manager steps for the canonical Pirate Claw image reference and tag convention
- validate the Pirate Claw container against the durable bind-mounted config/runtime/log paths
- include the existing daemon mode in the documented baseline rather than treating it as future work
- capture the operator checks that prove the container and daemon are running on the local baseline
- keep proof artifacts and deeper validation notes in the ticket rationale

## Out Of Scope

- final secret/env injection coverage
- restart semantics after NAS or container restarts
- upgrade procedure
- final happy-path validation

## Rationale

- `Red first:` the runbook should prove that the existing daemon mode is operator-facing enough to stand as the Phase 06 baseline.
- `Why this path:` anchoring the runbook to one known-good image reference and one daemon-capable container path gives later tickets a stable base for secrets, restart, upgrade, and troubleshooting work.
- `Alternative considered:` scheduled or manual Pirate Claw invocation was rejected because the existing daemon mode is strong enough to include and Phase 06 explicitly targets always-on operation.
- `Deferred:` secrets, restart semantics, upgrades, and end-to-end operational proof remain later tickets.
