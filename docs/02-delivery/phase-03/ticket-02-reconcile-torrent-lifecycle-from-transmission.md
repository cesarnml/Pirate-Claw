# `P3.02 Reconcile Torrent Lifecycle From Transmission`

## Goal

Add a dedicated reconciliation path that fetches live torrent state from Transmission for Pirate Claw-queued torrents and persists the latest lifecycle locally.

## Why This Ticket Exists

Transmission knows the live downloader state, but Pirate Claw currently has no way to refresh its own local picture after queueing.

## Scope

- define the downloader boundary needed for torrent lookup
- fetch lifecycle state for Pirate Claw-queued torrents
- persist the latest reconciled lifecycle state locally
- add tests around reconciliation behavior

## Out Of Scope

- richer status presentation
- file movement
- scheduled polling

## Red First Prompt

What public behavior fails first when Pirate Claw cannot reconcile a previously queued torrent against Transmission?

