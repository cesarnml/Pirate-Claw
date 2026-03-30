# Pirate Claw

Pirate Claw is a proposed local CLI for automating media intake from RSS feeds.

The phase 01 MVP is intentionally narrow:

- read configured RSS feeds
- normalize release titles into media metadata
- match TV items against JSON rules and movie items against JSON intake policies
- deduplicate previously handled items with SQLite
- submit approved candidates to Transmission
- record outcomes for review and retry

Phase 01 ends at successful queueing in Transmission. It does not include a web UI, scheduling, download completion polling, renaming, or Synology archiving.

## Status

Tickets 01-10 are implemented:

- minimal Bun + TypeScript CLI skeleton with JSON config loading and validation for `media-sync run`
- RSS fetch-and-parse entrypoint that converts RSS items into a raw feed-item shape
- title-normalization module that extracts matching metadata for TV and movie releases
- TV rule matcher that evaluates normalized items against name-based rules with optional regex overrides plus codec and resolution filters
- movie policy matcher that accepts releases by global year and quality policy without per-title rules
- SQLite-backed run history and candidate-state persistence that preserves dedupe and retryability
- Transmission RPC adapter that negotiates session ids, submits torrent URLs, and returns structured queueing failures without wiring the full run pipeline yet
- end-to-end `media-sync run` orchestration that fetches feeds, matches candidates, persists per-feed-item outcomes, submits winners, and prints a compact run summary
- read-only `media-sync status` inspection that reports recent runs and current candidate state from SQLite without creating or migrating the database
- `media-sync retry-failed` orchestration that re-submits only failed candidate-state rows from SQLite using stored torrent URLs and records a new run summary

The project is being planned as a small-slice, review-friendly build:

- Bun + TypeScript is the default runtime stance
- one ticket at a time
- red-green-refactor
- behavior tested through public interfaces
- each ticket should stay reviewable in roughly 1-3 hours
- each ticket should include a short rationale explaining why the chosen path was the smallest acceptable solution

## Docs

Start here:

1. `docs/00-overview/start-here.md`
2. `docs/01-product/phase-01-mvp.md`
3. `docs/02-delivery/phase-01/implementation-plan.md`
4. `docs/03-engineering/tdd-workflow.md`

Useful supporting docs:

- `docs/00-overview/roadmap.md`
- `docs/02-delivery/issue-tracking.md`
- `docs/04-decisions/adr-001-use-bun.md`

## Local Development

- `bun run hooks:install` once per clone to make `git push` run `bun run verify` locally
- `bun test`
- `bun run verify`
- `bun run ci`
- `./bin/media-sync run --config ./test/fixtures/valid-config.json`
- `./bin/media-sync status`
- `./bin/media-sync retry-failed --config ./test/fixtures/valid-config.json`

## CI

- GitHub Actions runs `bun run ci` on pushes to `main`, pushes to `codex/**`, and pull requests.
- GitHub Actions also runs Snyk dependency and source-code scans when the repository `SNYK_TOKEN` secret is configured.
- Snyk currently fails the security job only on `high` severity findings or above.

## Proposed CLI Surface

The initial command surface is intentionally small:

- `media-sync run`
- `media-sync status`
- `media-sync retry-failed`

## Principles

- keep the core source-agnostic
- use SQLite for local persistence
- use Transmission as the first downloader adapter
- prefer integration-style tests over internal mocking
- avoid building later-phase modules before the current ticket requires them
- preserve learning value by capturing why a solution was chosen, what alternatives were rejected, and what was intentionally deferred
