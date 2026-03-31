# Roadmap

This roadmap is intentionally lightweight. It gives future phases a place to land without mixing roadmap planning into ticket specs.

## Phase 01 MVP

Goal:

- read feeds
- normalize titles
- match against config rules
- deduplicate with SQLite
- queue approved items in Transmission
- record outcomes for status and retry

Exit condition:

- `media-sync run` can successfully queue a matched item in Transmission

## Phase 02: Real-World Feed Compatibility

Goal:

- make the branded CLI work end-to-end against real target feeds
- use RSS `enclosure.url` as the queueable torrent payload when present
- keep movie items eligible when year and resolution match but codec is absent
- preserve the current manual local workflow

Committed scope:

- real-world compatibility fixes for `https://myrss.org/eztv`
- real-world compatibility fixes for `https://atlas.rssly.org/feed`
- rename the operator surface to `pirate-claw` and `pirate-claw.config.json`
- documentation and manual verification guidance for a valid local config

Explicitly deferred:

- scheduling or polling
- remote feed capture
- Turso or other hosted persistence
- persistence redesign beyond local SQLite

Working notes:

- `docs/01-product/phase-02-preliminary-notes.md`

## Phase 03: Post-Queue Lifecycle

Likely scope:

- download completion tracking
- renaming or organization rules
- library/archive integrations
- Synology-oriented flows if still desired

Not committed yet:

- storage layout
- archive strategy
- media-server integrations

## Planning Rules

- keep phase docs outcome-focused
- keep tickets implementation-focused
- promote durable technical choices into ADRs
