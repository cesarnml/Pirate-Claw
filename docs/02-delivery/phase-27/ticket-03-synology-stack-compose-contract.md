# P27.03 Synology Stack Compose Contract

## Goal

Author the Docker Compose artifacts that define the three-service Pirate Claw stack for the Synology appliance path, with deterministic internal networking and the correct port exposure contract.

## Scope

- Author `compose.synology.yml` as the DSM 7.1 Docker baseline artifact:
  - Services: `pirate-claw-web`, `pirate-claw-daemon`, `transmission`
  - Port exposure: `pirate-claw-web` host `8888` → container `8888` only; `pirate-claw-daemon` internal `5555` only; `transmission` internal `9091` only
  - Internal networking: services communicate by Docker service name; owner never sees or enters raw hostnames or ports
  - Volume mounts: install root `/volume1/pirate-claw` subtrees mounted into each service as required
  - Bundled Transmission in direct mode with internal RPC URL pre-configured
  - Daemon write token sourced from daemon-generated secret file (not a hand-entered env var)
  - No secret placeholders visible in the compose file
- Author `compose.synology.cm.yml` as the DSM 7.2+ Container Manager Project artifact:
  - Same service names, same install root, same port exposure contract, same internal networking
  - Same browser entrypoint at `:8888`
  - Validation status: explicitly marked pending until a DSM 7.2+ tester verifies it
- Validate that `compose.synology.yml` starts cleanly with `docker compose up` on the dev environment (substituting the NAS install root with a local path equivalent).

## Out Of Scope

- SPK installer hooks (P27.04).
- Release bundle zip assembly (P27.07).
- VPN bridge topology (P29).

## Exit Condition

Both compose files exist. `compose.synology.yml` starts the three-service stack cleanly in a local dev environment with correct internal networking. The DSM 7.2+ artifact carries an explicit validation-pending marker. No secret values appear inline in either file.

## Rationale

_To be completed after implementation._
