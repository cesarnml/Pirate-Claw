# P24.01 Synology Reference Supervision Artifact and Contract

## Goal

Make the Synology reference deployment concrete and reviewable by giving Pirate Claw one repo-owned supervision artifact and one explicit contract for restart and durable-path expectations.

## Scope

### Reference artifact

- add the repo-owned Synology reference supervision artifact for the daemon
- define the expected invocation shape, working directory assumptions, and writable-path layout for the reference deployment
- make the writable config directory plus `pirate-claw.db` requirement explicit as one durability boundary

### Contract

- document what Pirate Claw expects from the supervisor after `SIGTERM`
- define the supported reference topology for Synology restart-backed operation
- remove ambiguity between a restart affordance in the UI and the actual supported restart path on Synology

### Tests / validation

- validate that the committed reference artifact and contract are internally consistent and reviewable

## Out Of Scope

- runtime shutdown hardening or restart-semantic changes (`P24.02`)
- browser-visible restart proof (`P25`)
- Plex compatibility operator messaging beyond what is needed to explain the reference environment

## Exit Condition

The repo contains one explicit Synology reference supervision path and one clear contract for restart and durable-state expectations, so later tickets can validate behavior against a stable baseline rather than prose-only guidance.

## Rationale

Phase 24 cannot honestly claim a first-class Synology story if the supported deployment model is still implicit. The reference artifact has to exist before runtime proof work can mean anything.
