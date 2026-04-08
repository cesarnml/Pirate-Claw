# Pirate Claw

Pirate Claw is a local CLI for pulling media candidates from RSS feeds, matching them against your rules, and queueing approved downloads in Transmission.

Phases **01–11** of the current product roadmap are implemented on `main` (including Phase 11 TMDB metadata enrichment). The documented engineering epics through Epic 04 are also on `main`. For future stacked delivery phases, merge reviewed slices with `bun run closeout-stack --plan <plan-path>` rather than ad hoc cherry-picks. Further product-surface or delivery-tooling expansion beyond the current roadmap still requires a new planning pass and new approved phase/epic docs when the work is not a small bounded change.

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
- read-only daemon HTTP API for external consumers when `runtime.apiPort` is configured
- optional TMDB-backed posters, ratings, and metadata on API and dashboard when a `tmdb` API key is configured (see `pirate-claw.config.example.json`)
- read-only browser dashboard (SvelteKit app in `web/`) that talks to the daemon HTTP API (Phase 10)

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
- `runtime`: daemon scheduling and artifact settings (optional, all fields have defaults; `apiPort` enables the HTTP API; `tmdbRefreshIntervalMinutes` controls background TMDB cache refresh, default 360 minutes, `0` disables)
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

| Endpoint              | Description                                                |
| --------------------- | ---------------------------------------------------------- |
| `GET /api/health`     | Uptime, start time, and last run/reconcile cycle snapshots |
| `GET /api/status`     | Recent run summaries from the local database               |
| `GET /api/candidates` | All tracked candidate state records                        |
| `GET /api/shows`      | TV candidates grouped by show → season → episode           |
| `GET /api/movies`     | Movie candidates sorted by title                           |
| `GET /api/feeds`      | Feed config with poll state and `isDue` status             |
| `GET /api/config`     | Effective config with Transmission credentials redacted    |

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

All endpoints are read-only. No endpoint mutates daemon state. There is no authentication in this version — it is designed for private NAS networks.

Candidate, show, and movie payloads include TMDB fields when a match exists in the local cache; otherwise they fall back to Phase-10-style local data.

## SvelteKit dashboard server (`web/`)

The dashboard is a **SvelteKit** app under [`web/`](./web/). Pages load data through **server-side** requests to the daemon JSON API (the browser never talks to Transmission or SQLite directly). There is no login in this version—use it only on networks you trust, same as the daemon API.

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

Pirate Claw is intentionally still a local operator tool.

Not in scope yet:

- remote feed capture
- hosted persistence
- automatic post-completion file handling
- download renaming or organization rules
- Synology archiving
- broader ingestion redesign

## Development

Useful local commands:

- `bun test`
- `bun run test:coverage`
- `bun run verify`
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
