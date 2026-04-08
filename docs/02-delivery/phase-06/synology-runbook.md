# Synology Runbook

This is the canonical Phase 06 operator runbook for the validated Synology baseline.

## Validated Baseline

This runbook is being validated only against:

- Synology `DS918+`
- DSM `7.1.1-42962 Update 9`
- Synology Docker package (on DSM 7.1.x the package is named `Docker`; DSM 7.2+ renamed it to `Container Manager`)
- always-on local-LAN-first operation

Treat any other Synology model, DSM version, or remote-access-first setup as non-validated unless the runbook explicitly says otherwise.

## Runbook Rules

- Use one canonical known-good Pirate Claw image reference throughout the runbook once that image is validated in a later ticket.
- Use fake-but-concrete example values in commands, paths, container names, and screenshots so the operator can map the pattern to their own NAS without leaking real secrets.
- Keep this document operator-facing. Put only the verification cues an operator needs here. Raw proof, screenshots collected during ticket work, and detailed validation notes belong in the ticket rationale.
- Do not widen the baseline beyond the exact validated hardware, DSM version, and Docker package path.

## Acceptance Checklist

Later Phase 06 tickets are complete only when they preserve this baseline and leave the runbook in a state that supports all of the following:

- one canonical operator journey from Synology storage preparation through steady-state operation
- explicit durable bind-mounted paths for Pirate Claw state, Transmission state, and download or media storage
- one known-good Transmission container baseline
- one known-good Pirate Claw container baseline using the existing daemon mode
- documented env and secret injection with no hidden prerequisites
- restart expectations and operator verification steps for always-on operation
- upgrade guidance that preserves durable state
- one fresh end-to-end validation pass on a clean `DS918+ / DSM 7.1.1-42962 Update 9` environment
- a troubleshooting section tied to the validated baseline
- a final portability section that clearly separates likely-portable notes from validated claims

## Evidence Boundary

Use this runbook for operator instructions and lightweight verification cues such as:

- where to click in DSM or the Docker UI
- what mount or environment field should exist
- what success state the operator should see
- what command to run for a quick check

Keep raw proof outside the runbook, in the active ticket rationale, including:

- screenshots captured while validating a step
- exact command output
- permission or mount inspection output
- logs gathered during validation
- rejected alternatives or follow-up notes

## Operator Journey

Follow the sections in order. Later tickets will replace placeholders with validated instructions.

## 1. Preflight And Assumptions

Purpose:
Confirm the exact NAS baseline, the operator prerequisites, and the image-reference rule before changing the system.

Verification cues to keep here:

- confirm the NAS model is `DS918+`
- confirm DSM reports `7.1.1-42962 Update 9`
- confirm the Docker package is installed via `Package Center` (on DSM 7.1.x it is listed as `Docker`; DSM 7.2+ lists it as `Container Manager`)
- confirm the operator has local-LAN access to DSM and NAS shell access if shell validation is required

## 2. Storage Layout And Shared Folder Preparation

Purpose:
Create and verify the durable Synology folder layout and bind-mount targets required by both containers.

Validation status:
This section is validated for `P6.02` on the target `DS918+ / DSM 7.1.1-42962 Update 9` NAS. DSM evidence and NAS shell proof confirmed the required `volume1` shared folders, subdirectory tree, and write checks before later container tickets rely on it.

Target shared folders on `volume1`:

- `/volume1/pirate-claw`
- `/volume1/transmission`
- `/volume1/media`

Target directory tree:

- `/volume1/pirate-claw/config`
- `/volume1/pirate-claw/runtime`
- `/volume1/pirate-claw/logs`
- `/volume1/transmission/config`
- `/volume1/transmission/watch`
- `/volume1/media/downloads`
- `/volume1/media/downloads/complete`
- `/volume1/media/downloads/complete/movies`
- `/volume1/media/downloads/complete/tv`
- `/volume1/media/downloads/incomplete`

Planned bind-mount map for later tickets:

- Pirate Claw config file: `/volume1/pirate-claw/config/pirate-claw.config.json` (read-only)
- Pirate Claw database: `/volume1/pirate-claw/config/pirate-claw.db`
- Pirate Claw runtime: `/volume1/pirate-claw/runtime`
- Pirate Claw logs: `/volume1/pirate-claw/logs`
- Transmission config: `/volume1/transmission/config`
- Transmission watch directory: `/volume1/transmission/watch`
- Shared downloads path for both containers: `/volume1/media/downloads`

Permission baseline for this phase:

- create the shared folders and subdirectories with the DSM operator account that will manage Docker containers
- confirm that account has read and write access to all three shared folders
- do not continue if any share or subdirectory is read-only, missing, or placed outside `volume1`
- container-specific runtime-user proof is deferred to the later container tickets, but this ticket must prove the paths exist, are durable, and are writable from the NAS baseline

DSM steps:

1. Open `Control Panel -> Shared Folder`.
2. Create these shared folders on `Volume 1` if they do not already exist:
   - `pirate-claw`
   - `transmission`
   - `media`
3. Open `File Station` and create these subdirectories exactly:
   - `pirate-claw/config`
   - `pirate-claw/runtime`
   - `pirate-claw/logs`
   - `transmission/config`
   - `transmission/watch`
   - `media/downloads`
   - `media/downloads/complete`
   - `media/downloads/complete/movies`
   - `media/downloads/complete/tv`
   - `media/downloads/incomplete`
4. In each shared folder's permissions view, confirm the DSM account you will use for setup has `Read/Write` access.
5. Do not create container tasks yet. This ticket stops after the storage baseline is proven.

Shell validation:

Run these commands on the NAS shell after the folders exist:

```sh
mount | grep '/volume1 '
df -h /volume1/pirate-claw /volume1/transmission /volume1/media
find /volume1/pirate-claw /volume1/transmission /volume1/media -maxdepth 2 -type d | sort
ls -ld /volume1/pirate-claw \
  /volume1/pirate-claw/config \
  /volume1/pirate-claw/runtime \
  /volume1/pirate-claw/logs \
  /volume1/transmission \
  /volume1/transmission/config \
  /volume1/transmission/watch \
  /volume1/media \
  /volume1/media/downloads \
  /volume1/media/downloads/incomplete
touch /volume1/pirate-claw/runtime/.p6-02-write-check
touch /volume1/transmission/config/.p6-02-write-check
touch /volume1/media/downloads/.p6-02-write-check
ls -l /volume1/pirate-claw/runtime/.p6-02-write-check \
  /volume1/transmission/config/.p6-02-write-check \
  /volume1/media/downloads/.p6-02-write-check
rm /volume1/pirate-claw/runtime/.p6-02-write-check \
  /volume1/transmission/config/.p6-02-write-check \
  /volume1/media/downloads/.p6-02-write-check
```

Operator verification cues:

- the three shared folders are visible in DSM and all live on `Volume 1`
- the directory tree exactly matches the target layout above
- the shell commands show the paths exist and are reachable under `/volume1`
- the write-check files can be created and removed without permission errors
- no container is created yet; this ticket validates storage only

Evidence capture guidance for `P6.02`:

- treat DSM screenshots as proof of the UI steps only; do not mark this section fully validated until the shell validation block above has also been run on the NAS
- you only need a way to reach the NAS shell; direct LAN SSH, VPN plus SSH, or another approved remote shell path are acceptable. SSH tunneling is optional and only needed if your network setup requires it
- prefer a small redacted evidence set instead of a full click-by-click gallery

Recommended screenshot set:

- `Control Panel -> Shared Folder` showing `pirate-claw`, `transmission`, and `media` on `Volume 1`
- a shared-folder permissions view showing the DSM operator account for setup has `Read/Write`
- `File Station` showing `pirate-claw/config`, `pirate-claw/runtime`, and `pirate-claw/logs`
- `File Station` showing `transmission/config` and `transmission/watch`
- `File Station` showing `media/downloads` and `media/downloads/incomplete`
- one NAS shell capture showing successful `find`, `ls -ld`, and write-check results

Redaction and cropping rules:

- crop tightly to the relevant DSM pane or shell output
- redact public IPs, hostnames, usernames, serial-like identifiers, tabs, bookmarks, and desktop notifications
- exclude unrelated shared folders, apps, or browser chrome unless the navigation itself is the evidence
- do not include secrets, tokens, or any shell history outside the commands used for this validation

Validation status rule for this section:

- `DSM steps validated, shell validation pending` is acceptable while only the screenshots exist
- `P6.02 validated` requires both the redacted DSM evidence and a successful NAS shell run of the commands in this section

## 3. Transmission Container Baseline

Purpose:
Create the known-good Transmission container baseline that uses the validated bind mounts.

Validated image reference:

- `linuxserver/transmission:latest`

Validation status:
This section is validated for `P6.03` on the target `DS918+ / DSM 7.1.1-42962 Update 9` NAS.

Container settings:

- Container name: `transmission`
- Restart policy: `always` (Docker UI: enable auto-restart)
- Network: `bridge` (default)

Port mappings:

| Host Port | Container Port | Protocol |
| --------- | -------------- | -------- |
| `9091`    | `9091`         | TCP      |
| `51413`   | `51413`        | TCP      |
| `51413`   | `51413`        | UDP      |

Bind mounts:

| Host Path (on `volume1`)       | Container Path |
| ------------------------------ | -------------- |
| `/volume1/transmission/config` | `/config`      |
| `/volume1/transmission/watch`  | `/watch`       |
| `/volume1/media/downloads`     | `/downloads`   |

Environment variables:

| Variable | Value             | Purpose                            |
| -------- | ----------------- | ---------------------------------- |
| `PUID`   | `1026`            | match the DSM operator-account UID |
| `PGID`   | `100`             | match the `users` group GID        |
| `TZ`     | `America/Chicago` | operator timezone (use your own)   |

Docker package steps:

On DSM 7.1.x the UI is `Docker`. On DSM 7.2+ it is `Container Manager`. The steps below use the DSM 7.1.x names.

1. Open `Docker -> Registry`.
2. Search for `linuxserver/transmission` and download the `latest` tag.
3. Open `Docker -> Image` and confirm `linuxserver/transmission:latest` appears.
4. Select the image and click `Launch`.
5. Set the container name to `transmission`.
6. Enable auto-restart.
7. On the port settings page, map host ports `9091 -> 9091/tcp`, `51413 -> 51413/tcp`, and `51413 -> 51413/udp`.
8. On the volume settings page, add the three bind mounts listed above.
9. On the environment page, add the `PUID`, `PGID`, and `TZ` variables with the values above.
10. Review the summary and click `Done` to create and start the container.

Finding your PUID and PGID:

Run on the NAS shell:

```sh
id
```

Use the `uid` value for `PUID` and the `gid` value for `PGID`. The example values `1026` / `100` are typical for the first non-default DSM admin account; your actual values may differ.

Synology permission note:

Synology DSM shared folders are created with restrictive ACLs by default. Before starting the container, ensure the bind-mounted directories have at least `755` permissions and are owned by the PUID:PGID user. If the container logs show `Permission denied` errors for `/config/settings.json`, fix from a root shell:

```sh
chmod 755 /volume1/transmission /volume1/transmission/config /volume1/transmission/watch /volume1/media /volume1/media/downloads
chown 1026:100 /volume1/transmission/config /volume1/transmission/watch /volume1/media/downloads
```

Restart the container after fixing permissions (`docker restart transmission`).

Docker CLI note:

On DSM 7.1.x, `docker` is not on the default SSH `PATH`. Use the full path or export it first:

```sh
export PATH="/var/packages/Docker/target/usr/bin:$PATH"
```

Alternatively, create the container through the Docker UI as described above and use the root shell only for validation commands.

Complete directory:

The `linuxserver/transmission` image expects `/downloads/complete` inside the container. Create the media-type subdirectories so Pirate Claw can route downloads by type:

```sh
mkdir -p /volume1/media/downloads/complete/movies /volume1/media/downloads/complete/tv
chown 1026:100 /volume1/media/downloads/complete /volume1/media/downloads/complete/movies /volume1/media/downloads/complete/tv
```

Post-start verification:

1. In `Docker -> Container`, confirm `transmission` shows status `Running`.
2. Open `http://<NAS-LAN-IP>:9091` in a browser on the local LAN and confirm the Transmission web UI loads.

Shell validation:

Run on the NAS shell after the container is running:

```sh
docker ps --filter name=transmission --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
```

Expected: one line showing the `transmission` container, the `linuxserver/transmission:latest` image, an `Up` status, and the three port mappings.

```sh
docker logs transmission --tail 20
```

Expected: recent log lines showing Transmission startup without fatal errors.

```sh
ls -la /volume1/transmission/config/
```

Expected: Transmission has written its runtime config files (for example `settings.json`) into the bind-mounted config directory, proving the mount is writable from inside the container.

```sh
curl -s -o /dev/null -w '%{http_code}' http://localhost:9091/transmission/web/
```

Expected: `200`, confirming the RPC/web endpoint is healthy from the NAS itself.

Operator verification cues:

- the container is running and auto-restart is enabled
- the Transmission web UI is reachable on `http://<NAS-LAN-IP>:9091` from the local LAN
- `settings.json` exists under `/volume1/transmission/config/`, proving durable bind-mount writes
- the `curl` health check returns `200`
- no Pirate Claw container exists yet; this ticket validates Transmission only
- the IPv6 LPD warning (`Couldn't initialize IPv6 LPD: No such device`) is expected in Docker bridge networking and is not a failure

## 4. Pirate Claw Container Baseline

Purpose:
Create the known-good Pirate Claw container baseline and run the existing daemon mode against the validated storage paths.

Validated image reference:

- `pirate-claw:latest` (built from repo `Dockerfile`, targeting `linux/amd64`)

Validation status:
This section is validated for `P6.04` on the target `DS918+ / DSM 7.1.1-42962 Update 9` NAS.

Container settings:

- Container name: `pirate-claw`
- Restart policy: `always` (Docker UI: enable auto-restart)
- Network: `host`

Network note:

The Pirate Claw container uses `--network host` so it can reach the Transmission RPC endpoint at `localhost:9091` without bridge networking or `host.docker.internal` (which is unavailable on Docker 20.10.x shipped with DSM 7.1.x).

Bind mounts:

| Host Path (on `volume1`)                              | Container Path                    | Mode |
| ----------------------------------------------------- | --------------------------------- | ---- |
| `/volume1/pirate-claw/config/pirate-claw.config.json` | `/config/pirate-claw.config.json` | `ro` |
| `/volume1/pirate-claw/config/.env`                    | `/config/.env`                    | `ro` |
| `/volume1/pirate-claw/data/pirate-claw.db`            | `/app/pirate-claw.db`             |      |
| `/volume1/pirate-claw/data/runtime`                   | `/data/runtime`                   |      |
| `/volume1/pirate-claw/data/poll-state.json`           | `/app/poll-state.json`            |      |

Bun `.env` auto-load caveat:

Bun automatically loads a `.env` file from its working directory (`/app`) before any user code runs. On Docker 20.10.x (DSM 7.1.x) this causes a silent crash — the process exits with no output. The workaround is to mount the config and `.env` files under `/config/` instead of `/app/` and pass `--config /config/pirate-claw.config.json` to the daemon command. The app's own `.env` loader resolves the `.env` file relative to the config path, so it finds `/config/.env` automatically.

Database durability note:

Pirate Claw writes its SQLite database to `pirate-claw.db` in the container working directory (`/app`). Without a bind mount this file would be ephemeral. The mount above maps it to `/volume1/pirate-claw/data/pirate-claw.db` on the host so it survives container recreation.

Before creating the container for the first time, create the data directory and seed files:

```sh
mkdir -p /volume1/pirate-claw/data/runtime
touch /volume1/pirate-claw/data/pirate-claw.db
touch /volume1/pirate-claw/data/poll-state.json
```

Credentials via `.env`:

Place a `.env` file at `/volume1/pirate-claw/config/.env` with the Transmission credentials:

```
PIRATE_CLAW_TRANSMISSION_USERNAME=<your-username>
PIRATE_CLAW_TRANSMISSION_PASSWORD=<your-password>
```

The `.env` file is mounted read-only inside the container at `/config/.env`. The app loads it automatically because `loadConfigEnv()` resolves `.env` relative to the config file path.

Config file:

Place the Pirate Claw config file at `/volume1/pirate-claw/config/pirate-claw.config.json`. The config must include a `runtime` section with `artifactDir` set to `/data/runtime` (matching the runtime bind mount inside the container). Set the Transmission URL to `http://localhost:9091/transmission/rpc` (reachable because the container uses host networking). Do not include `username` or `password` in the `transmission` section — those come from the `.env` file.

The `downloadDirs` section routes completed downloads by media type. The paths are container-internal paths inside Transmission's `/downloads` mount. Without `downloadDirs`, all completed downloads land flat in Transmission's default download directory with no media-type separation.

Example minimal config for validation:

```json
{
  "feeds": [],
  "tv": {
    "defaults": { "resolutions": ["1080p"], "codecs": ["x265"] },
    "shows": []
  },
  "movies": {
    "years": [2026],
    "resolutions": ["1080p"],
    "codecs": ["x265"],
    "codecPolicy": "prefer"
  },
  "transmission": {
    "url": "http://localhost:9091/transmission/rpc",
    "downloadDirs": {
      "movie": "/downloads/complete/movies",
      "tv": "/downloads/complete/tv"
    }
  },
  "runtime": {
    "runIntervalMinutes": 30,
    "reconcileIntervalMinutes": 1,
    "artifactDir": "/data/runtime",
    "artifactRetentionDays": 7
  }
}
```

The `downloadDirs` paths are container-internal. Since Transmission mounts `/volume1/media/downloads` as `/downloads`, the path `/downloads/complete/movies` maps to `/volume1/media/downloads/complete/movies` on the NAS host. Both directories must exist before the first torrent is submitted — see the "Complete directory" setup step in Section 3.

Building the image:

The repo includes a `Dockerfile` for the Pirate Claw image. Build for the DS918+ architecture:

```sh
docker build --platform linux/amd64 -t pirate-claw:latest .
```

Transfer to the NAS (from the build machine):

```sh
docker save pirate-claw:latest | gzip > /tmp/pirate-claw-latest.tar.gz
scp -O -P <NAS-SSH-PORT> /tmp/pirate-claw-latest.tar.gz <user>@<NAS-IP>:/tmp/
```

Load on the NAS (root shell):

```sh
docker load < /tmp/pirate-claw-latest.tar.gz
```

Synology SCP note:

Synology's SSH server does not support the SFTP subsystem by default. Use the `-O` flag with `scp` to force the legacy SCP protocol.

Docker package steps:

1. Confirm `pirate-claw:latest` appears under `Docker -> Image`.
2. Select the image and click `Launch`.
3. Set the container name to `pirate-claw`.
4. Enable auto-restart.
5. On the network page, select `Use the same network as Docker Host`.
6. On the volume settings page, add the five bind mounts listed above.
7. On the execution command page, set the command to `daemon --config /config/pirate-claw.config.json`.
8. Review the summary and click `Done` to create and start the container.

Shell alternative (create via CLI):

```sh
docker create \
  --name pirate-claw \
  --restart always \
  --network host \
  -v /volume1/pirate-claw/config/pirate-claw.config.json:/config/pirate-claw.config.json:ro \
  -v /volume1/pirate-claw/config/.env:/config/.env:ro \
  -v /volume1/pirate-claw/data/pirate-claw.db:/app/pirate-claw.db \
  -v /volume1/pirate-claw/data/runtime:/data/runtime \
  -v /volume1/pirate-claw/data/poll-state.json:/app/poll-state.json \
  pirate-claw:latest daemon --config /config/pirate-claw.config.json

docker start pirate-claw
```

Shell validation:

Run on the NAS shell after the container is running:

```sh
docker ps --filter name=pirate-claw --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
```

Expected: one line showing the `pirate-claw` container, the `pirate-claw:latest` image, and an `Up` status with no restart loop.

```sh
docker logs pirate-claw --tail 20
```

Expected: `daemon started` followed by `run cycle` and `reconcile cycle` log lines without fatal errors.

```sh
docker inspect pirate-claw --format '{{.HostConfig.RestartPolicy.Name}}'
```

Expected: `always`.

```sh
docker inspect pirate-claw --format '{{range .Mounts}}{{.Source}} -> {{.Destination}} ({{.Mode}}){{"\n"}}{{end}}'
```

Expected: five mount lines matching the bind-mount table above.

```sh
ls -la /volume1/pirate-claw/data/pirate-claw.db
```

Expected: non-zero file size, proving the database is being written to the durable host path.

```sh
ls /volume1/pirate-claw/data/runtime/ | tail -5
```

Expected: timestamped cycle artifact files (`.json` and `.md`), proving the daemon is writing runtime artifacts to the durable bind mount.

Operator verification cues:

- the container is running with restart policy `always` and host networking
- `daemon started` appears in the logs and cycle logs show no fatal errors
- `pirate-claw.db` exists on the host at `/volume1/pirate-claw/data/pirate-claw.db` with non-zero size
- runtime cycle artifacts are being written to `/volume1/pirate-claw/data/runtime/`
- the config file is mounted read-only; operator changes require a container restart
- both `pirate-claw` and `transmission` containers are running simultaneously

## 5. Secrets And Environment Injection

Purpose:
Document the exact env and secret inputs needed by the validated baseline, the resolution order, and the operator checks that confirm correct injection.

Validation status:
This section is validated for `P6.05` on the target `DS918+ / DSM 7.1.1-42962 Update 9` NAS.

### Secret inventory

The validated baseline requires exactly two operator-supplied secrets:

| Secret                              | Consumed by | Purpose                          |
| ----------------------------------- | ----------- | -------------------------------- |
| `PIRATE_CLAW_TRANSMISSION_USERNAME` | Pirate Claw | Authenticate to Transmission RPC |
| `PIRATE_CLAW_TRANSMISSION_PASSWORD` | Pirate Claw | Authenticate to Transmission RPC |

Transmission itself receives no secret through Docker env for this baseline. Its RPC credentials are set in its own `settings.json` (written on first start under `/volume1/transmission/config/`). The operator must ensure the Pirate Claw credentials above match what Transmission expects.

### Non-secret environment variables

| Variable | Container    | Example value     | Purpose                            |
| -------- | ------------ | ----------------- | ---------------------------------- |
| `PUID`   | Transmission | `1026`            | Match the DSM operator-account UID |
| `PGID`   | Transmission | `100`             | Match the `users` group GID        |
| `TZ`     | Transmission | `America/Chicago` | Container timezone                 |

Pirate Claw does not require any Docker-level environment variables for this baseline. Its non-secret config comes from the JSON config file.

### Pirate Claw secret resolution order

The app resolves each Transmission credential using this priority (first match wins):

1. **Inline config value** — `username` / `password` inside the `transmission` section of `pirate-claw.config.json`.
2. **`.env` file** — a file named `.env` in the same directory as the config file. The app loads it automatically via `loadConfigEnv()`.
3. **Process environment** — a `PIRATE_CLAW_TRANSMISSION_*` variable already in the container's process env (e.g., passed via `docker run -e`).

If none of the three sources provides a non-empty value, the app fails at startup with a `ConfigError`.

For the validated baseline, **use the `.env` file** (option 2). This keeps secrets out of the JSON config (which may be version-controlled) and out of Docker inspect output (which shows `-e` values in cleartext).

### `.env` file format

Place the file at `/volume1/pirate-claw/config/.env`:

```
PIRATE_CLAW_TRANSMISSION_USERNAME=<your-username>
PIRATE_CLAW_TRANSMISSION_PASSWORD=<your-password>
```

Rules:

- one `KEY=VALUE` per line
- lines starting with `#` are comments
- blank lines are ignored
- `export KEY=VALUE` is accepted (the `export` prefix is stripped)
- values are not shell-expanded — quotes are taken literally
- the file is mounted read-only inside the container at `/config/.env`

### How `.env` reaches the app

The `.env` file is bind-mounted at `/config/.env` alongside the config file at `/config/pirate-claw.config.json`. The app resolves the `.env` path relative to the config file:

```
dirname("/config/pirate-claw.config.json") + "/.env" → "/config/.env"
```

This is why both files must be under the same container directory (`/config/`). See Section 4 for the Bun `.env` auto-load caveat that prevents mounting these under `/app/`.

### Transmission credential alignment

After Transmission starts for the first time, it writes a `settings.json` to `/volume1/transmission/config/`. To enable RPC authentication:

1. Stop the Transmission container.
2. Edit `/volume1/transmission/config/settings.json`:
   - set `"rpc-authentication-required": true`
   - set `"rpc-username"` to the same value as `PIRATE_CLAW_TRANSMISSION_USERNAME`
   - set `"rpc-password"` to the matching password (Transmission hashes it on next start)
3. Start the Transmission container.

The operator must ensure the credentials in the Pirate Claw `.env` match the Transmission RPC credentials. A mismatch results in `401 Unauthorized` errors in the Pirate Claw daemon logs.

### Operator verification

Confirm Pirate Claw loaded secrets successfully:

```sh
docker logs pirate-claw --tail 30
```

Expected: `daemon started` and cycle logs with no `ConfigError` or `401` errors. If the daemon starts and processes feed cycles, the secrets were injected correctly.

Confirm the `.env` file is mounted:

```sh
docker inspect pirate-claw --format '{{range .Mounts}}{{.Source}} -> {{.Destination}} ({{.Mode}}){{"\n"}}{{end}}' | grep .env
```

Expected: `/volume1/pirate-claw/config/.env -> /config/.env (ro)`.

Confirm Transmission env injection:

```sh
docker inspect transmission --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E 'PUID|PGID|TZ'
```

Expected: the three non-secret env vars with the values configured at container creation.

Confirm Transmission RPC auth is active:

```sh
curl -s -o /dev/null -w '%{http_code}' http://localhost:9091/transmission/rpc/
```

Expected: `401` (authentication required) or `409` (CSRF token missing — means auth passed). A `200` with no auth challenge means RPC authentication may not be enabled in `settings.json`.

### Secret rotation

To change Transmission credentials:

1. Update `/volume1/pirate-claw/config/.env` on the host with the new values.
2. Update `/volume1/transmission/config/settings.json` with the matching new credentials (stop Transmission first, then restart).
3. Restart the Pirate Claw container: `docker restart pirate-claw`.

No image rebuild is required for credential changes.

## 6. Restart Semantics And Always-On Checks

Purpose:
Show how the validated containers behave across restart scenarios and what the operator should verify afterward.

Validation status:
This section is validated for `P6.06` on the target `DS918+ / DSM 7.1.1-42962 Update 9` NAS.

### Restart policy

Both containers were created with `--restart always`:

| Container      | Restart Policy | Verified via                                                                |
| -------------- | -------------- | --------------------------------------------------------------------------- |
| `transmission` | `always`       | `docker inspect transmission --format '{{.HostConfig.RestartPolicy.Name}}'` |
| `pirate-claw`  | `always`       | `docker inspect pirate-claw --format '{{.HostConfig.RestartPolicy.Name}}'`  |

With `always`, Docker restarts the container automatically after a crash, a manual `docker stop`/`docker start` cycle, or a Docker daemon restart (including NAS reboot).

### Restart scenarios

| Scenario                       | Expected behavior                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `docker restart <name>`        | Container stops and starts. Daemon resumes from durable state.                       |
| `docker stop` + `docker start` | Same as restart. No state loss because all state is bind-mounted.                    |
| NAS reboot                     | Docker daemon restarts. Both containers auto-start due to `always` policy.           |
| Container crash                | Docker auto-restarts. Check `docker inspect --format '{{.RestartCount}}'` for count. |
| Docker package update          | Same as NAS reboot — Docker daemon restarts, containers auto-start.                  |

### What survives every restart

All durable state lives on bind-mounted host paths and is never inside the container filesystem:

- `/volume1/pirate-claw/data/pirate-claw.db` — SQLite database
- `/volume1/pirate-claw/data/poll-state.json` — feed poll state
- `/volume1/pirate-claw/data/runtime/` — cycle artifacts
- `/volume1/pirate-claw/config/pirate-claw.config.json` — config (read-only mount)
- `/volume1/pirate-claw/config/.env` — secrets (read-only mount)
- `/volume1/transmission/config/` — Transmission settings and state
- `/volume1/media/downloads/` — downloaded files

### What does NOT survive container recreation

Container logs are stored inside the container's log driver. If you `docker rm` and recreate a container, previous logs are lost. Durable state (database, config, downloads) is unaffected.

### Post-restart verification

After any restart scenario, run these checks:

```sh
docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'pirate-claw|transmission'
```

Expected: both containers show `Up` status.

```sh
docker logs pirate-claw --tail 10
```

Expected: `daemon started` followed by cycle logs. No `ConfigError`, no `401`, no restart loop.

```sh
docker logs transmission --tail 10
```

Expected: Transmission startup lines without fatal errors.

```sh
ls -la /volume1/pirate-claw/data/pirate-claw.db
```

Expected: recent modification timestamp, proving the daemon is writing to the database after restart.

### NAS reboot verification

After a NAS reboot, additionally verify that Docker itself is running:

```sh
docker info >/dev/null 2>&1 && echo "Docker OK" || echo "Docker not running"
```

If Docker is not running, check that the Docker package is enabled in `Package Center`. On DSM 7.1.x, Docker auto-starts if the package is set to run on boot (the default).

## 7. Upgrade Path

Purpose:
Document the supported update path from one known-good image state to the next without losing durable state.

Validation status:
This section is validated for `P6.07` on the target `DS918+ / DSM 7.1.1-42962 Update 9` NAS.

### Image upgrade procedure (Pirate Claw)

When a new version of Pirate Claw is built and needs to be deployed:

1. **Build the new image** on the development machine:

   ```sh
   docker build --platform linux/amd64 -t pirate-claw:latest .
   ```

2. **Transfer to the NAS**:

   ```sh
   docker save pirate-claw:latest | gzip > /tmp/pirate-claw-latest.tar.gz
   scp -O -P <NAS-SSH-PORT> /tmp/pirate-claw-latest.tar.gz <user>@<NAS-IP>:/tmp/
   ```

3. **Load on the NAS** (root shell):

   ```sh
   docker load < /tmp/pirate-claw-latest.tar.gz
   ```

4. **Recreate the container** with the new image:

   ```sh
   docker stop pirate-claw
   docker rm pirate-claw
   docker create \
     --name pirate-claw \
     --restart always \
     --network host \
     -v /volume1/pirate-claw/config/pirate-claw.config.json:/config/pirate-claw.config.json:ro \
     -v /volume1/pirate-claw/config/.env:/config/.env:ro \
     -v /volume1/pirate-claw/data/pirate-claw.db:/app/pirate-claw.db \
     -v /volume1/pirate-claw/data/runtime:/data/runtime \
     -v /volume1/pirate-claw/data/poll-state.json:/app/poll-state.json \
     pirate-claw:latest daemon --config /config/pirate-claw.config.json
   docker start pirate-claw
   ```

5. **Verify** the upgraded container:

   ```sh
   docker ps --filter name=pirate-claw --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
   docker logs pirate-claw --tail 20
   ```

   Confirmed working state looks like:

   ```
   pirate-claw   pirate-claw:latest   Up N seconds
   ```

   Logs should show `daemon started` followed by a reconcile cycle within a few seconds.

6. **Clean up** the transferred archive and dangling old image layers on the NAS:

   ```sh
   rm /tmp/pirate-claw-latest.tar.gz
   docker image prune -f
   ```

   When `docker load` replaces an existing `pirate-claw:latest`, the old image layers are automatically re-tagged to `<none>:<none>` (dangling). `docker image prune -f` removes them and reclaims disk space without prompting. This is safe — the old container was already removed in step 4.

### What to back up before upgrading

Before replacing the image, optionally back up the database:

```sh
cp /volume1/pirate-claw/data/pirate-claw.db /volume1/pirate-claw/data/pirate-claw.db.bak
```

The config file and `.env` are not affected by image upgrades (they are read-only bind mounts). The database is preserved because it lives on the host. The backup is a precaution in case the new image includes schema migrations.

### What gets recreated versus what stays

| Artifact                      | Survives upgrade? | Notes                          |
| ----------------------------- | ----------------- | ------------------------------ |
| `pirate-claw.db`              | Yes               | Bind-mounted host path         |
| `poll-state.json`             | Yes               | Bind-mounted host path         |
| `pirate-claw.config.json`     | Yes               | Read-only bind mount           |
| `.env`                        | Yes               | Read-only bind mount           |
| Runtime artifacts             | Yes               | Bind-mounted host path         |
| Container logs                | No                | Lost when container is removed |
| Container-internal temp files | No                | Ephemeral, not needed          |

### Image upgrade procedure (Transmission)

Transmission upgrades follow the same pattern. Since it uses the public `linuxserver/transmission:latest` image:

```sh
docker pull linuxserver/transmission:latest
docker stop transmission
docker rm transmission
```

Then recreate the container using the same settings from Section 3. All Transmission state lives under `/volume1/transmission/config/` and `/volume1/media/downloads/`, both bind-mounted.

### Config-only changes

If only the config file or `.env` changed (no new image):

```sh
docker restart pirate-claw
```

No container recreation is needed — just a restart so the app re-reads the config.

Example: enabling the daemon HTTP API. Add `"apiPort"` to the `runtime` block in `/volume1/pirate-claw/config/pirate-claw.config.json`:

```json
"runtime": {
  "runIntervalMinutes": 30,
  "reconcileIntervalMinutes": 1,
  "artifactDir": "/data/runtime",
  "artifactRetentionDays": 7,
  "apiPort": 3000
}
```

Then restart:

```sh
docker restart pirate-claw
```

Verify the API is listening by checking logs:

```sh
docker logs pirate-claw --tail 5
```

Expected: a line reading `api listening on port 3000`. Since pirate-claw runs on host networking, the endpoints are immediately reachable from any browser on the LAN at `http://<NAS-LAN-IP>:3000/api/health`, `/api/status`, `/api/candidates`, `/api/shows`, and `/api/movies`. No port mapping or container recreation is required.

## 8. Fresh End-To-End Validation

Purpose:
Walk a clean-environment operator through the full happy path and confirm the exit condition directly.

Validation status:
This section is validated for `P6.08` on the target `DS918+ / DSM 7.1.1-42962 Update 9` NAS.

### Validation summary

The full operator journey was validated end-to-end during Phase 06 development on the target NAS. The validated path:

1. Storage layout created and verified (Section 2)
2. Transmission container launched with validated bind mounts and env (Section 3)
3. Transmission web UI confirmed healthy at `http://<NAS-LAN-IP>:9091`
4. Pirate Claw image built, transferred, loaded on NAS (Section 4)
5. Config and `.env` placed on host, credentials aligned with Transmission
6. Pirate Claw container launched with validated bind mounts and `--config /config/pirate-claw.config.json`
7. Daemon started, processing 63 feed items per cycle, writing to durable database and runtime artifacts
8. Both containers running simultaneously with `--restart always`

### Fresh-start operator checklist

An operator starting from zero should follow Sections 1 through 6 in order. After completing all sections:

- [ ] Transmission container is running and web UI is accessible
- [ ] Pirate Claw container is running with `daemon started` in logs
- [ ] `pirate-claw.db` exists on host with non-zero size
- [ ] Runtime artifacts are being written to `/volume1/pirate-claw/data/runtime/`
- [ ] No `ConfigError`, `401 Unauthorized`, or crash loops in daemon logs
- [ ] Both containers have `--restart always` policy
- [ ] Credentials in `.env` match Transmission `settings.json`

### End-state verification commands

Run all of these after completing the full setup:

```sh
# Both containers running
docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'pirate-claw|transmission'

# Pirate Claw healthy
docker logs pirate-claw --tail 10

# Transmission healthy
curl -s -o /dev/null -w '%{http_code}' http://localhost:9091/transmission/web/

# Database durable
ls -la /volume1/pirate-claw/data/pirate-claw.db

# Runtime artifacts durable
ls /volume1/pirate-claw/data/runtime/ | tail -3

# Restart policies
docker inspect pirate-claw --format '{{.HostConfig.RestartPolicy.Name}}'
docker inspect transmission --format '{{.HostConfig.RestartPolicy.Name}}'
```

Expected: both containers `Up`, daemon logs clean, Transmission returns `200`, database file has recent timestamp, runtime artifacts exist, both restart policies show `always`.

## 9. Troubleshooting

Purpose:
Provide the shortest useful path to inspect the most likely failures on the validated baseline.

Validation status:
This section is validated for `P6.09` on the target `DS918+ / DSM 7.1.1-42962 Update 9` NAS. Failure signatures are drawn from issues encountered during Phase 06 development.

### Docker not on PATH

Symptom: `docker: command not found` on NAS shell.

Fix:

```sh
export PATH="/var/packages/Docker/target/usr/bin:$PATH"
```

Or use the full path: `/var/packages/Docker/target/usr/bin/docker`.

### Container crashes immediately (no output)

Symptom: `docker logs pirate-claw` shows nothing or only a partial startup line. Container restart count keeps climbing.

Most likely cause: **Bun `.env` auto-load crash**. Check that `.env` is NOT mounted at `/app/.env`. It must be at `/config/.env`. See Section 4 "Bun `.env` auto-load caveat."

Diagnosis:

```sh
docker inspect pirate-claw --format '{{range .Mounts}}{{.Destination}}{{"\n"}}{{end}}' | grep -E '\.env'
```

If the output shows `/app/.env`, recreate the container with the mount at `/config/.env` instead.

### ConfigError at startup

Symptom: daemon logs show `ConfigError: Config file ... must be a non-empty string or come from PIRATE_CLAW_TRANSMISSION_USERNAME`.

Cause: the `.env` file is missing, empty, or not mounted. Or the keys are misspelled.

Fix:

1. Verify the `.env` exists on the host: `cat /volume1/pirate-claw/config/.env`
2. Verify the mount: `docker inspect pirate-claw --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' | grep .env`
3. Verify key names are exactly `PIRATE_CLAW_TRANSMISSION_USERNAME` and `PIRATE_CLAW_TRANSMISSION_PASSWORD`

### 401 Unauthorized in daemon logs

Symptom: daemon starts but cycle logs show `401` errors when contacting Transmission.

Cause: credential mismatch between `.env` and Transmission `settings.json`.

Fix:

1. Check the username in `.env`: `grep USERNAME /volume1/pirate-claw/config/.env`
2. Check the username in Transmission config: `grep rpc-username /volume1/transmission/config/settings.json`
3. If they differ, update one to match the other
4. Restart both containers after fixing

### Transmission web UI unreachable

Symptom: `http://<NAS-LAN-IP>:9091` does not load.

Diagnosis:

```sh
docker ps --filter name=transmission
docker logs transmission --tail 20
curl -s -o /dev/null -w '%{http_code}' http://localhost:9091/transmission/web/
```

Common causes:

- Container not running → check `docker ps` and `docker logs`
- Port not mapped → verify port 9091 mapping in `docker inspect transmission`
- Firewall → DSM Firewall may block port 9091; check `Control Panel -> Security -> Firewall`

### Permission denied on bind mounts

Symptom: container logs show `Permission denied` when writing to `/config`, `/downloads`, or `/data`.

Fix:

```sh
chmod 755 /volume1/pirate-claw/data /volume1/pirate-claw/data/runtime
chown 1026:100 /volume1/pirate-claw/data /volume1/pirate-claw/data/runtime
```

For Transmission:

```sh
chmod 755 /volume1/transmission/config /volume1/transmission/watch /volume1/media/downloads
chown 1026:100 /volume1/transmission/config /volume1/transmission/watch /volume1/media/downloads
```

Replace `1026:100` with your actual `PUID:PGID`.

### SCP transfer fails

Symptom: `scp` hangs or fails when transferring the image tarball to the NAS.

Fix: use the `-O` flag to force the legacy SCP protocol:

```sh
scp -O -P <PORT> /tmp/pirate-claw-latest.tar.gz <user>@<NAS-IP>:/tmp/
```

Synology's SSH server does not support the SFTP subsystem by default.

### Database locked or corrupted

Symptom: daemon logs show `SQLITE_BUSY` or `database is locked`.

Cause: only one process should access the database at a time. If you ran a `pirate-claw` CLI command while the daemon container is running, they may conflict.

Fix: stop the container before running CLI commands against the same database, or use a separate database path for one-off commands.

### IPv6 LPD warning in Transmission logs

Symptom: `Couldn't initialize IPv6 LPD: No such device` in Transmission logs.

This is expected in Docker bridge networking and is not a failure. IPv6 LPD (Local Peer Discovery) is a optional optimization that requires host-level IPv6 support.

## 10. Portability Notes

Purpose:
Separate validated claims from nearby but non-validated Synology variants.

Validation status:
This section documents the explicit boundary of Phase 06 validation.

### What was validated

This runbook was validated exclusively on:

- **Hardware**: Synology DS918+ (Apollo Lake, Celeron J3455)
- **DSM version**: 7.1.1-42962 Update 9
- **Docker package**: Docker 20.10.3 (DSM 7.1.x package named `Docker`)
- **Linux kernel**: 4.4.x (reported by the NAS)
- **Network**: local LAN access only, no remote access or VPN
- **Architecture**: `linux/amd64`

### Likely-portable notes (NOT validated)

The following are reasonable expectations but are **not validated** by this runbook:

**Other DS918+ DSM versions (7.1.x patch levels)**:
The same Docker package version ships across 7.1.x patches. Steps should apply identically.

**DSM 7.2.x / Container Manager**:
The Docker UI was renamed to `Container Manager` in DSM 7.2. The underlying Docker engine is compatible. UI steps may differ slightly (different menu names, layout changes). The kernel remains 4.4.x on Apollo Lake hardware, so the Bun `.env` auto-load caveat still applies.

**Other Intel-based Synology models (x86_64)**:
Models like DS920+, DS1621+, DS723+ use `linux/amd64` images. The container setup should work. Differences may include:

- Different kernel branch (Geminilake and newer may have kernel 4.4.x or higher)
- Different default PUID/PGID
- Different shared folder paths if not on `volume1`

**ARM-based Synology models**:
The Pirate Claw Docker image is built for `linux/amd64`. ARM models (DS220j, DS120j, etc.) cannot run this image. A separate `linux/arm64` build would be needed, and this is not validated.

### Known platform-specific issues

**`statx` syscall on kernel 4.4.x**:
Bun versions 1.2.3+ use the `statx` syscall (via Zig 0.14), which requires kernel 4.11+. On kernel 4.4.x (all current Apollo Lake DSM versions), `statx` returns `ENOSYS`. This causes a silent crash when Bun auto-loads a `.env` file from its working directory. The workaround (mounting `.env` under `/config/` instead of `/app/`) is required on any Synology model running kernel 4.4.x regardless of DSM version.

**Docker version on DSM 7.1.x**:
Docker 20.10.x does not support `host.docker.internal`. The Pirate Claw container uses `--network host` as a workaround. DSM 7.2.x may ship a newer Docker version where `host.docker.internal` works, but this is not validated.

### What Phase 06 does NOT cover

- Remote access (QuickConnect, VPN, reverse proxy)
- Multi-volume or SHR-2 RAID configurations
- Running Pirate Claw outside Docker (direct Bun on NAS)
- ARM-based Synology hardware
- DSM 6.x or earlier
- Clustered or high-availability Synology setups
- Automated backup or snapshot strategies for the database
