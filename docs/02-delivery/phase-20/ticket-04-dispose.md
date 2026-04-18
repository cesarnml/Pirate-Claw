# P20.04 Dispose (Missing Resolution)

## Goal

Add the dispose endpoint that resolves a `missing` torrent to a terminal state. No Transmission RPC call — the torrent is already gone. Pure DB write. No UI yet (P20.05).

## Depends On

P20.03 (remove/remove+delete)

## Background

A torrent becomes `missing` when the user acts directly on the Transmission web UI (removes or deletes) without going through Pirate Claw. The candidate still has a `transmissionTorrentHash` but the hash is absent from Transmission's poll results. The dispose endpoint lets the user declare what happened so the candidate exits limbo.

## Scope

### 1. API endpoint (`src/api.ts`)

One new flat block. Requires `POST` and `{ hash: string, disposition: 'removed' | 'deleted' }` JSON body.

**`POST /api/transmission/torrent/dispose`**

1. Parse `{ hash, disposition }` from body — reject with `400` if `disposition` is not `'removed'` or `'deleted'`
2. Find candidate by `transmissionTorrentHash`
3. Reject with `400` if candidate not found
4. Reject with `400` if `torrentDisplayState` is not `'missing'` — only missing torrents can be disposed this way
5. Write `pirateClawDisposition = disposition`
6. Return `200 { ok: true }`

No Transmission RPC call. No polling. The disposition write immediately makes the candidate terminal so the reconciler skips it on the next cycle.

### 2. Missing-state UI surface (TorrentManagerCard)

The TorrentManagerCard currently only shows active downloads. `missing` candidates need to appear somewhere so the user can act on them.

Add a secondary section below the active list (or inline in the list with a distinct visual treatment) for candidates where `torrentDisplayState === 'missing'`. Each missing row shows:

- Candidate title
- "Missing from Transmission" label
- Two buttons: "Mark Removed" and "Mark Deleted"

Buttons call `POST /api/transmission/torrent/dispose` with the appropriate disposition. In-flight: disable both buttons on that row. On success: row disappears (candidate is now terminal). On failure: inline error.

## Out of Scope

- Full context menu (P20.05 — active torrent actions)
- Requeue for missing candidates (not in scope for Phase 20)

## Exit Condition

- `POST /api/transmission/torrent/dispose` with `disposition: 'removed'` on a missing candidate: `pirateClawDisposition = 'removed'` written, `200` returned
- `POST /api/transmission/torrent/dispose` on a non-missing candidate: `400` returned
- `POST /api/transmission/torrent/dispose` with invalid disposition: `400` returned
- Missing candidates render in TorrentManagerCard with Mark Removed / Mark Deleted buttons
- Clicking a button disables the row, calls the endpoint, row disappears on success
- `bun run typecheck` passes
