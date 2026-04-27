# P27.08 Exit Validation and Screenshots

## Goal

Validate the complete DSM-first install flow on the real DS918+ baseline and capture all required screenshots. This ticket gates phase close.

## Scope

Codex + Computer Use against `https://100.108.117.42:5001/` executes and documents the full validated owner install path:

**Install flow:**

- Allow third-party packages in DSM security settings (if required)
- Package Center → Manual Install → `pirate-claw.spk`
- Third-party package confirmation dialog (if present)
- Package installs and appears in Package Center
- DSM Main Menu Pirate Claw icon appears
- DSM Docker package shows `pirate-claw-web`, `pirate-claw-daemon`, `transmission` containers running
- DSM Docker Image view imports `pirate-claw-phase27`, `pirate-claw-web-phase27`, and bundled Transmission from release bundle tarballs, not old Phase 26 saved containers or remote registry assumptions

**First-run flow:**

- Open `http://<nas-ip>:8888` in browser
- Install health panel shows and all checks pass
- Config onboarding steps become accessible

**Required screenshots (hard acceptance criteria):**

- DSM Security settings — third-party package allow step (if required)
- Package Center manual install dialog
- Third-party package confirmation (if present)
- Package Center showing Pirate Claw installed
- DSM Main Menu with Pirate Claw icon visible
- Docker Image view showing the imported Pirate Claw image tarballs
- DSM Docker package showing all three containers running
- Browser at `:8888` showing install health panel passing
- Browser at `:8888` showing config onboarding steps accessible

Screenshots are committed to `docs/02-delivery/phase-27/screenshots/dsm-7.1-docker/` and referenced in the release bundle install guide.

**Reinstall validation:**

- Run Package Center install again on the existing install root
- Confirm existing config and data are not wiped
- Confirm stack restarts cleanly

## Out Of Scope

- DSM 7.2+ Container Manager validation (pending external tester).
- Owner auth flow (P28).

## Exit Condition

All required DSM 7.1 screenshots are captured and committed. The full install flow completes on the real DS918+ without SSH, terminal commands, manual JSON edits, or manual Docker container assembly. Reinstall is safe.

## Rationale

Manual DSM validation found that existing `pirate-claw:latest` and `pirate-claw-web:latest` images on the DS918+ were tied to Phase 26 saved containers, so they could not prove the Phase 27 release bundle. The approved DSM 7.1 fallback now includes GUI-importable, Phase 27-named Pirate Claw image tarballs plus the bundled Transmission image tarball in the release bundle. The DSM guide now explicitly says Transmission must be imported from `transmission-phase27-image-vX.Y.Z.tar` for Phase 27 validation, even though DSM displays that imported image as `lscr.io/linuxserver/transmission:latest`. That keeps the operator contract inside DSM Package Center, File Station, and Docker GUI while removing external image availability assumptions and avoiding old image/container name conflicts.

Manual daemon-container setup showed the DSM Docker wizard needs more precise wording for bind mounts and commands. The guide now states that DSM's `pirate-claw` shared folder maps to container path `/volume1/pirate-claw`, that EntryPoint stays `bun run dist/cli.js`, and that Command is exactly `daemon --config /volume1/pirate-claw/config/pirate-claw.config.json`.

Manual first-run validation reached the web app and all three containers were running, but install health reported Transmission HTTP 403. That proved the bundled Transmission RPC answered but rejected the daemon container's bridge-network client due to Transmission RPC auth or whitelist configuration. The DSM guide and compose artifacts now use the Transmission image's no-auth default and set `WHITELIST=*.*.*.*` through the container environment. This keeps RPC private at the Docker network boundary because no Transmission ports are published to the NAS host, while avoiding owner-visible Transmission credentials.
