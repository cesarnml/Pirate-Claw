# Pirate Claw — Synology Install

This document is the owner-facing Synology install guide. It covers only the DSM GUI steps; no SSH, terminal commands, or hand-edited config files are required for the owner path.

## Choose Your DSM Version

### DSM 7.1 with the legacy Docker package — validated baseline

Follow [`releases/synology-release/version01/install-dsm-7.1-docker.md`](../releases/synology-release/version01/install-dsm-7.1-docker.md).

**Validated on:** Synology DS918+, DSM 7.1.1-42962 Update 9, legacy Docker package (not Container Manager). This is the Phase 27 verification baseline.

**Screenshot walkthrough:** Step-by-step screenshots for this path are under [`releases/synology-release/version01/screenshots/dsm-7.1-docker/`](../releases/synology-release/version01/screenshots/dsm-7.1-docker/). Each screenshot maps to a numbered step in the install guide:

| Screenshot                                         | Step                                         |
| -------------------------------------------------- | -------------------------------------------- |
| `01-file-station-permission-editor-everyone.png`   | File Station permission dialog               |
| `02-file-station-subfolders-created.png`           | Subfolders created in File Station           |
| `03-docker-images-all-loaded.png`                  | All three Docker images loaded               |
| `04-docker-network-pirate-claw.png`                | pirate-claw Docker network created           |
| `05-file-station-daemon-write-token-generated.png` | Generated token file visible in File Station |
| `06-dashboard-all-services-green.png`              | Dashboard with all services green            |
| `07-onboarding-install-health-passing.png`         | Onboarding install health check passing      |
| `08-config-plex-transmission-connected.png`        | Plex and Transmission connected in config    |

### DSM 7.2+ with Container Manager — validation pending

Follow [`releases/synology-release/version01/install-dsm-7.2-container-manager.md`](../releases/synology-release/version01/install-dsm-7.2-container-manager.md).

This path uses the DSM 7.2+ Container Manager Project artifact (`compose.synology.cm.yml`). The same three-service stack deploys through the Container Manager Project UI. Validation on DSM 7.2+ hardware is pending external confirmation.

## Getting the Install Bundle

The install bundle (`pirate-claw-synology-vX.Y.Z.zip`) contains:

- `images/pirate-claw-image-vX.Y.Z.tar` — Pirate Claw daemon image
- `images/pirate-claw-web-image-vX.Y.Z.tar` — Pirate Claw web image
- `images/transmission-image-vX.Y.Z.tar` — bundled Transmission image
- `compose.synology.cm.yml` — Container Manager Project artifact for DSM 7.2+
- `install-dsm-7.1-docker.md` — step-by-step DSM 7.1 install guide
- `install-dsm-7.2-container-manager.md` — DSM 7.2+ guide
- `screenshots/` — validation captures for both paths

The zip is hosted externally. See the README for the download link.

## After Installation

Once the containers are running:

1. Open `http://<nas-ip>:8888` in a browser.
2. Pirate Claw redirects to `/setup` — create your owner account before doing anything else (see [Owner Account Setup](#owner-account-setup)).
3. After creating the owner account you are redirected to onboarding. The onboarding page shows Synology install health. If a check fails, follow the DSM-language guidance shown on the page, then use Re-check.
4. After install health passes, add at least one RSS feed and one TV show or movie year target to complete setup.

## Owner Account Setup

Phase 28 adds an owner auth layer. On first launch the web UI is in **starter mode** and requires owner account creation before any app state or controls are accessible.

**Steps:**

1. Open `http://<nas-ip>:8888`.
2. You are redirected to `/setup`. Enter a username and password for the owner account.
3. Submit the form. Pirate Claw creates the owner account and logs you in automatically.
4. You are redirected to onboarding to complete install health and initial configuration.

**Complete owner setup immediately after the first launch.** Until an owner account exists the web UI is unauthenticated. Do not leave Pirate Claw running on the network before this step is done.

On subsequent visits open `http://<nas-ip>:8888` and log in at `/login` with the owner credentials you created.

## Security Posture

Pirate Claw v1 is designed for **LAN and Tailscale / private mesh access only**. It is not hardened for direct public internet exposure. Do not forward port `8888` to the public internet.

**First-launch window:** Between container start and owner account creation the web UI has no auth. Complete owner setup before leaving the NAS unattended or accessible on a shared network segment.

**Trusted origins:** Pirate Claw tracks trusted origins so the browser security banner clears for each access address you use (e.g. LAN IP `192.168.1.x`, Tailscale IP `100.x.x.x`). To add a new trusted origin navigate to the Pirate Claw web UI from the new address — the banner will appear. Click **Trust this origin** and the address is persisted to `trusted-origins.json`. Note: trusted-origins.json is separate from SvelteKit's CSRF protection, which is pinned to the `ORIGIN` environment variable set at container start. Form-submission flows from secondary addresses may still fail CSRF checks until P29 resolves the gap.

**Direct-mode acknowledgement:** The Config page shows an acknowledgement banner when the daemon is running in direct mode (no VPN tunnel for Transmission traffic). Acknowledging it clears the banner and is persisted in the daemon database. This is a Phase 29 placeholder — the OpenVPN bridge is the eventual resolution.

## Owner Contract

The Phase 27 owner path stays entirely inside DSM screens — File Station, Docker or Container Manager, and the Pirate Claw browser page. Config editing, secret management, and Plex connection all happen through the browser after first boot.

For advanced operator topics (container topology, config structure, NAS-side image rebuilds, Plex diagnostics), see [`docs/synology-runbook.md`](./synology-runbook.md).
