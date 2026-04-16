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
  - `PIRATE_CLAW_API_URL=http://localhost:5555`
  - `PIRATE_CLAW_API_WRITE_TOKEN=<same write token the daemon accepts>`

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

## Historical Validation Trail

For the original Phase 06 ticket-by-ticket validation record, use:

- `docs/01-product/phase-06-synology-runbook.md`
- `docs/02-delivery/phase-06/implementation-plan.md`
- `docs/02-delivery/phase-06/synology-runbook.md`
