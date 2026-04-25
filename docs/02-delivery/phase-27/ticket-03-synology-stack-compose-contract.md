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

Added `compose.synology.yml` for the DSM 7.1 baseline and `compose.synology.cm.yml` for the DSM 7.2+ Container Manager artifact. Both define the same three-service stack (`pirate-claw-web`, `pirate-claw-daemon`, `transmission`), publish only `pirate-claw-web` on host port `8888`, keep daemon `5555` and Transmission `9091` internal, and use service-name URLs for web → daemon and daemon → Transmission communication.

The compose files intentionally do not inline secret values. The daemon generates `config/generated/daemon-api-write-token` through the P27.02 first-startup bootstrap. The web service waits for that file, reads it at process start, and exports `PIRATE_CLAW_API_WRITE_TOKEN` internally so the owner does not hand-enter the write token in compose or DSM.

Small runtime config additions were needed to make the compose contract real rather than only documented: `PIRATE_CLAW_API_HOST` lets the daemon bind `0.0.0.0` inside the private Docker network while preserving the local default of `127.0.0.1`; `PIRATE_CLAW_API_PORT` enables the daemon API without hand-editing starter JSON; and `PIRATE_CLAW_TRANSMISSION_URL` lets the bundled stack use `http://transmission:9091/transmission/rpc` while the on-disk starter config remains non-secret and operator-editable later.

Local validation used:

```bash
PIRATE_CLAW_INSTALL_ROOT="$(pwd)/.pirate-claw/compose-validation" docker compose -f compose.synology.yml up --build -d
```

Result: all three containers started; Docker published only `0.0.0.0:8888->8888/tcp`; the daemon logged `api listening on 0.0.0.0:5555`; `curl http://127.0.0.1:8888/` returned `200`; the web container fetched `http://pirate-claw-daemon:5555/api/status` with `200`; and the daemon effective config reported Transmission URL `http://transmission:9091/transmission/rpc` with the API write token redacted.
