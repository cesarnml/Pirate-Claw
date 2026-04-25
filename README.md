# Pirate Claw

Pirate Claw is a local CLI for pulling media candidates from RSS feeds, matching them against your rules, and queueing approved downloads in Transmission.

Phases **01–26** shipped the current core product: the CLI/runtime stack, Obsidian Tide dashboard, zero-file-edit bootstrap, browser-only setup flow, the dashboard Transmission layer (Torrent Manager pause/resume/remove/remove-with-delete, missing-torrent disposition, Feed Event Log with failed-enqueue **Queue** retries, and matching daemon routes), browser-managed Plex auth with durable device identity plus best-effort silent renewal, Synology restart durability, browser-visible restart round-trip proof, and Mac first-class always-on deployment. The current release-blocking planning sequence is **Phase 27** Synology DSM-first stack/cold start, **Phase 28** owner web security, **Phase 29** OpenVPN bridge for bundled Transmission, **Phase 30** UX/UI polish, then the **Phase 31** v1.0.0 / schema-versioning release ceremony (`schemaVersion`, SQLite `PRAGMA user_version`, `VERSIONING.md`, CHANGELOG, tagged release). See `docs/01-product/`.

It currently supports:

- RSS feeds for TV and movies
- title normalization into media metadata
- TV matching with per-title rules
- compact TV config via `tv.defaults + tv.shows` with per-show overrides
- movie matching with global year, resolution, and codec preferences
- local dedupe and run history in SQLite
- queueing through Transmission RPC
- status inspection and retry of failed submissions
- effective config inspection via `pirate-claw config show`
- env-backed Transmission credentials via process env or `.env`
- daemon HTTP API with read endpoints and bounded config writes when `runtime.apiPort` is set
- optional TMDB-backed posters, ratings, and metadata when a `tmdb` API key is configured
- optional Plex-backed library status, watch counts, and last-watched timestamps when a `plex` server is configured
- browser-managed Plex connect / reconnect from onboarding or `/config`, with durable device identity stored in SQLite and the current usable Plex credential persisted back into `plex.token`
- browser dashboard (`web/`) with Obsidian Tide styling, starter-mode bootstrap, browser-only onboarding/setup, sidebar navigation, unified config editing, in-context daemon controls, poster-forward TV/movie views, live Transmission stats, dashboard panels for active downlinks and feed outcomes, Torrent Manager context actions (pause/resume/remove/remove-with-delete), missing-torrent disposition, and the failed-enqueue event log with **Queue** retries (deduped matched candidates whose Transmission enqueue failed and are still retryable)

## Commands

- `pirate-claw run`
- `pirate-claw daemon`
- `pirate-claw status`
- `pirate-claw retry-failed`
- `pirate-claw reconcile`
- `pirate-claw plex-refresh` (when `plex` is configured: re-query Plex and update the SQLite library cache)
- `pirate-claw config show`

## First Boot (Zero File Editing)

Pirate Claw creates its own starter config on first boot. No SSH, no vim, no hand-edited files are required to reach the browser or complete initial setup.

### Mac (supported `launchd` daemon path)

**Plex prerequisite:** Plex Media Server **1.43.0 or later**. Download the current release from [plex.tv/media-server-downloads](https://www.plex.tv/media-server-downloads/). Install as a normal Mac app and confirm it is running before starting Pirate Claw.

Supported always-on Mac deployment now uses a per-user `launchd` agent under a
dedicated always-logged-in operator account. The operator-facing guide is
[`docs/mac-runbook.md`](./docs/mac-runbook.md). The narrower supervisor
contract and reference artifact remain in
[`docs/mac-launchd-reference.md`](./docs/mac-launchd-reference.md).

**First-boot sequence:**

1. Install dependencies: `bun install`
2. Start Transmission and enable remote access (RPC on port 9091)
3. Start the daemon:

```bash
bun run daemon
```

4. Open the dashboard:

```bash
bun install --cwd web
bun run --cwd web dev
```

5. Open **http://localhost:5173** — Pirate Claw will guide you through the browser-only setup flow from starter mode to an ingestion-ready config. No config file was needed.

For the supported always-on daemon path after first boot:

```bash
sh docs/mac-reference-pirate-claw-launch-agent.sh install \
  --install-dir "$(pwd)"
```

Browser-triggered restart on Mac now follows the same truthful restart-proof
vocabulary as Synology, but the supervisor is `launchd` instead of Docker.

### Synology NAS (production)

Reviewed reference daemon supervision path:
[`docs/synology-reference-pirate-claw-container.sh`](./docs/synology-reference-pirate-claw-container.sh)

Synology restart-backed operation is supported through Docker restart
supervision on the `pirate-claw` daemon container. The browser restart control
requests a daemon `SIGTERM`; Docker `--restart always` is what brings the
daemon back. Pirate Claw now persists restart proof under its existing durable
runtime boundary so the browser can show a truthful `requested -> restarting ->
back_online | failed_to_return` journey instead of stopping at "request sent."

The writable `/volume1/pirate-claw/config` directory and
`/volume1/pirate-claw/data` mounts (`pirate-claw.db` plus
`.pirate-claw/runtime/`, which contains `poll-state.json`) are one durability
boundary for that contract.

When `PIRATE_CLAW_INSTALL_ROOT` or `runtime.installRoot` is configured, daemon
startup creates the Synology install tree if it is missing and writes generated
app secrets under `config/generated/`. Existing directories and generated
secret files are left untouched on later starts.

**Plex prerequisite:** Plex Media Server **1.43.0 or later**. Check your
installed version in **Package Center → Installed → Plex Media Server →
Details**. On the reviewed `DS918+ / DSM 7.1.1-42962 Update 9` baseline,
Synology Package Center can lag below that floor. If it does, use Package
Center's manual install path with a newer Plex package from Plex's DSM 7
download page before connecting Plex in Pirate Claw.

**First-boot sequence:**

1. Start the Pirate Claw container or process on the NAS
2. Open a browser at `http://<nas-ip>:<api-port>` (default port configured in `runtime.apiPort`)
3. Pirate Claw will open in starter mode and guide setup through the browser. No config editing was required.

### Operator promise

A fresh install reaches browser-visible starter mode and can be completed through the browser without the operator touching any config file. The starter config is written automatically on first boot. Editing `pirate-claw.config.json` remains an optional parallel path.

## Quick Start (Manual Config)

To configure Pirate Claw from scratch instead of the zero-edit first-boot path:

1. Install dependencies: `bun install`
2. Copy [`pirate-claw.config.example.json`](./pirate-claw.config.example.json) to `pirate-claw.config.json` and edit your feeds, TV/movie rules, and Transmission credentials
3. Start Transmission and enable local RPC access
4. Run:

```bash
./bin/pirate-claw run --config ./pirate-claw.config.json
```

Check state with `pirate-claw status`. Retry failed submissions with `pirate-claw retry-failed`. Reconcile tracked torrents from Transmission with `pirate-claw reconcile`.

## Configuration

Config file: `pirate-claw.config.json` (see [`pirate-claw.config.example.json`](./pirate-claw.config.example.json)).

- `feeds` — RSS sources; optional `pollIntervalMinutes` per feed
- `tv` — compact `defaults + shows` object or legacy per-show array
- `movies` — global year, resolution, codec, and `codecPolicy` (`"prefer"` or `"require"`)
- `transmission` — RPC URL, credentials, optional `downloadDirs` per media type
- `runtime` — daemon scheduling and artifacts; `apiPort` enables HTTP API; `apiHost` controls the API bind address; `apiWriteToken` enables config writes; `installRoot` or `PIRATE_CLAW_INSTALL_ROOT` enables Synology first-startup directory and secret bootstrap; `tmdbRefreshIntervalMinutes` controls background TMDB refresh (default 360, `0` disables)
- `tmdb` — optional `apiKey` (or env `PIRATE_CLAW_TMDB_API_KEY`) and cache TTL overrides
- `plex` — optional operator-managed `url`, the current usable `token` (normally browser-managed after Connect Plex; env override via `PIRATE_CLAW_PLEX_TOKEN` still works), and `refreshIntervalMinutes` for library/watch refresh cadence

```json
{
  "feeds": [
    {
      "name": "EZTV",
      "url": "https://myrss.org/eztv",
      "mediaType": "tv"
    },
    {
      "name": "Atlas Movies",
      "url": "https://atlas.rssly.org/feed",
      "mediaType": "movie"
    }
  ],
  "tv": {
    "defaults": {
      "resolutions": ["720p"],
      "codecs": ["x265"]
    },
    "shows": [
      "Beyond the Gates",
      {
        "name": "The Daily Show",
        "matchPattern": "daily show",
        "resolutions": ["1080p"]
      }
    ]
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
      "movie": "/data/movies",
      "tv": "/data/tv"
    }
  },
  "runtime": {
    "runIntervalMinutes": 15,
    "reconcileIntervalSeconds": 30,
    "artifactDir": ".pirate-claw/runtime",
    "artifactRetentionDays": 7,
    "apiPort": 5555
  },
  "plex": {
    "url": "http://192.168.1.10:32400",
    "token": "YOUR_PLEX_TOKEN",
    "refreshIntervalMinutes": 30
  }
}
```

## Transmission Setup

1. Open Transmission and enable remote access
2. Confirm the RPC port matches your config (default `9091`)
3. Set credentials inline in `transmission.username`/`password`, or via env `PIRATE_CLAW_TRANSMISSION_USERNAME`/`PIRATE_CLAW_TRANSMISSION_PASSWORD` (loaded from process env or a `.env` next to your config)
4. If Transmission restricts allowed hosts, keep `127.0.0.1` or `localhost` allowed

Pirate Claw sends `movie`/`tv` labels at queue time. If Transmission rejects labels it retries without them.

## Local Runtime Files

These stay untracked:

- `pirate-claw.config.json`
- `pirate-claw.db`
- `.pirate-claw/runtime/poll-state.json` — feed poll timestamps
- `.pirate-claw/runtime/cycles/` — JSON/Markdown cycle artifacts, pruned to 7 days

Run the daemon for continuous scheduled operation:

```bash
./bin/pirate-claw daemon --config ./pirate-claw.config.json
```

The daemon runs in the foreground (run cycles every 30 min, reconcile every 1 min). Stop with `Ctrl+C`.

## Daemon HTTP API

Set `runtime.apiPort` to start an HTTP JSON API alongside the daemon:

```json
{ "runtime": { "apiPort": 5555 } }
```

### Endpoints

| Endpoint                                           | Description                                                                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                                  | Uptime, start time, last run/reconcile snapshots                                                                                                         |
| `GET /api/daemon/restart-status`                   | Durable restart-proof status for the current browser-visible round trip (`idle`, `requested`, `back_online`)                                             |
| `GET /api/status`                                  | Recent run summaries                                                                                                                                     |
| `GET /api/candidates`                              | All tracked candidate state records                                                                                                                      |
| `GET /api/shows`                                   | TV candidates grouped by show → season → episode, with Plex status/watch fields                                                                          |
| `GET /api/movies`                                  | Movie candidates sorted by title, with Plex status/watch fields                                                                                          |
| `GET /api/feeds`                                   | Feed config with poll state and `isDue`                                                                                                                  |
| `GET /api/config`                                  | Effective config (credentials redacted); returns `ETag`                                                                                                  |
| `PUT /api/config`                                  | Bounded runtime + tv.shows write (token + `If-Match` required)                                                                                           |
| `PUT /api/config/feeds`                            | Replace feeds array (token + `If-Match` required)                                                                                                        |
| `PUT /api/config/movies`                           | Replace movie policy (token + `If-Match` required)                                                                                                       |
| `PUT /api/config/plex`                             | Update the operator-managed Plex Media Server URL (token + `If-Match` required)                                                                          |
| `PUT /api/config/tv/defaults`                      | Replace TV defaults (token + `If-Match` required)                                                                                                        |
| `GET /api/plex/auth/status`                        | Current Plex auth state (`not_connected`, `connecting`, `connected`, `renewing`, reconnect-required variants)                                            |
| `POST /api/plex/auth/start`                        | Begin the hosted Plex browser sign-in flow (token required)                                                                                              |
| `POST /api/plex/auth/finalize`                     | Finalize the hosted Plex browser sign-in and persist the current Plex credential (token required)                                                        |
| `POST /api/plex/auth/disconnect`                   | Clear the current Plex credential and cancel pending auth work (token + `If-Match` required)                                                             |
| `POST /api/shows/:slug/tmdb/refresh`               | Refresh TMDB metadata for one TV show (token required)                                                                                                   |
| `GET /api/transmission/session`                    | Transmission session stats                                                                                                                               |
| `GET /api/transmission/torrents`                   | Live stats for torrents referenced by tracked candidates (progress, speed, ETA)                                                                          |
| `GET /api/outcomes`                                | Dashboard enqueue failures (`?status=failed_enqueue`; legacy alias `skipped_no_match`): deduped rows per matched candidate still in `failed` state       |
| `POST /api/transmission/torrent/pause`             | Pause a managed torrent (`{ "hash": "<transmission hash>" }`, bearer token)                                                                              |
| `POST /api/transmission/torrent/resume`            | Resume a managed torrent (JSON body + bearer token)                                                                                                      |
| `POST /api/transmission/torrent/remove`            | Remove torrent from Transmission (JSON body + bearer token)                                                                                              |
| `POST /api/transmission/torrent/remove-and-delete` | Remove torrent and delete local data (JSON + bearer)                                                                                                     |
| `POST /api/transmission/torrent/dispose`           | Mark a missing torrent as removed or deleted (`hash`, `disposition`, bearer)                                                                             |
| `POST /api/candidates/:id/requeue`                 | Re-submit a failed candidate’s download URL to Transmission (bearer token); requires daemon API to be started with an in-process Transmission downloader |

Write rules: set `runtime.apiWriteToken` (or env `PIRATE_CLAW_API_WRITE_TOKEN`). Every mutating request uses `Authorization: Bearer <token>`. Config file updates (`PUT /api/config`, `PUT /api/config/feeds`, `PUT /api/config/movies`, `PUT /api/config/tv/defaults`) also require an `If-Match` header equal to the latest `GET /api/config` `ETag`; those writes are atomic file updates. Torrent lifecycle actions, candidate requeue, TMDB refresh, Transmission ping, and daemon restart use the bearer token only (no config `If-Match`).

## SvelteKit Dashboard (`web/`)

The dashboard is a SvelteKit app backed by shadcn-svelte and Tailwind CSS 4. All data loads server-side from the daemon API; the browser never talks to Transmission or SQLite directly. No login — use on trusted networks only.

### Setup

1. Set `runtime.apiPort` and run the daemon
2. Copy `web/.env.example` to `web/.env` and set `PIRATE_CLAW_API_URL=http://localhost:5555`

### Dev server

```bash
bun install --cwd web
bun run --cwd web dev
```

Opens at **http://localhost:5173** by default.

### Production build

```bash
bun run --cwd web build
cd web && PIRATE_CLAW_API_URL=http://localhost:5555 PORT=5174 node build/index.js
```

## Current Scope

Pirate Claw is a local operator tool for a personal NAS. The roadmap now targets **Phase 27** Synology DSM-first stack/cold start, **Phase 28** owner web security, **Phase 29** OpenVPN bridge for bundled Transmission, **Phase 30** UX/UI polish, and **Phase 31** release/versioning.

**Implemented (Phases 01–26):** RSS ingestion, policy matching, Transmission queuing, lifecycle reconciliation, TMDB enrichment, read dashboard, unified config editing from the UI, post-save daemon restart and Transmission ping controls, full feed and target management, onboarding/resume flow, explicit empty states across the dashboard and key routes, optional Plex Media Server enrichment, the Phase 19 Obsidian Tide redesign with sidebar navigation, dashboard consolidation, poster-forward layouts, movie backdrops, Plex chips, a TMDB refresh control on TV detail, **Phase 20** dashboard Transmission controls, **Phase 23** browser-managed Plex connect / reconnect with durable device identity and best-effort silent renewal, **Phase 24** Synology restart supervision truthfulness with restart durability proof plus truthful Plex-on-Synology guidance, **Phase 25** in-browser restart round-trip proof with bounded `failed_to_return` UX, and **Phase 26** Mac first-class always-on deployment with a reviewed `launchd` reference path.

**Implemented (Phase 20):** Dashboard Torrent Manager actions (pause, resume, remove, remove-with-delete), missing-torrent disposition, Transmission failures / requeue, related daemon JSON endpoints, and the `pirateClawDisposition` + derived display-state model (see `docs/01-product/phase-20-dashboard-torrent-actions.md`).

**Planned (Phases 27–29):** DSM-first Synology install bundle, local owner web auth, and OpenVPN bridge for bundled Transmission.

**Planned (Phase 31):** v1.0.0 release ceremony — config `schemaVersion`, SQLite `PRAGMA user_version`, `VERSIONING.md`, CHANGELOG, and tagged release (see `docs/01-product/phase-31-v1-release-and-schema-versioning.md`).

Not in scope through v1:

- remote feed capture or hosted persistence
- post-completion file handling or download renaming
- Jellyfin / Emby / Kodi integration (Plex is implemented; other providers are v2)
- multi-user access beyond the planned single-owner web auth boundary
- broader ingestion redesign

## Development

```
bun test
bun run test:coverage
bun run verify          # root + web/ format, lint, svelte-check
bun run ci              # verify + test + test:web (same as GitHub Actions)
bun run ci:quiet        # same as ci; quiet on success (pre-push hook uses this)
bun run hooks:install   # once per clone: use .githooks so pre-push runs ci:quiet
```

Use `bun run verify:quiet` for the fast local inner loop. Before `open-pr` or any push for a non-doc code change, run `bun run ci:quiet` so the final local gate matches the pre-push hook and CI.

Delivery commands (for contributors working the stacked PR workflow):

```
bun run deliver --plan <plan-path> start
bun run deliver --plan <plan-path> poll-review
bun run deliver ai-review
bun run closeout-stack --plan <plan-path>
```

See [`docs/00-overview/start-here.md`](./docs/00-overview/start-here.md) and [`docs/03-engineering/delivery-orchestrator.md`](./docs/03-engineering/delivery-orchestrator.md) for the full delivery workflow.

## License

Licensed under the MIT License. See [LICENSE](./LICENSE).
