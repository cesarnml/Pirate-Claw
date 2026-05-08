# P20.02 Pause / Resume

## Goal

Add pause and resume torrent actions — Transmission RPC functions and API endpoints. No DB writes. No UI yet (P20.05).

## Depends On

P20.01 (data model clean break)

## Scope

### 1. Transmission service (`src/transmission.ts`)

Add two functions following the existing session-negotiation pattern (409 retry, auth headers):

**`pauseTorrent(config, hash: string): Promise<TorrentActionResult>`**

- RPC method: `torrent-stop`
- Arguments: `{ ids: [hash] }`

**`resumeTorrent(config, hash: string): Promise<TorrentActionResult>`**

- RPC method: `torrent-start`
- Arguments: `{ ids: [hash] }`

Add shared result type:

```ts
export type TorrentActionResult = { ok: true } | SubmissionFailure;
```

### 2. API endpoints (`src/api.ts`)

Two new flat blocks in `createApiFetch`. Both require `POST` method and `{ hash: string }` JSON body.

**`POST /api/transmission/torrent/pause`**

- Calls `pauseTorrent(config, hash)`
- Returns `200 { ok: true }` on success
- Returns `500 { ok: false, error: string }` on RPC failure
- Valid only when called with a hash that belongs to a `downloading` candidate (enforce at API layer: look up candidate by hash, reject with `400` if not found or not in a pauseable state)

**`POST /api/transmission/torrent/resume`**

- Calls `resumeTorrent(config, hash)`
- Returns `200 { ok: true }` on success
- Returns `500 { ok: false, error: string }` on RPC failure
- Valid only when candidate is `paused` (transmissionStatusCode === 0, percentDone < 1)

### State guard logic

Both endpoints share the same candidate lookup pattern:

1. Parse `{ hash }` from request body
2. Find candidate in repository by `transmissionTorrentHash`
3. Derive `torrentDisplayState()` — reject with `400 { ok: false, error: '...' }` if action is invalid for current state
4. Call RPC
5. Return result

No DB write on success — state updates on next reconciler poll.

## Out of Scope

- Context menu UI (P20.05)
- Remove/delete actions (P20.03)

## Exit Condition

- `POST /api/transmission/torrent/pause` with a valid downloading torrent hash returns `200`
- `POST /api/transmission/torrent/pause` with a non-downloading hash returns `400`
- `POST /api/transmission/torrent/resume` with a valid paused hash returns `200`
- `bun run typecheck` passes
