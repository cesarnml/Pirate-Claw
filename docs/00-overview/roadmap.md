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

- `pirate-claw run` can successfully queue a matched item in Transmission

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

- `docs/01-product/phase-02-real-world-feed-compatibility.md`

## Phase 03: Post-Queue Lifecycle

Direction:

- download completion tracking
- Transmission lifecycle reconciliation for Pirate Claw-queued torrents
- richer local status visibility after queueing

Explicitly deferred:

- always-on scheduling or polling
- file renaming or final media placement rules
- Plex, Jellyfin, or Synology-specific integrations
- media-server or library/archive integrations
- UI work or third-party media metadata integrations

Not committed yet:

- how much raw downloader state should be retained locally
- long-term service model for NAS deployment
- final storage and organization strategy after download completion

Future pressure and ideation:

- a later NAS-oriented phase may run Pirate Claw continuously on Synology and poll feeds every 15-30 minutes to avoid short RSS retention windows
- future product work may persist downloader state in SQLite as the app-facing source for a UI layer while still treating Transmission as the live downloader authority
- final media placement may be owned either by Transmission or by Pirate Claw once completion tracking is reliable enough to make that boundary explicit
- if Transmission labels can drive downloader-side placement rules reliably, Pirate Claw may eventually assign labels such as movie or tv at queue time instead of owning final move logic itself

## Planning Rules

- keep phase docs outcome-focused
- keep tickets implementation-focused
- promote durable technical choices into ADRs
