# Pirate Claw

Pirate Claw is a local CLI for pulling media candidates from RSS feeds, matching them against your rules, and queueing approved downloads in Transmission.

Phases **01–16** are implemented on `main`. **Phases 17–18** are defined in `docs/01-product/` and start after ticket decomposition and developer sign-off.

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
- browser dashboard (`web/`) with unified config editing, in-context daemon controls, full feed and target management, live Transmission stats, skipped-no-match outcomes, and an unmatched candidates page

## Commands

- `pirate-claw run`
- `pirate-claw daemon`
- `pirate-claw status`
- `pirate-claw retry-failed`
- `pirate-claw reconcile`
- `pirate-claw config show`

## Quick Start

1. Install dependencies: `bun install`
2. Copy [`pirate-claw.config.example.json`](./pirate-claw.config.example.json) to `pirate-claw.config.json`
3. Edit your feeds, TV/movie rules, and Transmission credentials
4. Start Transmission and enable local RPC access
5. Run:

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
- `runtime` — daemon scheduling and artifacts; `apiPort` enables HTTP API; `apiWriteToken` enables config writes; `tmdbRefreshIntervalMinutes` controls background TMDB refresh (default 360, `0` disables)
- `tmdb` — optional `apiKey` (or env `PIRATE_CLAW_TMDB_API_KEY`) and cache TTL overrides

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
    "runIntervalMinutes": 30,
    "reconcileIntervalMinutes": 1,
    "artifactDir": ".pirate-claw/runtime",
    "artifactRetentionDays": 7,
    "apiPort": 5555
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

| Endpoint                         | Description                                                    |
| -------------------------------- | -------------------------------------------------------------- |
| `GET /api/health`                | Uptime, start time, last run/reconcile snapshots               |
| `GET /api/status`                | Recent run summaries                                           |
| `GET /api/candidates`            | All tracked candidate state records                            |
| `GET /api/shows`                 | TV candidates grouped by show → season → episode               |
| `GET /api/movies`                | Movie candidates sorted by title                               |
| `GET /api/feeds`                 | Feed config with poll state and `isDue`                        |
| `GET /api/config`                | Effective config (credentials redacted); returns `ETag`        |
| `PUT /api/config`                | Bounded runtime + tv.shows write (token + `If-Match` required) |
| `PUT /api/config/feeds`          | Replace feeds array (token + `If-Match` required)              |
| `PUT /api/config/movies`         | Replace movie policy (token + `If-Match` required)             |
| `PUT /api/config/tv/defaults`    | Replace TV defaults (token + `If-Match` required)              |
| `GET /api/transmission/session`  | Transmission session stats                                     |
| `GET /api/transmission/torrents` | Pirate Claw-managed torrents with progress, speed, ETA         |
| `GET /api/outcomes`              | Feed item outcomes (`?status=skipped_no_match`)                |

Write rules: `runtime.apiWriteToken` (or env `PIRATE_CLAW_API_WRITE_TOKEN`) must be set; all writes require `Authorization: Bearer <token>` and `If-Match` from the latest `GET /api/config` ETag. Writes are atomic file updates.

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

Pirate Claw is a local operator tool for a personal NAS. The roadmap through Phase 18 targets eliminating the need to SSH in for day-to-day operation.

**Implemented (Phases 01–16):** RSS ingestion, policy matching, Transmission queuing, lifecycle reconciliation, TMDB enrichment, read dashboard, unified config editing from the UI, post-save daemon restart and Transmission ping controls, full feed and target management, and live Transmission activity views.

**Planned (Phases 17–18):** Onboarding wizard, v1.0.0 release, and schema versioning.

Not in scope through v1:

- remote feed capture or hosted persistence
- post-completion file handling or download renaming
- Synology archiving or media server integration
- multi-user access or auth beyond the single write token
- broader ingestion redesign

## Development

```
bun test
bun run test:coverage
bun run verify          # root + web/ format, lint, svelte-check
bun run ci
```

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
