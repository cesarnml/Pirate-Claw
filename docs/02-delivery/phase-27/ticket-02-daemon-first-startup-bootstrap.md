# P27.02 Daemon First-Startup Bootstrap

## Goal

Add daemon first-startup logic that creates the install root directory tree (create-if-absent) and generates required app secrets if they do not already exist.

## Scope

- On daemon startup, create the following directory tree under the configured install root (`/volume1/pirate-claw` by default) if directories do not exist:
  ```
  config/
  data/
  downloads/
  downloads/incomplete/
  media/
  media/movies/
  media/shows/
  transmission/config/
  ```
- Generate app secrets on first startup (skip if already present):
  - daemon internal write token
  - any additional secrets required by the stack that cannot be hand-entered by the owner
- Write generated secrets to daemon-owned files under `config/` — not to `pirate-claw.config.json`.
- Web container must be able to read the daemon write token from the shared mounted config path so `PIRATE_CLAW_API_WRITE_TOKEN` does not need to be manually set in the compose environment.
- Create-if-absent semantics throughout: never delete, overwrite, or migrate existing files.
- Add tests for:
  - first-startup directory creation on a clean install root
  - idempotency: second startup with existing directories and secrets leaves them unchanged
  - secret generation produces non-empty, sufficiently random values

## Out Of Scope

- Stack compose wiring (P27.03).
- Install health endpoint (P27.05).
- Owner auth secrets (P28).
- VPN secrets (P29).

## Exit Condition

Daemon startup on a clean install root creates the full directory tree and writes generated secrets. A second startup leaves all paths and secrets unchanged. Tests pass.

## Rationale

_To be completed after implementation._
