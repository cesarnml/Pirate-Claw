# `P3.01 Persist Transmission Identity For Queued Torrents`

## Goal

Extend the successful queue path so Pirate Claw preserves the downloader identity it will need for later reconciliation.

## Why This Ticket Exists

Phase 01 and Phase 02 stop at the queue submission result. Phase 03 needs a durable way to reconnect that queued candidate to a real Transmission torrent later.

## Scope

- persist the key Transmission identifiers returned when a torrent is added
- keep the queued-candidate path backward-compatible for existing local CLI flows
- add or update tests around successful queue persistence

## Out Of Scope

- polling Transmission for updated state
- status UI changes beyond what is needed to support tests
- lifecycle history or completion logic

## Red First Prompt

What public behavior fails first when a queued torrent's Transmission identity is not stored for later reconciliation?
