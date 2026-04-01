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
- `pirate-claw status`
- `pirate-claw retry-failed`

## Quick Start

1. Install dependencies with `bun install`.
2. Copy [`pirate-claw.config.example.json`](./pirate-claw.config.example.json) to `./pirate-claw.config.json`.
3. Edit your feeds, matching rules, and Transmission credentials.
4. Make sure the Transmission app is running and local RPC access is enabled.
5. Run:

```bash
./bin/pirate-claw run --config ./pirate-claw.config.json
```

Inspect the current state with:

```bash
./bin/pirate-claw status
```

Retry failed submissions with:

```bash
./bin/pirate-claw retry-failed --config ./pirate-claw.config.json
```

## Configuration

Pirate Claw reads a local config file at `pirate-claw.config.json` by default.

The repo includes a checked-in example at [`pirate-claw.config.example.json`](./pirate-claw.config.example.json). Your real local config stays untracked.

High-level config shape:

- `feeds`: RSS sources to inspect
- `tv`: per-show rules for title, resolution, and codec
- `movies`: global movie intake policy
- `transmission`: local Transmission RPC settings

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
  "tv": [
    {
      "name": "Beyond the Gates",
      "resolutions": ["720p"],
      "codecs": ["x265"]
    }
  ],
  "movies": {
    "years": [2026],
    "resolutions": ["1080p"],
    "codecs": ["x265"]
  },
  "transmission": {
    "url": "http://localhost:9091/transmission/rpc",
    "username": "your-user",
    "password": "your-password"
  }
}
```

## Transmission Setup

Pirate Claw expects a reachable local Transmission RPC endpoint.

Before running:

1. Open the Transmission app.
2. Enable remote access in Transmission settings.
3. Confirm the listening port matches your config. The default example uses `9091`.
4. If authentication is enabled, copy the same username and password into `pirate-claw.config.json`.
5. If Transmission restricts allowed addresses, keep `127.0.0.1` or `localhost` allowed.

## Real-World Feed Notes

The current build is tuned to work against:

- `https://myrss.org/eztv`
- `https://atlas.rssly.org/feed`

Current behavior:

- queueable torrent URLs come from RSS `enclosure.url` when present
- `<link>` remains a fallback when no enclosure URL exists
- movie items can still match when year and resolution fit policy even if codec is missing
- explicit preferred codecs still outrank otherwise equivalent unknown-codec movie releases

## Local Runtime Files

Pirate Claw keeps local operator state out of git:

- `pirate-claw.config.json`
- `pirate-claw.db`

## Current Scope

Pirate Claw is intentionally still a local operator tool.

Not in scope yet:

- always-on scheduling or feed polling
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

If you are working on the repo rather than just using the CLI, start with [`docs/00-overview/start-here.md`](./docs/00-overview/start-here.md).

## License

Licensed under the GNU General Public License v3.0 or later. See [LICENSE](./LICENSE).

This project is intended to be free as in freedom, not merely free of charge.
