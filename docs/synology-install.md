# Pirate Claw — Synology Install

This document is the owner-facing Synology install guide. It covers only the DSM GUI steps; no SSH, terminal commands, or hand-edited config files are required for the owner path.

## Choose Your DSM Version

### DSM 7.1 with the legacy Docker package — validated baseline

Follow [`tools/synology-release/install-dsm-7.1-docker.md`](../tools/synology-release/install-dsm-7.1-docker.md).

**Validated on:** Synology DS918+, DSM 7.1.1-42962 Update 9, legacy Docker package (not Container Manager). This is the Phase 27 verification baseline.

**Screenshot walkthrough:** Step-by-step screenshots for this path are under [`tools/synology-release/screenshots/dsm-7.1-docker/`](../tools/synology-release/screenshots/dsm-7.1-docker/). Each screenshot maps to a numbered step in the install guide:

| Screenshot                                         | Step                                         |
| -------------------------------------------------- | -------------------------------------------- |
| `01-package-center-install-dialog.png`             | Pirate Claw SPK install in Package Center    |
| `02-third-party-package-confirmation.png`          | Third-party package confirmation             |
| `03-package-center-installed.png`                  | Package installed status                     |
| `04-dsm-main-menu-pirate-claw-icon.png`            | Pirate Claw icon in Main Menu                |
| `05-file-station-permission-editor-everyone.png`   | File Station permission dialog               |
| `06-file-station-subfolders-created.png`           | Subfolders created in File Station           |
| `07-docker-images-all-loaded.png`                  | All three Docker images loaded               |
| `08-docker-network-pirate-claw.png`                | pirate-claw Docker network created           |
| `09-file-station-daemon-write-token-generated.png` | Generated token file visible in File Station |
| `10-dashboard-all-services-green.png`              | Dashboard with all services green            |
| `11-onboarding-install-health-passing.png`         | Onboarding install health check passing      |
| `12-config-plex-transmission-connected.png`        | Plex and Transmission connected in config    |

### DSM 7.2+ with Container Manager — validation pending

Follow [`tools/synology-release/install-dsm-7.2-container-manager.md`](../tools/synology-release/install-dsm-7.2-container-manager.md).

This path uses the DSM 7.2+ Container Manager Project artifact (`compose.synology.cm.yml`). The same three-service stack deploys through the Container Manager Project UI. Validation on DSM 7.2+ hardware is pending external confirmation.

## Getting the Install Bundle

The install bundle (`pirate-claw-synology-vX.Y.Z.zip`) contains:

- `images/pirate-claw-image-vX.Y.Z.tar` — Pirate Claw daemon image
- `images/pirate-claw-web-image-vX.Y.Z.tar` — Pirate Claw web image
- `images/transmission-image-vX.Y.Z.tar` — bundled Transmission image
- `pirate-claw.spk` — DSM Package Center installer
- `compose.synology.cm.yml` — Container Manager Project artifact for DSM 7.2+
- `install-dsm-7.1-docker.md` — step-by-step DSM 7.1 install guide
- `install-dsm-7.2-container-manager.md` — DSM 7.2+ guide
- `screenshots/` — validation captures for both paths

The zip is hosted externally. See the README for the download link.

## After Installation

Once the containers are running:

1. Open `http://<nas-ip>:8888` in a browser.
2. Pirate Claw opens in starter mode and guides you through setup without requiring any config file editing.
3. The onboarding page shows Synology install health. If a check fails, follow the DSM-language guidance shown on the page, then use Re-check.
4. After install health passes, add at least one RSS feed and one TV show or movie year target to complete setup.

## Owner Contract

The Phase 27 owner path stays entirely inside DSM screens — Package Center, File Station, Docker or Container Manager, and the Pirate Claw browser page. Config editing, secret management, and Plex connection all happen through the browser after first boot.

For advanced operator topics (container topology, config structure, NAS-side image rebuilds, Plex diagnostics), see [`docs/synology-runbook.md`](./synology-runbook.md).
