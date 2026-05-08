# DSM 7.1 Docker Install

Validated baseline target: Synology DS918+, DSM 7.1.1-42962 Update 9, legacy Docker package.

## Before You Start

- Confirm the DSM Docker package is installed.
- Keep the three image tarballs from this bundle available on the computer you use to open DSM.
- Keep the default install root: `/volume1/pirate-claw`.
- For a true fresh-install validation, remove or rename any old `/volume1/pirate-claw/config/auth/` directory and old Pirate Claw containers before starting. Do not delete media/download folders unless you intentionally want a full data reset.

## Prepare The DSM Folders

1. Open Control Panel -> Shared Folder and confirm `pirate-claw` exists, or create it.
2. In the Shared Folder list, select `pirate-claw` -> Edit -> Permissions tab. Confirm your user account has Read/Write checked. If not, check it and click Save.
3. Open File Station and navigate into `pirate-claw`.
4. In File Station, right-click the `pirate-claw` folder -> Properties -> Permission tab.
5. Click Create. Set User or group to `Everyone`, Type to `Allow`, Permission to `Read & Write`.
6. Check **Apply to this folder, sub-folders and files**.
7. Click Save.
8. Create these folders inside `pirate-claw`:
   - `config`
   - `config/auth`
   - `config/generated`
   - `data`
   - `downloads`
   - `downloads/complete`
   - `downloads/incomplete`
   - `media`
   - `media/movies`
   - `media/shows`
   - `transmission/config`

Existing folders and files are kept during repair or reinstall. For P28.04 fresh-install validation, the important reset is auth state: no owner file and no existing `session-secret`.

## Import Images

Use the Docker package GUI only.

1. Open Docker.
2. Open Image.
3. Use Add from file or Import and select `images/pirate-claw-image-v1.0.0.tar`.
4. Use Add from file or Import again and select `images/pirate-claw-web-image-v1.0.0.tar`.
5. Use Add from file or Import again and select `images/transmission-image-v1.0.0.tar`.
6. Confirm these images are present:
   - `pirate-claw:latest`
   - `pirate-claw-web:latest`
   - `lscr.io/linuxserver/transmission:latest`

Do not use phase-specific image tags for Phase 28 validation. The supported image references are `pirate-claw:latest`, `pirate-claw-web:latest`, and `lscr.io/linuxserver/transmission:latest`.

## Create The Docker Network

Create a user-defined Docker network named `pirate-claw`.

## Create Transmission

- Image: `lscr.io/linuxserver/transmission:latest`
- Container name: `transmission`
- Network: `pirate-claw`
- Enable auto-restart.
- Remove all default port mappings. Transmission is only required inside the private Docker network.
- Environment:
  - `PUID` = `0`
  - `PGID` = `0`
  - `TZ` = `UTC`
- Do not set Transmission `USER`, `PASS`, or `WHITELIST`.
- Volume mappings:
  - `/volume1/pirate-claw/transmission/config` -> `/config`
  - `/volume1/pirate-claw/downloads` -> `/downloads`
  - `/volume1/pirate-claw/downloads/complete` -> `/downloads/complete`
  - `/volume1/pirate-claw/downloads/incomplete` -> `/incomplete-downloads`
  - `/volume1/pirate-claw/media` -> `/media`

Start the `transmission` container.

## Create Pirate Claw Daemon

- Image: `pirate-claw:latest`
- Container name: `pirate-claw-daemon`
- Network: `pirate-claw`
- Enable auto-restart.
- Volume mapping:
  - `/volume1/pirate-claw` -> `/volume1/pirate-claw`
- Execution command:
  - EntryPoint: `bun run dist/cli.js`
  - Command: `daemon --config /volume1/pirate-claw/config/pirate-claw.config.json`
- Environment: no manual entries are required for the default bundle. The image already sets the internal install root, API host, API port, and bundled Transmission URL defaults.

Start the daemon container and wait for it to create:

- `/volume1/pirate-claw/config/generated/daemon-api-write-token`
- `/volume1/pirate-claw/config/auth/session-secret`

## Create Pirate Claw Web

- Image: `pirate-claw-web:latest`
- Container name: `pirate-claw-web`
- Network: `pirate-claw`
- Publish host port `8888` to container port `8888`.
- Enable auto-restart.
- Volume mapping:
  - `/volume1/pirate-claw` -> `/volume1/pirate-claw` as read-only if Docker offers a read-only option.
- Environment:
  - `ORIGIN` = the exact URL you use to open Pirate Claw in a browser, including the port. Examples: `http://192.168.1.52:8888` or `http://100.108.117.42:8888`.

The image already sets `HOST`, `PORT`, daemon API URL, daemon token file, and session secret file defaults. Set only `ORIGIN` unless you intentionally changed the default port or container names.

Start the web container.

## Open Pirate Claw

1. Open `http://<nas-ip>:8888` in a browser.
2. Fresh Phase 28 install should show the owner setup screen before any app shell appears.
3. Create the owner account.
4. Continue onboarding and install-health checks.

## Phase 28 Validation Checklist

Use `docs/02-delivery/phase-28/ticket-04-ds918-exit-validation.md` as the source of truth. At minimum, verify:

- First visit with no owner shows setup only.
- Owner creation issues a session and redirects into setup/dashboard.
- Logout, login success, login failure, and expired-session behavior.
- Unauthenticated app routes redirect to `/login`.
- Unauthenticated mutating API requests return `401`.
- Destructive actions are blocked when logged out and succeed after login.
- LAN origin is trusted from setup.
- Tailscale origin shows the trust banner and can be trusted once.
- Direct-mode acknowledgement persists.
- Daemon restart preserves `session-secret`.
- Fresh install without `session-secret` causes daemon to generate one.
