# Phase 03 Implementation Plan

Phase 03 is intentionally narrow. The goal is to let Pirate Claw observe and persist the post-queue lifecycle for torrents it queued in Transmission, while keeping the current local CLI operating model.

## Epic

- `Phase 03 Post-Queue Lifecycle`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase. If scope still feels fuzzy, use `grill-me` before implementation.

## Ticket Order

1. `P3.01 Persist Transmission Identity For Queued Torrents`
2. `P3.02 Reconcile Torrent Lifecycle From Transmission`
3. `P3.03 Show Post-Queue Lifecycle In Status`
4. `P3.04 Define Completion And Missing Semantics`

## Ticket Files

- `ticket-01-persist-transmission-identity-for-queued-torrents.md`
- `ticket-02-reconcile-torrent-lifecycle-from-transmission.md`
- `ticket-03-show-post-queue-lifecycle-in-status.md`
- `ticket-04-define-completion-and-missing-semantics.md`

## Exit Condition

`pirate-claw status` can report the latest known lifecycle for Pirate Claw-queued torrents after a reconciliation pass against Transmission, including a locally persisted `completed` state.

The expected Phase 03 behavior is:

- successful queueing persists Transmission identity for the queued torrent
- a dedicated reconciliation path polls Transmission for the latest torrent state
- reconciled lifecycle state is stored in local SQLite for later inspection
- status output shows current post-queue lifecycle for tracked torrents
- torrents missing from Transmission are surfaced explicitly instead of being silently reclassified

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- the previous tests are green
- the behavior change is explained in the ticket and rationale
- always-on scheduling, file placement, and media-server integrations remain deferred

## Explicit Deferrals

These are intentionally out of scope for Phase 03:

- adopting torrents not queued by Pirate Claw
- polling RSS feeds on a schedule or running as a daemon
- moving or renaming completed files
- Plex, Jellyfin, Synology, or other media-server integrations
- UI work or third-party metadata enrichment
- broader persistence redesign beyond what post-queue lifecycle needs locally

## Stop Conditions

Pause for review if:

- Transmission lifecycle reconciliation depends on downloader-specific behavior that cannot be expressed through a small boundary extension
- local lifecycle persistence starts to require a broader ingestion or service architecture redesign
- status output needs a product-level CLI redesign instead of a targeted extension

