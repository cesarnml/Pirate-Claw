# Pirate Claw

Pirate Claw is a proposed local CLI for automating media intake from RSS feeds.

The phase 01 MVP is intentionally narrow:

- read configured RSS feeds
- normalize release titles into media metadata
- match TV and movie items against JSON rules
- deduplicate previously handled items with SQLite
- submit approved candidates to Transmission
- record outcomes for review and retry

Phase 01 ends at successful queueing in Transmission. It does not include a web UI, scheduling, download completion polling, renaming, or Synology archiving.

## Status

Ticket 01 is implemented: the repository now has a minimal Bun + TypeScript CLI skeleton with JSON config loading and validation for `media-sync run`.

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

- `bun test`
- `bun run ./src/cli.ts run --config ./test/fixtures/valid-config.json`

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
