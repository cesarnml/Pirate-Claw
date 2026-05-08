# P26.01 Mac Reference Launchd Artifact and Contract

## Goal

Make the supported macOS always-on deployment path concrete and reviewable by giving Pirate Claw one repo-owned `launchd` artifact and one explicit contract for account model, invocation, and durable-path expectations.

## Scope

### Reference artifact

- add the repo-owned Mac reference `launchd` artifact for the daemon
- define the expected invocation shape, working directory assumptions, and install/update/remove flow for the supported per-user agent path
- make the operator-chosen install directory plus `pirate-claw.config.json`, `pirate-claw.db`, and `.pirate-claw/runtime/` boundary explicit

### Contract

- document that Phase 26 supports per-user `launchd` under a dedicated always-logged-in operator account
- define what Pirate Claw expects from the Mac-side supervisor after a restart-triggering `SIGTERM` or equivalent relaunch event
- distinguish the supported Mac reference posture from developer-only shortcuts such as tmux/screen or manual shell sessions

### Tests / validation

- validate that the committed artifact and contract are internally consistent and reviewable as the baseline for later tickets

## Out Of Scope

- daemon/API/browser changes needed to make restart truthful under `launchd` (`P26.02`)
- final Mac runbook or broad operator-facing closeout (`P26.03` and `P26.04`)
- Intel support or generic supervisor abstraction

## Exit Condition

The repo contains one explicit Mac `launchd` reference path and one clear contract for how Pirate Claw is expected to run continuously on macOS, so later tickets can validate behavior against a stable baseline instead of prose-only intent.

## Rationale

Phase 26 cannot honestly claim first-class Mac support if the supported deployment shape is still implicit. The reference artifact has to exist before restart truthfulness and operator guidance can be judged against anything concrete.
