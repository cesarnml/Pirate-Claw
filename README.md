# Pirate Claw

Pirate Claw is a local CLI for pulling media candidates from RSS feeds, matching them against your rules, and queueing approved downloads in Transmission.

It currently supports:

- RSS feeds for TV and movies
- title normalization into media metadata
- TV matching with per-title rules
- movie matching with global year, resolution, and codec preferences
- local dedupe and run history in SQLite
- queueing through Transmission RPC
- status inspection and retry of failed submissions

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
- `transmission`: local Transmission RPC settings
- `runtime`: daemon scheduling and artifact settings (optional, all fields have defaults)

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
    "username": "your-user",
    "password": "your-password"
  },
  "runtime": {
    "runIntervalMinutes": 30,
    "reconcileIntervalMinutes": 1,
    "artifactDir": ".pirate-claw/runtime",
    "artifactRetentionDays": 7
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
4. If authentication is enabled, copy the same username and password into `pirate-claw.config.json`.
5. If Transmission restricts allowed addresses, keep `127.0.0.1` or `localhost` allowed.

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
- `bun run deliver --plan <plan-path> poll-review` to run the orchestrator's 2/4/6/8-minute `ai-code-review` polling loop for the active PR and persist reviewed-SHA provenance plus vendor-attributed review artifacts
- `bun run deliver --plan <plan-path> record-review <ticket-id> patched ...` to record patched follow-up and make a best-effort attempt to resolve mapped native GitHub inline review threads

The delivery orchestrator applies reviewer-facing PR-body guards during PR create/edit flows. It rejects likely escaped-newline formatting sequences and malformed markdown basics (for example, unmatched fenced code blocks or malformed headings), bans `Summary by ...` / `Validation` / `Verification` sections, and allows literal `\\n` examples inside inline-code spans.

The review hooks and triage guidance for that flow live in the repo-local skill at [`./.agents/skills/ai-code-review/SKILL.md`](./.agents/skills/ai-code-review/SKILL.md). The orchestrator consumes repo-local fetcher and triager scripts there, not a platform-specific runtime. Supported external review agents are currently CodeRabbit and Qodo.

If you are working on the repo rather than just using the CLI, start with [`docs/00-overview/start-here.md`](./docs/00-overview/start-here.md).

## License

Licensed under the GNU General Public License v3.0 or later. See [LICENSE](./LICENSE).

This project is intended to be free as in freedom, not merely free of charge.
