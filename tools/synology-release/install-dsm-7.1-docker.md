# DSM 7.1 Docker Install

Validated baseline: Synology DS918+, DSM 7.1.1-42962 Update 9, legacy Docker package.

## Before You Start

- Confirm the DSM Docker package is installed.
- Keep the three image tarballs from this bundle available on the computer you use to open DSM.
- Keep the default install root: `/volume1/pirate-claw`.

## Install The Package

1. Open Package Center.
2. Choose Manual Install.
3. Select `pirate-claw.spk` from this bundle.
4. Accept the third-party package confirmation if DSM shows it.
5. Finish the install.
6. Open Main Menu and confirm the Pirate Claw icon is present.

The package is a launcher and install-root artifact package. It does not create or start Docker containers from package hooks on DSM 7.1.

## Prepare The DSM Folders

1. Open Control Panel → Shared Folder and confirm `pirate-claw` exists, or create it.
2. Open File Station and navigate into `pirate-claw`.
3. Create these folders:
   - `config`
   - `data`
   - `downloads`
   - `downloads/complete`
   - `downloads/incomplete`
   - `media`
   - `media/movies`
   - `media/shows`
   - `transmission/config`
4. In File Station, right-click the `pirate-claw` folder → Properties → Permission tab.
5. Click Create. Set User or group to `Everyone`, Type to `Allow`, Permission to `Read & Write`.
6. Check **Apply to this folder, sub-folders and files**.
7. Click Save.

This grants Docker containers access to the install root and all subfolders. Without it, DSM's default ACLs block the containers from reading and writing their mount paths.

Existing folders and files are kept. Do not delete an existing Pirate Claw install root during repair or reinstall.

## Create The Docker Containers

Use the Docker package GUI only.

1. Open Docker.
2. Open Image.
3. Use Add from file or Import and select `images/pirate-claw-image-v1.0.0.tar` from this bundle.
4. Use Add from file or Import again and select `images/pirate-claw-web-image-v1.0.0.tar`.
5. Use Add from file or Import again and select `images/transmission-image-v1.0.0.tar`.
6. Confirm these images are present:
   - `pirate-claw:latest`
   - `pirate-claw-web:latest`
   - `lscr.io/linuxserver/transmission:latest`

   The Transmission name is expected: it is the label inside the bundled tarball, not an instruction to use the Docker Registry.

7. Create a user-defined Docker network named `pirate-claw`.
8. Create the Transmission container:
   - Image: `lscr.io/linuxserver/transmission:latest`
   - Container name: `transmission`
   - Network: `pirate-claw`
   - Map `/volume1/pirate-claw/transmission/config` to `/config`.
   - Map `/volume1/pirate-claw/downloads` to `/downloads`.
   - Map `/volume1/pirate-claw/downloads/complete` to `/downloads/complete`.
   - Map `/volume1/pirate-claw/downloads/incomplete` to `/incomplete-downloads`.
   - Map `/volume1/pirate-claw/media` to `/media`.

   The folder permission step above is sufficient for DSM 7.1 Docker bind mounts. The bundled Transmission RPC stays private because no Transmission ports are published to the NAS host.

9. Create the Pirate Claw daemon container:
   - Image: `pirate-claw:latest`
   - Container name: `pirate-claw-daemon`
   - Network: `pirate-claw`
   - Under Advanced Settings:
   - In Execution Command, leave EntryPoint as `bun run dist/cli.js`.
   - Set Command to exactly `daemon --config /volume1/pirate-claw/config/pirate-claw.config.json`.
   - Set environment values through Docker's GUI fields:
     - `PIRATE_CLAW_INSTALL_ROOT` = `/volume1/pirate-claw`
     - `PIRATE_CLAW_API_HOST` = `0.0.0.0`
     - `PIRATE_CLAW_API_PORT` = `5555`
     - `PIRATE_CLAW_TRANSMISSION_URL` = `http://transmission:9091/transmission/rpc`
   - Map the DSM shared folder `pirate-claw` to container mount path `/volume1/pirate-claw`.

10. Start the daemon container and wait for it to create the generated token file under the install root.
11. Create the Pirate Claw web container:
    - Image: `pirate-claw-web:latest`
    - Container name: `pirate-claw-web`
    - Network: `pirate-claw`
    - Publish host port `8888` to container port `8888`.
    - Map `/volume1/pirate-claw` to `/volume1/pirate-claw` as read-only if Docker offers a read-only option.
    - Under Advanced Settings:
    - Set environment values through Docker's GUI fields:
      - `HOST` = `0.0.0.0`
      - `PORT` = `8888`
      - `ORIGIN` = the exact URL you use to open Pirate Claw in a browser, including the port. Use the same IP or hostname you type in the address bar to reach Pirate Claw — not the DSM IP. Examples: `http://192.168.1.52:8888` (LAN), `http://100.108.117.42:8888` (Tailscale). If Plex browser sign-in fails to redirect back, `ORIGIN` is set to the wrong address.
      - `PIRATE_CLAW_API_URL` = `http://pirate-claw-daemon:5555`
      - `PIRATE_CLAW_DAEMON_TOKEN_FILE` = `/volume1/pirate-claw/config/generated/daemon-api-write-token`

12. Start the web container.

## Open Pirate Claw

1. Open the Pirate Claw icon from DSM Main Menu, or open `http://<nas-ip>:8888` in a browser.
2. On the onboarding page, review Synology install health.
3. If a check fails, follow the DSM-language remediation shown on the page, then use Re-check.
4. Continue Pirate Claw setup only after install health passes.
