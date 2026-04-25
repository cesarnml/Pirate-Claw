# Phase 27: Synology DSM-First Stack and Cold Start

**Delivery status:** Not started — product definition only; no `docs/02-delivery/phase-27/` implementation plan until tickets are approved.

Phase 27 turns the Synology story from a hand-built Docker runbook into a DSM-first appliance install path. A DSM-first owner is comfortable using Synology DSM, File Station, Package Center, Docker, and Container Manager, but is not expected to use SSH, Docker CLI, Linux permission commands, or hand-edited config files.

## TL;DR

**Goal:** a Synology owner can install Pirate Claw through DSM GUI, open one browser URL, and reach a working first-run setup surface without terminal commands or hand-edited files.

**Ships:** DSM 7.1 `.spk` installer as the validated DS918+ path; DSM 7.2+ Container Manager Compose artifact as the modern path; release bundle; bundled Transmission direct-mode stack; generated app secrets; non-secret config JSON; DSM Main Menu icon; install health checks; owner install docs and screenshots.

**Defers:** owner web login/session enforcement (Phase 28); OpenVPN bridge (Phase 29); broad UX polish (Phase 30); v1 schema/tag ceremony (Phase 31).

## Phase Goal

Phase 27 should leave Pirate Claw in a state where:

- the supported Synology owner path is DSM GUI-only
- DS918+ / DSM 7.1.1 Docker is the validated release baseline
- DSM 7.2+ Container Manager Project import is included as the simpler modern artifact, with validation status called out honestly until an external tester verifies it
- the owner does not create or edit `pirate-claw.config.json`, `.env`, write tokens, daemon URLs, or Transmission RPC settings
- the default stack starts web, daemon, and bundled Transmission with deterministic internal networking
- only Pirate Claw web is exposed to LAN or private mesh access on port `8888`
- daemon API and Transmission RPC are internal to the stack
- Pirate Claw owns one durable install root under `/volume1/pirate-claw`
- the browser first-run surface can verify install health using DSM-language remediation

## Target Owner and Support Contract

The supported Synology path targets a **DSM-first owner**.

Supported owner actions:

- Package Center manual install for DSM 7.1 Docker systems
- Container Manager Project import for DSM 7.2+ systems
- File Station actions when a fallback folder step is unavoidable
- DSM Main Menu / Package Center launch
- Pirate Claw browser setup at `http://<nas-ip>:8888`

Unsupported in the owner path:

- SSH
- Docker CLI
- `docker run`
- `docker compose`
- `chmod` / `chown`
- manual JSON edits
- manual `.env` edits
- manual Docker container assembly

Legacy hand-built Docker deployments remain possible for developers and advanced operators, but they are outside the DSM-first owner install contract.

## Supported Synology Paths

### Validated Baseline: DSM 7.1 Docker `.spk`

The release-critical path is the real NAS baseline already used by the project:

- Synology DS918+
- DSM `7.1.1-42962 Update 9`
- legacy DSM `Docker` package
- Package Center manual install of `pirate-claw.spk`

The `.spk` installer must fully create and start the Pirate Claw stack. It must not install only a helper that asks the owner to hand-create Docker containers.

### Modern Path: DSM 7.2+ Container Manager Project

The release bundle should also include a Container Manager Project / Compose artifact for newer NAS users:

- `compose.synology.yml`
- same service names
- same install root
- same exposed/internal port contract
- same browser entrypoint

This path is supported as a release artifact, but Phase 27 validation may be marked pending until a DSM 7.2+ tester verifies it.

## Release Bundle Contract

Phase 27 should produce a Synology release bundle:

```text
pirate-claw-synology-vX.Y.Z.zip
  pirate-claw.spk
  compose.synology.yml
  README-synology-install.md
  install-dsm-7.1-docker.md
  install-dsm-7.2-container-manager.md
  screenshots/
    dsm-7.1-docker/
    dsm-7.2-container-manager/
```

The `.spk` path is the validated release baseline. The Compose path is the modern path and should be included even if external validation lands later.

## Install Root Contract

The default install root is:

```text
/volume1/pirate-claw
```

The installer should create this root when possible. If Synology package tooling offers a native volume selector, another volume may be allowed, but the relative tree remains fixed:

```text
config/
data/
downloads/
downloads/incomplete/
media/
media/movies/
media/shows/
transmission/config/
```

The supported default remains `/volume1/pirate-claw`. Custom arbitrary paths are out of scope for v1.

## Stack Contract

Default services:

```text
pirate-claw-web
pirate-claw-daemon
transmission
```

Default exposure:

- `pirate-claw-web`: host `8888` -> container `8888`
- `pirate-claw-daemon`: internal `5555` only
- `transmission`: internal `9091` only

Default internal addresses:

- web -> daemon: stack-internal daemon service address
- daemon -> Transmission: stack-internal bundled downloader address

The user must not be asked for:

- daemon API URL
- daemon write token
- Transmission RPC URL
- Transmission RPC credentials
- web origin
- container network names

Bundled Transmission is part of the supported appliance baseline. Bring-your-own Transmission remains an advanced non-release path; if an operator uses BYO Transmission, securing that downloader traffic is operator-owned.

## Secrets and Config Contract

After Phase 27, `pirate-claw.config.json` is non-secret settings only.

Unsupported in JSON:

- Transmission username/password
- Plex token
- daemon API write token
- VPN credentials
- owner auth secrets

Secrets live in daemon-owned app-managed files or process environment. Starter config must not include secret placeholders. Inline JSON secrets may hard-fail with clear remediation; no migration path is required before v1.

## DSM App Icon

The `.spk` path should install a DSM Main Menu app:

- title: `Pirate Claw`
- admin-visible only
- opens Pirate Claw web on `8888`
- Package Center **Open** should launch the same entrypoint

If DSM URL app host handling is tricky, a small package UI redirect page may be used to resolve the current DSM host and forward to port `8888`.

## Install Health Checks

The first-run browser surface must verify:

- install root exists
- expected subdirectories exist or can be created
- config directory writable
- data directory writable
- downloads directory writable
- incomplete downloads directory writable
- movie target directory writable
- show target directory writable
- daemon API reachable from web
- daemon internal write token works
- bundled Transmission RPC reachable from daemon
- bundled Transmission can write the downloads and media target paths
- only expected public port is required for the owner path

Failures should explain DSM GUI remediation. They should not tell the owner to run shell commands.

## Documentation Contract

Phase 27 creates or updates:

- `docs/synology-install.md` — DSM-first owner path
- `docs/synology-runbook.md` — advanced/manual/historical operator notes
- README Synology section pointing to `docs/synology-install.md`
- release bundle install docs

Owner install docs must not include terminal commands. Advanced runbook docs may include manual Docker or shell details if clearly marked outside the owner path.

Screenshots are hard acceptance criteria for the validated DSM 7.1 path:

- Package Center manual install
- third-party package confirmation if present
- installed Pirate Claw package
- DSM Main Menu Pirate Claw icon
- Docker package showing running containers
- browser open at `:8888`
- first-run health check success

DSM 7.2+ screenshots may be marked pending external validation until a tester verifies the flow.

## Exit Condition

On the DS918+ DSM 7.1 validated baseline, a DSM-first owner can install Pirate Claw through Package Center, launch it from DSM or `http://<nas-ip>:8888`, and see passing install health checks without SSH, terminal commands, manual JSON edits, manual `.env` edits, or manual Docker container assembly.

The release bundle also contains the DSM 7.2+ Compose Project artifact with explicit validation status.

## Explicit Deferrals

- owner account setup and web-session auth (Phase 28)
- OpenVPN bridge and `gluetun` topology (Phase 29)
- WireGuard support (v2)
- direct Docker socket / Container Manager mutation from the web app
- offline image tarball install
- arbitrary custom install paths
- BYO Transmission browser setup
- exposing Transmission web UI by default

## Rationale

The existing Synology path proved Pirate Claw can run on a NAS, but it was assembled by an expert through container topology, API URL, token, path, and environment decisions. That is not the v1 product promise. Phase 27 makes Synology installation an appliance-shaped DSM workflow: install the package or import the modern project, open Pirate Claw, and let the browser setup prove the stack is healthy.
