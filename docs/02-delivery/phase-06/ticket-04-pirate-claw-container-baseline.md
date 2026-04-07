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

## Validation Result

Validated on `DS918+ / DSM 7.1.1-42962 Update 9` with Docker 20.10.3.

- image: `pirate-claw:latest` built from repo `Dockerfile` (`oven/bun:1-alpine`, `linux/amd64`)
- daemon mode: entrypoint `bun run src/cli.ts daemon` runs successfully with clean cycle logs
- network: `--network host` required because Docker 20.10.3 on DSM 7.1.x does not support `host.docker.internal`
- DB durability: `pirate-claw.db` must be bind-mounted to a durable host path; defaults to ephemeral `/app/pirate-claw.db` otherwise
- credentials: `PIRATE_CLAW_TRANSMISSION_USERNAME` and `PIRATE_CLAW_TRANSMISSION_PASSWORD` are required by the config validator even when Transmission RPC auth is disabled
- SCP transfer: Synology requires `-O` flag for legacy SCP protocol
- `Dockerfile` and `.dockerignore` added to the repo
