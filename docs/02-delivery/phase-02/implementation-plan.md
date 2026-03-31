# Phase 02 Implementation Plan

Phase 02 is intentionally narrow. The goal is to make Pirate Claw work end-to-end against two real RSS feeds through local manual invocation before adding any automation or persistence redesign.

## Epic

- `Phase 02 Real-World Feed Compatibility`

## Ticket Order

1. `P2.01 Enclosure-First Feed Parsing`
2. `P2.02 Movie Matcher Allows Missing Codec`
3. `P2.03 README, Config Example, And Manual Live Verification`

## Ticket Files

- `ticket-01-enclosure-first-feed-parsing.md`
- `ticket-02-movie-matcher-allows-missing-codec.md`
- `ticket-03-readme-config-example-and-manual-live-verification.md`

## Exit Condition

`media-sync run` can be manually exercised against these target feeds using a valid local `media-sync.config.json` and a real Transmission instance:

- `https://myrss.org/eztv`
- `https://atlas.rssly.org/feed`

The expected Phase 02 behavior is:

- queueable torrent payloads are taken from RSS `enclosure.url` when present
- `<link>` remains a fallback when no enclosure URL is present
- movie releases remain eligible when year and resolution match policy even if codec is absent from the title

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- the previous tests are green
- the behavior change is explained in the ticket and rationale
- the deferred Phase 03 ingestion work remains deferred

## Explicit Deferrals

These are intentionally out of scope for Phase 02:

- polling or scheduling
- remote capture of feeds
- Turso or any other hosted persistence layer
- importing buffered feed items into local SQLite
- persistence redesign beyond the current local SQLite model

## Stop Conditions

Pause for review if:

- enclosure parsing requires feed-specific config instead of a generic fallback rule
- movie matching needs a config redesign rather than a local matching-policy adjustment
- manual verification against the live feeds reveals additional source-specific behavior outside the planned ticket scope
