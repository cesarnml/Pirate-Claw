# Phase 02 Real-World Feed Compatibility

Phase 02 is the first real-world compatibility slice for Pirate Claw. Its job is not to add automation. Its job is to make the branded local CLI work end to end against the actual target feeds through manual operator invocation.

## Phase Goal

Phase 02 should leave Pirate Claw in a state where a local operator can run:

- `pirate-claw run`

against these target feeds:

- `https://myrss.org/eztv`
- `https://atlas.rssly.org/feed`

and successfully queue valid matches in Transmission using the existing local SQLite workflow.

## What Phase 02 Delivered

- Pirate Claw now prefers RSS `enclosure.url` over `<link>` for queueable torrent payloads.
- `<link>` remains the generic fallback when no enclosure URL exists.
- Movie releases remain eligible when year and resolution match even if codec metadata is absent.
- Explicit preferred codecs still outrank unknown codec when otherwise equivalent candidates compete.
- The operator-facing surface is now branded as `pirate-claw` with `pirate-claw.config.json`.
- Local manual verification is documented using a checked-in example config and a real Transmission setup.
- Local runtime state remains the current boundary: a local config file plus a local SQLite database.

## Product Goals For This Phase

- prove Pirate Claw works against real feeds, not just fixtures
- preserve a simple local operator workflow
- fix compatibility gaps without redesigning the app boundary
- keep the scope narrow enough to review and verify manually

## Confirmed Feed Findings Behind The Phase

These findings explain why Phase 02 focused on compatibility instead of polling or ingestion redesign:

- `https://atlas.rssly.org/feed` exposes the queueable torrent URL in RSS `enclosure.url`; its `<link>` points to a details page instead of the torrent payload
- atlas movie titles often include year and resolution, but codec is frequently omitted
- `https://myrss.org/eztv` also exposes queueable torrent payloads in `enclosure.url`
- both feeds have short practical retention windows for new items, which makes real-world manual verification valuable and makes future capture work likely

## Explicit Deferrals

These ideas are intentionally outside Phase 02:

- polling or scheduling
- remote feed capture
- hosted persistence such as Turso
- importing buffered feed items into local SQLite
- persistence redesign beyond the current local SQLite model
- any broader ingestion architecture

## Why The Scope Stays Narrow

Phase 02 is a compatibility slice, not an automation phase.

That means:

- fix the real feed parsing and matching gaps
- keep the current local run model
- do not bundle in a poller, hosted store, or capture pipeline

Those later ideas may still matter, but they belong to a later phase because they change the operating model of the app instead of simply making the current model work against live inputs.

## Pressure For Later Phases

Phase 02 surfaced a few real future pressures without taking them on:

- short-lived RSS windows make direct manual use fragile if the local machine is offline
- a later capture layer may need to buffer feed items outside the local machine
- future product work may need a clearer ingestion boundary than direct live-feed reads at run time

Those are valid next-phase product concerns, but they are not the success criteria for Phase 02.
