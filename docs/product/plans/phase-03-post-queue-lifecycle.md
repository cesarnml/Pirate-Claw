# Phase 03 Post-Queue Lifecycle

Phase 03 extends Pirate Claw beyond "queued in Transmission" without changing the app into a background service yet. Its job is to let a local operator reconcile Pirate Claw's queued torrents against Transmission, persist the observed lifecycle locally, and inspect current post-queue state through the CLI.

## Phase Goal

Phase 03 should leave Pirate Claw in a state where a local operator can:

- queue a torrent through `pirate-claw run`
- reconcile that torrent's live state from Transmission through a dedicated CLI path
- inspect whether that torrent is still queued, downloading, completed, failed, or missing from Transmission

The scope is limited to torrents that Pirate Claw itself queued.

## Product Goals For This Phase

- preserve the current local CLI operating model
- make post-queue downloader state visible and durable locally
- define a clear boundary between Pirate Claw lifecycle state and Transmission downloader state
- stop at reliable completion tracking instead of bundling in file management

## Exit Condition

`pirate-claw status` can show a Pirate Claw-queued torrent progressing through Transmission lifecycle and mark it completed locally after reconciliation.

## Committed Scope

- persist Transmission identity for Pirate Claw-queued torrents
- add a reconciliation path that polls Transmission for torrent lifecycle state
- save the reconciled lifecycle state into local SQLite
- extend operator status output to show the latest post-queue lifecycle state
- define completion and missing-from-Transmission semantics for locally tracked torrents

## Lifecycle Stance

- Pirate Claw tracks only torrents that it queued itself.
- Transmission remains the live downloader authority for active torrent state.
- SQLite remains Pirate Claw's durable local product state and audit trail.
- Phase 03 ends at `completed`; it does not manage seeding policy beyond that point.
- If a previously tracked torrent no longer appears in Transmission, Pirate Claw should preserve that fact as a distinct local state instead of silently treating it as completed or failed.

## Suggested Local Lifecycle States

The exact schema can evolve during implementation, but the operator-facing model should support at least these states:

- `queued`
- `downloading`
- `completed`
- `failed`
- `missing_from_transmission`

Phase 03 may also retain a small set of raw downloader fields for debugging and future UI work, such as Transmission hash, torrent id, progress, done date, and download directory.

## Explicit Deferrals

These ideas are intentionally outside Phase 03:

- feed polling or always-on scheduling
- daemon or service management for NAS deployment
- adopting torrents that Pirate Claw did not queue
- file renaming rules
- moving completed media into final TV or movie directories
- Plex, Jellyfin, Synology, or media-server integrations
- third-party metadata enrichment such as IMDb-backed tracking or release calendars
- broader UI work beyond what Phase 03 local state should enable later

## Why The Scope Stays Narrow

The long-term direction may still include an always-on Synology deployment, feed polling, a richer UI, and final media placement rules. Those are real future pressures, but they should not be bundled into the first post-queue phase.

Phase 03 should first answer these narrower product questions:

- can Pirate Claw reliably identify the torrents it queued
- can it reconcile their live state from Transmission
- can it preserve that state locally in a way that later product layers can build on

That is the smallest slice that moves the app toward the desired NAS-oriented future without prematurely freezing scheduler or filesystem policy.

## Pressure For Later Phases

Phase 03 intentionally leaves several future design pressures unresolved:

- short-lived RSS windows still create pressure for a later scheduled or always-on deployment mode
- a future UI likely wants SQLite to act as Pirate Claw's app-facing read model over downloader state and tracking policy
- final media placement may eventually be handled either by Transmission or by Pirate Claw, but that ownership decision should be revisited only after completion tracking is proven
