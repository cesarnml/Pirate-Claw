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

The `linuxserver/transmission` image expects `/downloads/complete` inside the container. Create it on the host if it does not already exist:

```sh
mkdir -p /volume1/media/downloads/complete
chown 1026:100 /volume1/media/downloads/complete
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
    "url": "http://localhost:9091/transmission/rpc"
  },
  "runtime": {
    "runIntervalMinutes": 30,
    "reconcileIntervalMinutes": 1,
    "artifactDir": "/data/runtime",
    "artifactRetentionDays": 7
  }
}
```

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

Verification cues to keep here:

- expected restart policy settings
- what should survive container recreation or NAS reboot
- which logs, UI states, or commands confirm healthy recovery

## 7. Upgrade Path

Purpose:
Document the supported update path from one known-good image state to the next without losing durable state.

Verification cues to keep here:

- what to back up or snapshot before replacement
- what gets recreated versus what stays bind-mounted
- which post-upgrade checks prove the baseline still holds

## 8. Fresh End-To-End Validation

Purpose:
Walk a clean-environment operator through the full happy path and confirm the exit condition directly.

Verification cues to keep here:

- one explicit validation input and expected result
- exact end-state checks for both containers and durable paths
- anything the operator must verify before calling the run complete

## 9. Troubleshooting

Purpose:
Provide the shortest useful path to inspect the most likely failures on the validated baseline.

Verification cues to keep here:

- where to inspect logs
- how to verify mounts, permissions, and container state
- how to distinguish storage mistakes from app or container mistakes

## 10. Portability Notes

Purpose:
Separate validated claims from nearby but non-validated Synology variants.

Verification cues to keep here:

- label non-validated notes explicitly
- do not present portability guesses as baseline truth
