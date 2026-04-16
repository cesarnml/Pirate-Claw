# Synology Runbook

This is the canonical operator-facing Synology deployment guide for Pirate Claw.

The historical Phase 06 validation artifact still lives at
`docs/02-delivery/phase-06/synology-runbook.md`. Keep that file for the
original validated baseline and ticket rationale trail. Use this top-level
document for current operational guidance.

## Scope

This document is for the actual NAS deployment shape that Pirate Claw now
depends on in production:

- Synology `DS918+`
- DSM `7.1.1-42962 Update 9`
- DSM `Docker` package (`Docker`, not `Container Manager`)
- always-on LAN-first operation
- separate `pirate-claw`, `pirate-claw-web`, `transmission`, and `gluetun`
  containers

## Current Production Snapshot

Observed directly on the live NAS on `2026-04-16`:

- `pirate-claw`, `pirate-claw-web`, and `transmission` were running
- `pirate-claw` restart policy: `always`
- `pirate-claw-web` restart policy: `always`
- `pirate-claw` network mode: `host`
- `pirate-claw-web` network mode: `host`
- `transmission` network mode: `container:<gluetun-id>`
- daemon API reachable on `http://localhost:5555`
- web UI reachable from the separate `pirate-claw-web` container on port `3001`

## Storage Layout

Use these host paths under `/volume1`:

- `/volume1/pirate-claw/config`
- `/volume1/pirate-claw/data`
- `/volume1/transmission/config`
- `/volume1/media/downloads`

Expected durable files and directories:

- `/volume1/pirate-claw/config/pirate-claw.config.json`
- `/volume1/pirate-claw/config/.env`
- `/volume1/pirate-claw/data/pirate-claw.db`
- `/volume1/pirate-claw/data/poll-state.json`
- `/volume1/pirate-claw/data/runtime/`
- `/volume1/transmission/config/`
- `/volume1/media/downloads/`

## Container Topology

### `pirate-claw`

Purpose:
Runs the Bun daemon and owns the HTTP API.

Observed container contract:

- image: `pirate-claw:latest`
- restart policy: `always`
- network: `host`
- command: `daemon --config /config/pirate-claw.config.json`
- entrypoint: `bun run dist/cli.js`

Required mounts:

- `/volume1/pirate-claw/config -> /config`
- `/volume1/pirate-claw/data/pirate-claw.db -> /app/pirate-claw.db`
- `/volume1/pirate-claw/data/runtime -> /app/.pirate-claw/runtime`
- `/volume1/pirate-claw/data/poll-state.json -> /app/poll-state.json`

Critical rule:

- the daemon must receive the whole `/config` directory as a writable bind mount
  if Web UI config saves are enabled
- a single-file writable bind mount for `pirate-claw.config.json` is not enough
  because Pirate Claw writes a sibling temp file and then renames it atomically
- if you want stricter secret hardening, layer a separate read-only `.env` bind
  mount on top of the writable `/config` directory, but the current live NAS now
  runs with the directory mount alone

Reason:

The live daemon supports `PUT /api/config`, `PUT /api/config/feeds`,
`PUT /api/config/tv/defaults`, and `PUT /api/config/movies`. Those writes are
real file writes, not in-memory-only updates, and they use an atomic
temp-file-plus-rename flow.

### `pirate-claw-web`

Purpose:
Runs the SvelteKit UI separately from the daemon.

Observed container contract:

- image: `pirate-claw-web:latest`
- restart policy: `always`
- network: `host`
- env:
  - `HOST=0.0.0.0`
  - `PORT=3001`
  - `ORIGIN=http://100.108.117.42:3001` in the current live deployment
  - `PIRATE_CLAW_API_URL=http://localhost:5555`
  - `PIRATE_CLAW_API_WRITE_TOKEN=<same write token the daemon accepts>`

Critical rule:

- when using SvelteKit `adapter-node`, set `ORIGIN` to the actual browser-facing
  origin for the web UI
- `HOST=0.0.0.0` is only the bind address, not a valid browser origin
- without `ORIGIN`, form actions fail with `Cross-site POST form submissions are forbidden`

### `transmission`

Purpose:
Downloader runtime.

Observed container contract:

- image: `linuxserver/transmission:latest`
- restart policy: `always`
- network: `container:<gluetun-id>`

Required mounts:

- `/volume1/transmission/config -> /config`
- `/volume1/media/downloads -> /downloads`

### `gluetun`

Purpose:
Provides the shared network namespace for Transmission in the current live
deployment.

This is part of the current production profile and should be documented
explicitly anywhere the Transmission network mode is described.

## Config And Secrets Contract

Use `/volume1/pirate-claw/config/.env` for secrets that should not live in the
JSON config.

Minimum expected keys in the current deployment:

- `PIRATE_CLAW_API_WRITE_TOKEN`
- `PIRATE_CLAW_TRANSMISSION_USERNAME`
- `PIRATE_CLAW_TRANSMISSION_PASSWORD`

The daemon currently also supports inline Transmission credentials in
`pirate-claw.config.json`, but the recommended operator stance is:

- keep the write token and Transmission credentials in `.env`
- keep `pirate-claw.config.json` for non-secret runtime and policy settings

## Plex Media Server Integration (Phase 18)

Plex enrichment is optional. Add a `plex` block to
`/volume1/pirate-claw/config/pirate-claw.config.json` to enable it:

```json
{
  "plex": {
    "url": "http://172.17.0.1:32400",
    "token": "YOUR_PLEX_TOKEN",
    "refreshIntervalMinutes": 30
  }
}
```

- `url`: base URL of the local Plex Media Server
- when Plex is installed on the NAS via Synology Package Center and
  `pirate-claw` runs in Docker, `localhost` and `127.0.0.1` inside the
  container point back to the container, not to the NAS host
- in that deployment shape, point `plex.url` at the Docker host gateway instead;
  on this NAS the working value is `http://172.17.0.1:32400`
- if your Docker bridge uses a different gateway, inspect that network and use
  the host-side gateway address instead
- `token`: your Plex authentication token (see below for how to find it)
- `refreshIntervalMinutes`: how often the background refresh fires; defaults to
  `30`; set `0` to disable background refresh

The token is redacted in `GET /api/config` responses. If you prefer to keep it
out of the JSON file entirely, set `PIRATE_CLAW_PLEX_TOKEN` in
`/volume1/pirate-claw/config/.env` instead and omit the `token` field.

### Host vs Container `localhost`

- from an SSH shell on the NAS, `localhost:32400` reaches the Plex service on
  the NAS host
- from inside the `pirate-claw` container, `localhost:32400` means the
  container itself, so Plex requests fail or time out
- Docker exposes the NAS host to containers through the bridge gateway; on this
  NAS that host-side address is `172.17.0.1`

### Verify The Plex URL From Inside The Container

```sh
sudo /usr/local/bin/docker exec pirate-claw sh -lc \
  'wget -S -O - --timeout=5 "http://172.17.0.1:32400/identity?X-Plex-Token=YOUR_PLEX_TOKEN"'
```

Expected result: `HTTP/1.1 200 OK` with a short XML `MediaContainer` response.

### How To Find Your Plex Token

Recommended method:

1. Sign in to Plex Web at `http://<nas-ip>:32400/web` or `https://app.plex.tv`
2. Open any movie or TV episode in your library
3. Click the `...` menu on that item and choose `Get Info`
4. In the media info dialog, click `View XML`
5. In the new browser tab, look at the URL in the address bar
6. The Plex token is the value after `X-Plex-Token=` at the end of that URL

Fallback methods:

1. Play any item, open the browser developer console, and inspect a Plex API
   request; the token appears as the `X-Plex-Token` query parameter
2. Settings → Account → `<username>` XML link; the token appears in the
   `authToken` attribute

### Verification

After restarting the `pirate-claw` container with the `plex` block configured:

```sh
curl -s http://localhost:5555/api/movies | jq '.[0] | {plexStatus, watchCount, lastWatchedAt}'
```

Expected on first boot (before the first refresh sweep completes):

```json
{ "plexStatus": "unknown", "watchCount": null, "lastWatchedAt": null }
```

Expected after the first refresh sweep:

```json
{
  "plexStatus": "in_library",
  "watchCount": 3,
  "lastWatchedAt": "2026-01-15T21:00:00.000Z"
}
```

or `"missing"` for items not found in the Plex library.

If Plex is unreachable, the daemon logs a warning and continues; existing cache
entries are preserved and API responses return `"unknown"` for expired rows.

## Runtime Config Contract

The current live config uses:

- `runtime.artifactDir: ".pirate-claw/runtime"`
- `runtime.apiPort: 5555`
- `runtime.tmdbRefreshIntervalMinutes: 360`

That path is relative to the daemon working directory and maps to the mounted
host directory through:

- host: `/volume1/pirate-claw/data/runtime`
- container: `/app/.pirate-claw/runtime`

## Known Drift Reconciled On 2026-04-16

The historical Phase 06 runbook no longer matches the live NAS in several
important ways:

- the canonical runbook used to live under `docs/02-delivery/phase-06/`
- production now includes a separate `pirate-claw-web` container
- production now runs Transmission behind `gluetun`
- the daemon runtime mount uses `/app/.pirate-claw/runtime`, not `/data/runtime`
- the old runbook described the daemon config file mount as read-only, which
  breaks Web UI config writes

## Required Fix For Web UI Saves

If the daemon config file is mounted read-only, authenticated Web UI saves fail
with a `500`.

The correct deployment contract is:

1. mount `/volume1/pirate-claw/config` writable at `/config` in the
   `pirate-claw` container
2. restart `pirate-claw`
3. verify `PUT /api/config` succeeds before trusting the UI
4. optionally re-add a read-only file mount for `/config/.env` if you want
   stronger secret isolation

## Verification Commands

Run on the NAS shell:

```sh
sudo -n /usr/local/bin/docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}'
sudo -n /usr/local/bin/docker inspect pirate-claw --format '{{range .Mounts}}{{.Source}}|{{.Destination}}|{{.Mode}}|RW={{.RW}}{{println}}{{end}}'
sudo -n /usr/local/bin/docker inspect pirate-claw-web --format '{{range .Config.Env}}{{println .}}{{end}}' | grep PIRATE_CLAW_API_URL
curl -si http://localhost:5555/api/config | sed -n '1,20p'
```

Expected checks:

- all required containers are `Up`
- `/config` is writable in the daemon container
- the daemon API returns `200 OK`
- a config write no longer returns `500`

## Deploying new daemon and web images (from a dev machine)

Use this when you have a fresh checkout on your laptop and want the same
`pirate-claw.config.json`, repo-root `.env`, and `web/.env` on the NAS.

### 1. Copy source to the NAS (tar over SSH)

Synology often rejects `rsync` over SSH (`Permission denied` after the server
starts `rsync --server`) and may disable `scp` (`subsystem request failed`).
**Tar over SSH is reliable.**

On the dev machine, from the repo root:

```sh
DEST=cesarnml@100.108.117.42
SSH_PORT=25
BUILD_DIR=/volume1/pirate-claw/runtime/phase18-build

ssh -p "$SSH_PORT" "$DEST" "rm -rf \"$BUILD_DIR\" && mkdir -p \"$BUILD_DIR\""

tar czf - \
  --exclude=node_modules \
  --exclude=web/node_modules \
  --exclude=.git \
  --exclude='.pirate-claw' \
  --exclude=dist \
  . | ssh -p "$SSH_PORT" "$DEST" "cd \"$BUILD_DIR\" && tar xzf -"
```

### 2. Copy secrets and config (repo `.env`, `pirate-claw.config.json`, `web/.env`)

Files under `/volume1/pirate-claw/config/` are often owned by `root`, so use
`sudo tee` from stdin:

```sh
ssh -p "$SSH_PORT" "$DEST" "sudo -n tee /volume1/pirate-claw/config/.env > /dev/null" < .env
ssh -p "$SSH_PORT" "$DEST" "sudo -n tee /volume1/pirate-claw/config/pirate-claw.config.json > /dev/null" < pirate-claw.config.json
ssh -p "$SSH_PORT" "$DEST" "sudo -n tee /volume1/pirate-claw/config/web.env > /dev/null" < web/.env
```

`web/.env` is stored as **`web.env`** on the NAS so the web container can use
`--env-file` (Docker env-file format: `KEY=value` lines only).

Ensure **`ORIGIN`** is set for SvelteKit `adapter-node` (add if missing):

```sh
ssh -p "$SSH_PORT" "$DEST" \
  'grep -q "^ORIGIN=" /volume1/pirate-claw/config/web.env || echo "ORIGIN=http://100.108.117.42:3001" | sudo -n tee -a /volume1/pirate-claw/config/web.env >/dev/null'
```

Optional daemon secrets (same `/config/.env` as today):

- `PIRATE_CLAW_PLEX_TOKEN` — omit `plex.token` from JSON if you set this

### 3. Build `pirate-claw:latest` on the NAS

```sh
ssh -p "$SSH_PORT" "$DEST" \
  "cd \"$BUILD_DIR\" && sudo -n /usr/local/bin/docker build -t pirate-claw:latest ."
```

### 4. Build `pirate-claw-web:latest` on the NAS (Bun workaround)

On DSM, **`bun run build` inside the official multi-stage Dockerfile often
exits with a generic Bun error** during `vite build`. A reliable workaround is
to produce `web/build` and `web/node_modules` with **Node** in a one-off
container, then use a tiny runtime-only Dockerfile.

One-off web build:

```sh
ssh -p "$SSH_PORT" "$DEST" \
  "sudo -n /usr/local/bin/docker run --rm -v \"$BUILD_DIR/web:/app\" -w /app node:22-alpine sh -lc 'npm install --ignore-scripts && npx vite build'"
```

Runtime image (write once next to the build tree, then build):

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY web/build ./build
COPY web/package.json ./
COPY web/node_modules ./node_modules
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
EXPOSE 3001
CMD ["node", "build"]
```

Save as `$BUILD_DIR/Dockerfile.web-runtime` on the NAS, then:

```sh
ssh -p "$SSH_PORT" "$DEST" \
  "cd \"$BUILD_DIR\" && sudo -n /usr/local/bin/docker build -f Dockerfile.web-runtime -t pirate-claw-web:latest ."
```

### 5. Recreate containers so new image IDs are picked up

`docker restart` keeps the old image layer; remove and recreate when the tag
was rebuilt.

```sh
ssh -p "$SSH_PORT" "$DEST" "sudo -n /usr/local/bin/docker stop pirate-claw pirate-claw-web"
ssh -p "$SSH_PORT" "$DEST" "sudo -n /usr/local/bin/docker rm pirate-claw pirate-claw-web"

ssh -p "$SSH_PORT" "$DEST" "sudo -n /usr/local/bin/docker run -d --name pirate-claw --restart always --network host \
  -v /volume1/pirate-claw/config:/config \
  -v /volume1/pirate-claw/data/pirate-claw.db:/app/pirate-claw.db \
  -v /volume1/pirate-claw/data/runtime:/app/.pirate-claw/runtime \
  -v /volume1/pirate-claw/data/poll-state.json:/app/poll-state.json \
  pirate-claw:latest daemon --config /config/pirate-claw.config.json"

ssh -p "$SSH_PORT" "$DEST" "sudo -n /usr/local/bin/docker run -d --name pirate-claw-web --restart always --network host \
  --env-file /volume1/pirate-claw/config/web.env \
  pirate-claw-web:latest"
```

Smoke test on the NAS:

```sh
ssh -p "$SSH_PORT" "$DEST" "curl -s -o /dev/null -w 'api:%{http_code}\n' http://127.0.0.1:5555/api/config"
ssh -p "$SSH_PORT" "$DEST" "curl -s -o /dev/null -w 'web:%{http_code}\n' http://127.0.0.1:3001/"
```

## Historical Validation Trail

For the original Phase 06 ticket-by-ticket validation record, use:

- `docs/01-product/phase-06-synology-runbook.md`
- `docs/02-delivery/phase-06/implementation-plan.md`
- `docs/02-delivery/phase-06/synology-runbook.md`
