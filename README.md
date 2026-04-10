# Pirate Claw

Pirate Claw is a local CLI for pulling media candidates from RSS feeds, matching them against your rules, and queueing approved downloads in Transmission.

Phases **01–14** of the current product roadmap are implemented on `main` (including Phase 11 TMDB metadata enrichment, Phase 13 config write API, and Phase 14 feed and target management via the dashboard). The documented engineering epics through Epic 04 are also on `main`. Phases 15–18 are defined and planned; implementation begins after ticket decomposition and developer sign-off per phase. For future stacked delivery phases, merge reviewed slices with `bun run closeout-stack --plan <plan-path>` rather than ad hoc cherry-picks.

It currently supports:

- RSS feeds for TV and movies
- title normalization into media metadata
- TV matching with per-title rules
- compact TV config through `tv.defaults + tv.shows` with per-show overrides
- movie matching with global year, resolution, and codec preferences
- local dedupe and run history in SQLite
- queueing through Transmission RPC
- status inspection and retry of failed submissions
- effective config inspection through `pirate-claw config show`
- env-backed Transmission credentials via process env or `.env`
- daemon HTTP API with read endpoints and bounded opt-in runtime config writes when `runtime.apiPort` is configured
- optional TMDB-backed posters, ratings, and metadata on API and dashboard when a `tmdb` API key is configured (see `pirate-claw.config.example.json`)
- browser dashboard (SvelteKit app in `web/`) with read views, bounded runtime Settings save flow, and full feed and target management: add/remove RSS feeds, edit TV defaults (resolutions/codecs), manage movie policy (years, resolutions, codecs, codecPolicy), and manage TV show targets — all from the Config page (Phases 13–14)

## Commands

- `pirate-claw run`
- `pirate-claw daemon`
- `pirate-claw status`
- `pirate-claw retry-failed`
- `pirate-claw reconcile`
- `pirate-claw config show`

## Quick Start

1. Install dependencies with `bun install`.
2. Copy [`pirate-claw.config.example.json`](./pirate-claw.config.example.json) to `./pirate-claw.config.json`.
3. Edit your feeds, TV/movie matching rules, and Transmission credentials.
4. Make sure the Transmission app is running and local RPC access is enabled.
5. Run:

```bash
./bin/pirate-claw run --config ./pirate-claw.config.json
```

Inspect the current state with:

```bash
./bin/pirate-claw status
```

When a torrent has been reconciled from Transmission, `status` shows the latest known lifecycle and brief downloader detail alongside the stored candidate state.
If a tracked torrent later disappears from Transmission before completion, `status` surfaces it as `missing_from_transmission`; once a torrent has been observed completed, that completed state stays sticky locally.

Retry failed submissions with:

```bash
./bin/pirate-claw retry-failed --config ./pirate-claw.config.json
```

Reconcile tracked torrents from Transmission with:

```bash
./bin/pirate-claw reconcile --config ./pirate-claw.config.json
```

Inspect the fully normalized effective config with:

```bash
./bin/pirate-claw config show --config ./pirate-claw.config.json
```

## Configuration

Pirate Claw reads a local config file at `pirate-claw.config.json` by default.

The repo includes a checked-in example at [`pirate-claw.config.example.json`](./pirate-claw.config.example.json). Your real local config stays untracked.

High-level config shape:

- `feeds`: RSS sources to inspect (optional `pollIntervalMinutes` per feed)
- `tv`: either the legacy per-show rule array or a compact `defaults + shows` object
- `movies`: global movie intake policy
- `transmission`: local Transmission RPC settings (optional `downloadDirs` for per-media-type download directories)
- `runtime`: daemon scheduling and artifact settings (optional, all fields have defaults; `apiPort` enables the HTTP API; `tmdbRefreshIntervalMinutes` controls background TMDB cache refresh, default 360 minutes, `0` disables; `apiWriteToken` opt-in enables bounded config writes)
- `tmdb`: optional TMDB API key (`apiKey` or env `PIRATE_CLAW_TMDB_API_KEY`) and optional cache TTL overrides

Example:

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
    "apiPort": 3000
  }
}
```

The compact TV form reduces repetition when most tracked shows share one quality policy:

- `tv.defaults` defines the shared `resolutions` and `codecs`
- `tv.shows` may contain plain show names that inherit those defaults
- `tv.shows` may also contain objects with local `matchPattern`, `resolutions`, or `codecs` overrides
- the older `tv: [{ ... }]` array shape still works unchanged

## Transmission Setup

Pirate Claw expects a reachable local Transmission RPC endpoint.

Before running:

1. Open the Transmission app.
2. Enable remote access in Transmission settings.
3. Confirm the listening port matches your config. The default example uses `9091`.
4. If authentication is enabled, either put the username/password inline in `pirate-claw.config.json` or set `PIRATE_CLAW_TRANSMISSION_USERNAME` / `PIRATE_CLAW_TRANSMISSION_PASSWORD` in a local `.env`.
5. If Transmission restricts allowed addresses, keep `127.0.0.1` or `localhost` allowed.

Transmission credential precedence is:

- inline `transmission.username` / `transmission.password` win when present
- otherwise Pirate Claw reads `PIRATE_CLAW_TRANSMISSION_USERNAME` / `PIRATE_CLAW_TRANSMISSION_PASSWORD`
- Pirate Claw loads those env vars from the process environment and from a `.env` file next to your config file

At queue time, Pirate Claw attempts to send Transmission labels based on media type:

- `movie` for movie feeds
- `tv` for TV feeds

If the configured Transmission instance rejects label arguments, Pirate Claw logs a warning and retries the same submission without labels.

## Real-World Feed Notes

The current build is tuned to work against:

- `https://myrss.org/eztv`
- `https://atlas.rssly.org/feed`

Current behavior:

- queueable torrent URLs come from RSS `enclosure.url` when present
- `<link>` remains a fallback when no enclosure URL exists
- movie items default to `movies.codecPolicy: "prefer"`, so they can still match when year and resolution fit policy even if codec is missing
- explicit preferred codecs still outrank otherwise equivalent unknown-codec movie releases

`movies.codecPolicy` accepts `"prefer"` or `"require"`.
Use `"require"` to reject movie releases that do not expose an allowed codec in the title.

## Local Runtime Files

Pirate Claw keeps local operator state out of git:

- `pirate-claw.config.json`
- `pirate-claw.db`
- `.pirate-claw/runtime/poll-state.json` -- persisted feed poll timestamps used by the daemon to resume due-feed scheduling across restarts
- `.pirate-claw/runtime/cycles/` -- JSON and Markdown artifacts for daemon cycle results (completed, failed, or skipped for run/reconcile), pruned to 7 days by default

Run the daemon for continuous scheduled operation:

```bash
./bin/pirate-claw daemon --config ./pirate-claw.config.json
```

The daemon runs in the foreground, executing run cycles every 30 minutes and reconcile cycles every 1 minute. Stop with `Ctrl+C`.

## Daemon HTTP API

When `runtime.apiPort` is set in the config, the daemon starts a read-only HTTP JSON API alongside the normal scheduling loop:

```json
{
  "runtime": {
    "apiPort": 3000
  }
}
```

When `runtime.apiPort` is omitted, no HTTP listener starts.

### Endpoints

| Endpoint                         | Description                                                    |
| -------------------------------- | -------------------------------------------------------------- |
| `GET /api/health`                | Uptime, start time, and last run/reconcile cycle snapshots     |
| `GET /api/status`                | Recent run summaries from the local database                   |
| `GET /api/candidates`            | All tracked candidate state records                            |
| `GET /api/shows`                 | TV candidates grouped by show → season → episode               |
| `GET /api/movies`                | Movie candidates sorted by title                               |
| `GET /api/feeds`                 | Feed config with poll state and `isDue` status                 |
| `GET /api/config`                | Effective config with credentials redacted; returns `ETag`     |
| `PUT /api/config`                | Bounded runtime + tv.shows write (token + `If-Match` required) |
| `PUT /api/config/feeds`          | Replace feeds array (token + `If-Match` required)              |
| `PUT /api/config/movies`         | Replace movie policy (token + `If-Match` required)             |
| `PUT /api/config/tv/defaults`    | Replace TV global defaults (token + `If-Match` required)       |
| `GET /api/transmission/session`  | Transmission version + session DL/UL stats (Phase 15)          |
| `GET /api/transmission/torrents` | Active torrent list with progress + speed + ETA (Phase 15)     |
| `GET /api/outcomes`              | Feed item outcomes; `?status=skipped_no_match` (Phase 15)      |
| `POST /api/transmission/ping`    | Test Transmission connectivity (Phase 16)                      |
| `POST /api/daemon/restart`       | SIGTERM self after config save; requires supervisor (Phase 16) |

### Example

```bash
curl http://localhost:3000/api/health
```

```json
{
  "uptime": 3600000,
  "startedAt": "2026-04-08T12:00:00.000Z",
  "lastRunCycle": {
    "status": "completed",
    "startedAt": "...",
    "completedAt": "...",
    "durationMs": 1234
  },
  "lastReconcileCycle": null
}
```

Write behavior is intentionally bounded:

- writes are disabled unless `runtime.apiWriteToken` (or env `PIRATE_CLAW_API_WRITE_TOKEN`) is configured
- `PUT /api/config` requires `Authorization: Bearer <token>`
- `PUT /api/config` requires `If-Match` with the latest `ETag` from `GET /api/config` (`409` on stale revisions)
- only approved runtime fields are writable through this path in v1
- writes are atomic file updates

Dashboard Settings uses a server-side SvelteKit action for writes, so the token stays server-only. After a successful save, restart the daemon process for runtime changes to take effect.

Candidate, show, and movie payloads include TMDB fields when a match exists in the local cache; otherwise they fall back to Phase-10-style local data.

## SvelteKit dashboard server (`web/`)

The dashboard is a **SvelteKit** app under [`web/`](./web/). The UI is built with **shadcn-svelte** on **Tailwind CSS 4** (see [`web/components.json`](./web/components.json) and [`web/src/app.css`](./web/src/app.css)). Pages load data through **server-side** requests to the daemon JSON API (the browser never talks to Transmission or SQLite directly). There is no login in this version—use it only on networks you trust, same as the daemon API.

### Prerequisites

1. **Daemon HTTP API enabled** — set `runtime.apiPort` in your config (for example `3000`) and run the daemon (`pirate-claw daemon` or `./bin/pirate-claw daemon --config …`). See [Daemon HTTP API](#daemon-http-api) above.
2. **API base URL for the web app** — copy [`web/.env.example`](./web/.env.example) to `web/.env` and set `PIRATE_CLAW_API_URL` to the daemon’s base URL (no trailing slash), e.g. `http://localhost:3000`. The SvelteKit server reads this at runtime; if it is missing, API-backed routes error until you set it.

### Development (local UI server)

From the repo root (after `bun install` at the root for the CLI):

```bash
bun install --cwd web
bun run --cwd web dev
```

This starts the Vite-powered SvelteKit dev server (by default **http://localhost:5173**; the terminal shows the exact URL). Open it in a browser to browse candidates, shows, movies, and effective config. When a TMDB API key is configured, posters and ratings show where cached.

### Production-style run (optional)

To serve a built app instead of `dev`:

```bash
bun run --cwd web build
cd web && PIRATE_CLAW_API_URL=http://localhost:3000 PORT=5174 node build/index.js
```

The Node adapter defaults to **port `3000`** and host **`0.0.0.0`** if you omit `PORT` and `HOST`. If your daemon already uses `3000` for its API, set **`PORT`** to another value for the dashboard (for example `5174` as above). The process prints `Listening on http://…` on startup. Keep `PIRATE_CLAW_API_URL` pointed at the daemon; the dashboard URL and the daemon API URL are different ports.

## Current Scope

Pirate Claw is a local operator tool for a personal NAS. The roadmap through Phase 18 targets eliminating the need to SSH into the NAS for day-to-day operation — config editing, feed management, and activity monitoring all move to the browser dashboard.

**Implemented (Phases 01–14):** RSS ingestion, policy matching, Transmission queuing, lifecycle reconciliation, TMDB enrichment, read dashboard, bounded config writes from the UI, and full feed and target management from the Config page (add/remove feeds, TV defaults, movie policy, TV show targets).

**Planned (Phases 15–18):** Live Transmission download progress, TV/movie library views with TMDB enrichment, unified config editing with hot reload and daemon controls, onboarding wizard, v1.0.0 release.

Not in scope through v1:

- remote feed capture or hosted persistence
- automatic post-completion file handling or download renaming
- Synology archiving or media server integration
- multi-user access or authentication beyond the single write token
- broader ingestion redesign

## Development

Useful local commands:

- `bun test`
- `bun run test:coverage`
- `bun run verify` (repo root checks plus `web/` format, ESLint, and `svelte-check`; use `bun run verify:web` or `bun run lint:web` to scope to the dashboard only)
- `bun run ci`
- `bun run deliver restack` to restack the current delivery ticket after its parent PR was squash-merged to `main`
- `bun run closeout-stack --plan <plan-path>` to squash-merge a completed stacked delivery phase onto `main` in ticket order using forward `git merge --squash` (no rebase)
- `bun run deliver --plan <plan-path> poll-review` to run the orchestrator's 2/4/6/8-minute `ai-code-review` polling loop for the active PR and persist reviewed-SHA provenance plus vendor-attributed review artifacts
- `bun run deliver --plan <plan-path> reconcile-late-review <ticket-id>` to re-run fetch + triage + artifact persistence + PR body refresh for a **done** ticket when late review feedback appears (see `docs/03-engineering/delivery-orchestrator.md`)
- `bun run deliver --plan <plan-path> record-review <ticket-id> patched ...` to record patched follow-up and make a best-effort attempt to resolve mapped native GitHub inline review threads
- `bun run deliver ai-review` to run the same converged post-PR external AI-review lifecycle for a standalone non-ticket PR

The delivery orchestrator applies reviewer-facing guards when opening or editing PR bodies: it rejects escaped-newline sequences, bans auto-generated sections like `Summary by ...` / `Validation` / `Verification`, and rejects basic malformed markdown (mismatched fenced code blocks, bad headings). Literal `\\n` inside inline code spans is allowed.

The review hooks and triage logic live in [`./.agents/skills/ai-code-review/SKILL.md`](./.agents/skills/ai-code-review/SKILL.md). Ticket-linked delivery PRs and standalone `ai-review` runs share the same post-PR lifecycle core: polling, outcome accumulation, reviewer-facing metadata refresh, and final persistence. Supported external review agents are CodeRabbit, Qodo, Greptile, and SonarQube. SonarQube uses GitHub check annotations rather than native PR review comments; the fetcher keeps only failed-check annotations so triage stays focused on meaningful static-analysis findings rather than the full warning stream. Repo-level SonarQube scope lives in [`./.sonarcloud.properties`](./.sonarcloud.properties).

If you are working on the repo rather than just using the CLI, start with [`docs/00-overview/start-here.md`](./docs/00-overview/start-here.md).

## License

Licensed under the GNU General Public License v3.0 or later. See [LICENSE](./LICENSE).

This project is intended to be free as in freedom, not merely free of charge.
