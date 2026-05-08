# Phase 27 Retrospective

Phase 27 goal: replace the expert-built Synology Docker runbook path with a DSM-first owner install path, validated on DS918+ / DSM 7.1.1.

## What the Spike Found About .spk Docker Orchestration

P27.01 tried to have a Package Center `.spk` hook run `docker run busybox:latest` as the owner-visible install action. DSM 7.1 Package Center showed the expected third-party package confirmation and install UI, but immediately left the package in a `stopped / System failed to start` state. The DSM Docker GUI showed no container and no pulled image after install and after Repair. The hook executed — `docker` was available at the expected path — but produced no GUI-observable result. Third attempt with lower-privilege (`run-as: package`) also failed.

**Finding:** DSM 7.1 Package Center hooks are viable for file-based installer steps (icons, launcher registration) but cannot be used to hide Docker orchestration steps from the owner. The GUI simply does not reflect hook-driven container lifecycle changes reliably enough to build an owner install path on top of them.

**Consequence for P27.04 onward:** The `.spk` does only what it can do reliably — registers the DSM Main Menu launcher and icon, declares the Docker package dependency, and runs the DSM Main Menu redirect. All container setup stays inside DSM Docker GUI. This is the "validated fallback" the phase plan called out as an acceptable pivot.

## What Worked

**Docker user-defined network:** Using a `pirate-claw` Docker network kept all three containers off the host network. `pirate-claw-web` talks to `pirate-claw-daemon:5555` by service name; `pirate-claw-daemon` talks to `transmission:9091` by service name. Only port `8888` is published to the host. This worked exactly as expected on DSM 7.1's Docker GUI and held through the full validation run.

**Daemon first-startup bootstrap:** The `PIRATE_CLAW_INSTALL_ROOT` / `runtime.installRoot` pattern from P27.02 worked cleanly. On cold start the daemon creates the install tree if absent and writes `config/generated/daemon-api-write-token`. The web container waits for that file via `PIRATE_CLAW_DAEMON_TOKEN_FILE` and reads it at process start. The owner never sees a token, enters a secret, or edits a config file during install.

**Install health gate:** The `GET /api/setup/install-health` endpoint (P27.05) plus the onboarding UI gate (P27.06) gave the owner a clear checklist of what was wrong before they tried to configure feeds. This blocked exactly the kind of confusing state — "I filled in feeds but nothing worked" — that we wanted to prevent.

**Browser-only onboarding:** After install health passed, the onboarding wizard handled the entire first-run config flow in the browser. Plex browser auth (`returnTo=/onboarding`), the back-to-dashboard link, and the stuck-readiness re-apply button (P27.09) closed the remaining gaps discovered during the exit validation run.

## What Was Harder Than Expected

**Image naming and test fixture alignment:** Between P27.01 and P27.08, the image naming conventions drifted (phase27-prefixed names in tests vs. unprefixed names in the actual build scripts). Caught during the P27.08 reconciliation pass, but it added a full cleanup cycle. Root cause: test fixtures were written before the build script naming was finalized.

**DSM folder permissions:** The first install attempt failed because Docker containers could not write to their mount paths. The fix — File Station → Properties → Permission tab → `Everyone / Allow / Read & Write / Apply to subfolders and files` — was non-obvious. DSM's default ACLs block containers from their mounts unless this step is done explicitly. The install guide now includes this step with a clear explanation.

**Old image/container naming conflicts:** On the DS918+ used for validation, old Phase 26 `pirate-claw:latest` and `pirate-claw-web:latest` images were tied to saved containers. DSM's Docker GUI showed them but the container names conflicted. Solution: include versioned image tarballs in the bundle so the owner imports Phase 27-specific images by name, avoiding old container conflicts.

**GitHub file size limit:** The release bundle zip exceeded GitHub's 100 MB file size limit. Resolved by adding `releases/` to `.gitignore` and hosting the zip externally (Google Drive). The git history required a filter-branch rewrite to remove the committed zip, which added unexpected churn during P27.08.

**Transmission Transmission RPC auth:** The first Transmission container launch included `USER`, `PASS`, and `WHITELIST` env vars. With those set, Transmission requires HTTP auth for RPC calls. The pirate-claw daemon uses no auth for the internal RPC. Solution: leave all three unset so the RPC stays auth-free inside the private Docker network. The install guide now explicitly states this.

## Whether the DSM-First Owner Contract Held Through Delivery

**Yes, with one known deviation:** The install guide requires the owner to open File Station and set folder permissions before creating containers. This is a DSM GUI step with no terminal access, but it is more involved than a typical Package Center install. It is unavoidable given DSM's ACL model and was documented in the guide with a screenshot.

Everything else — Package Center `.spk` install, Docker image import, container creation through Docker GUI, opening Pirate Claw at `http://<nas-ip>:8888`, and completing onboarding — required no SSH, no terminal, and no hand-edited files.

## Assumptions P28/P29 Planning Should Revisit

**Auth boundary:** Phase 27 leaves the Pirate Claw web UI unauthenticated. Anyone on the same network segment as port `8888` can view and edit config. Phase 28 owner web security is the right next gate before this product is shared beyond a single trusted LAN. Do not assume the Phase 27 install topology is safe for multi-user or internet-exposed deployments.

**Transmission auth-free RPC:** The Phase 27 stack deliberately leaves Transmission RPC auth-free inside the Docker network. Phase 29 (OpenVPN bridge) will introduce a VPN sidecar into the Transmission network namespace. That topology change needs to be validated against the current `http://transmission:9091` RPC path — the service name may still resolve correctly inside a VPN container namespace, but this has not been tested.

**DSM 7.2+ Container Manager:** The `compose.synology.cm.yml` artifact was included in the bundle but was not validated on hardware. P27 treats it as pending. Before P28 or P29 planning commits to a Container Manager-native flow, someone should verify it on a DSM 7.2+ system.

**Bundle hosting:** The zip is hosted on Google Drive. That is a manual, single-owner distribution path. Before v1.0.0, a more robust artifact hosting story (GitHub Releases, direct download from a stable URL) would reduce friction for anyone trying to install from the docs.
