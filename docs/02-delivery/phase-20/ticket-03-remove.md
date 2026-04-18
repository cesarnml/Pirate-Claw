# P20.03 Remove / Remove + Delete

## Goal

Add remove and remove+delete torrent actions — Transmission RPC function and two API endpoints. Writes `pirateClawDisposition` on success (terminal). No UI yet (P20.05).

## Depends On

P20.02 (pause/resume)

## Scope

### 1. Transmission service (`src/transmission.ts`)

Add one function:

**`removeTorrent(config, hash: string, deleteLocalData: boolean): Promise<TorrentActionResult>`**

- RPC method: `torrent-remove`
- Arguments: `{ ids: [hash], 'delete-local-data': deleteLocalData }`
- Returns `TorrentActionResult` (existing type from P20.02)

### 2. API endpoints (`src/api.ts`)

Two new flat blocks. Both require `POST` and `{ hash: string }` JSON body.

**`POST /api/transmission/torrent/remove`**

- Calls `removeTorrent(config, hash, false)`
- On success:
  - If candidate `torrentDisplayState` was `downloading` or `paused` → write `pirateClawDisposition = 'removed'`
  - If candidate was `completed` → no disposition write (stays completed)
- Returns `200 { ok: true }`
- Returns `500 { ok: false, error: string }` on RPC failure

**`POST /api/transmission/torrent/remove-and-delete`**

- Calls `removeTorrent(config, hash, true)`
- On success: always writes `pirateClawDisposition = 'deleted'` regardless of prior state
- Returns `200 { ok: true }`
- Returns `500 { ok: false, error: string }` on RPC failure

### Edge case: completed torrent removal

A `completed` torrent has `percentDone === 1`. Removing it without `delete-local-data` is a Transmission housekeeping action — the file is already on disk. Pirate Claw does not set `pirateClawDisposition = 'removed'` in this case so the archive strip continues to show it. Removing with `delete-local-data` is destructive and sets `pirateClawDisposition = 'deleted'`.

### State guard logic

Same pattern as P20.02:

1. Parse `{ hash }` from request body
2. Find candidate by `transmissionTorrentHash`
3. Reject `missing`, `removed`, `deleted` states with `400` — torrent is already gone or terminal
4. Call RPC
5. Write disposition if applicable
6. Return result

## Out of Scope

- Dispose endpoint for already-missing torrents (P20.04)
- Context menu UI (P20.05)

## Exit Condition

- `POST /api/transmission/torrent/remove` on a `downloading` candidate: torrent removed from Transmission, `pirateClawDisposition = 'removed'` written
- `POST /api/transmission/torrent/remove` on a `completed` candidate: torrent removed, no disposition written
- `POST /api/transmission/torrent/remove-and-delete` on any active candidate: torrent and data removed, `pirateClawDisposition = 'deleted'` written
- `POST /api/transmission/torrent/remove` on a `missing` candidate: returns `400`
- `bun run typecheck` passes
