# Phase 20: Dashboard Torrent Actions

**Delivery status:** Not started — product definition only; no `docs/02-delivery/phase-20/` implementation plan until tickets are approved.

## TL;DR

**Goal:** Make the dashboard a functional proxy for the Transmission client. Add torrent lifecycle actions via a right-click context menu on TorrentManagerCard rows, wire up the Queue button in FeedEventLogCard, and clean up the data model by replacing the redundant `CandidateLifecycleStatus` with a derived state pattern and a new `pirateClawDisposition` field.

**Ships:** Pause, resume, remove, remove+delete torrent actions; missing-torrent disposition resolution; manual requeue of failed/skipped candidates; data model clean break.

**Defers:** Router extraction (future Hono migration); multi-torrent bulk actions; audit log.

---

## Data Model Clean Break

### Problem

`CandidateLifecycleStatus` (`queued | downloading | completed | missing_from_transmission`) duplicates knowledge already present in `transmissionStatusCode`. The reconciler writes to it on every cycle, creating two competing sources of truth that drift whenever the user acts directly on the Transmission web UI.

### Solution

**Drop `CandidateLifecycleStatus` entirely.** Replace all reads with a pure `torrentDisplayState()` function that derives display state at read time from live Transmission data.

**Add one new field:** `pirateClawDisposition?: 'removed' | 'deleted'` — the only two states Transmission cannot represent itself (user intentionally removed or wiped via Pirate Claw). Terminal once set; reconciler skips candidates where it is set.

### Startup Migration

Two idempotent SQL statements run at daemon startup:

```sql
ALTER TABLE candidates DROP COLUMN IF EXISTS lifecycle_status;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS pirate_claw_disposition TEXT;
```

No manual operator action required. Existing candidates carry forward with `pirate_claw_disposition = NULL`, which is correct — they continue to derive state from `transmissionStatusCode`.

### Derived State Function

Replaces all `lifecycleStatus` reads across backend and frontend:

```ts
type TorrentDisplayState =
  | 'queued'
  | 'paused'
  | 'downloading'
  | 'completed'
  | 'missing'
  | 'removed'
  | 'deleted';

function torrentDisplayState(
  candidate: CandidateStateRecord,
  liveHashes: Set<string>,
): TorrentDisplayState {
  if (candidate.pirateClawDisposition) return candidate.pirateClawDisposition;
  if (!candidate.transmissionTorrentHash) return 'queued';
  if (!liveHashes.has(candidate.transmissionTorrentHash)) return 'missing';
  if (candidate.transmissionPercentDone === 1) return 'completed';
  if (candidate.transmissionStatusCode === 0) return 'paused';
  return 'downloading';
}
```

### Reconciler Guard

Reconciler filters candidates with `WHERE pirate_claw_disposition IS NULL` before polling Transmission. Terminal candidates are never polled again.

---

## Torrent Manager Card — Context Menu Actions

Right-click anywhere on a torrent row opens a context menu. Available actions are derived from `torrentDisplayState`:

| Display State         | Available Actions                               |
| --------------------- | ----------------------------------------------- |
| `downloading`         | Pause, Remove, Remove + Delete Data             |
| `paused`              | Resume, Remove, Remove + Delete Data            |
| `missing`             | Mark Removed, Mark Deleted                      |
| `completed`           | Remove (no disposition write — stays completed) |
| `removed` / `deleted` | None (terminal, rendered differently)           |

In-flight: menu disabled while request is in flight. On failure: inline error displayed in context menu.

### State Transition Rules

- **Pause** → valid only from `downloading`. Sets Transmission torrent to stopped. No DB write (state derived from `transmissionStatusCode === 0` on next poll).
- **Resume** → valid only from `paused`. Sets Transmission torrent to started. No DB write.
- **Remove** → valid from `downloading` or `paused`. Removes torrent from Transmission (data preserved on disk). Writes `pirateClawDisposition = 'removed'`. If candidate was `completed` at time of removal, no disposition write (stays completed).
- **Remove + Delete Data** → valid from `downloading`, `paused`, or `completed`. Removes torrent and deletes local data via Transmission RPC `delete-local-data: true`. Writes `pirateClawDisposition = 'deleted'`.
- **Mark Removed / Mark Deleted** → valid only from `missing`. No Transmission RPC call (torrent is already gone). Writes `pirateClawDisposition` to resolve limbo.

---

## New API Endpoints

All new endpoints are flat `if (path === ... && request.method === 'POST')` blocks in `createApiFetch`. Request body is JSON. All transmission action endpoints accept `{ hash: string }`.

| Endpoint                                           | Transmission RPC                             | DB Write                                                      |
| -------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `POST /api/transmission/torrent/pause`             | `torrent-stop`                               | none                                                          |
| `POST /api/transmission/torrent/resume`            | `torrent-start`                              | none                                                          |
| `POST /api/transmission/torrent/remove`            | `torrent-remove`                             | `pirateClawDisposition = 'removed'` (if not completed)        |
| `POST /api/transmission/torrent/remove-and-delete` | `torrent-remove` + `delete-local-data: true` | `pirateClawDisposition = 'deleted'`                           |
| `POST /api/transmission/torrent/dispose`           | none                                         | `pirateClawDisposition = body.disposition` (resolves missing) |
| `POST /api/candidates/:id/requeue`                 | none (calls `downloader.submit` directly)    | writes `transmissionTorrentId/Hash` on success                |

### New Transmission Service Functions (in `src/transmission.ts`)

Following the existing session-negotiation pattern (409 retry):

- `pauseTorrent(config, hash)` → `torrent-stop`
- `resumeTorrent(config, hash)` → `torrent-start`
- `removeTorrent(config, hash, deleteLocalData: boolean)` → `torrent-remove`

---

## FeedEventLogCard — Queue Button

The existing stub Queue button is wired to `POST /api/candidates/:id/requeue`.

- Endpoint calls `downloader.submit(candidate.downloadUrl)` immediately (Option A: synchronous, not deferred to next daemon cycle)
- On success: writes `transmissionTorrentId`, `transmissionTorrentHash` back to candidate record
- UI: button disabled per-row while in flight; shows brief green "Queued" confirmation on success; inline red error on failure
- Eligible candidates: `status === 'failed'` or `status === 'skipped_no_match'`

---

## Explicit Deferrals

- Router extraction to Hono (target: when structured DB migrations are introduced)
- Bulk multi-torrent actions
- Audit log / action history
- ArchiveStrip copy update (separate, small PR)
- `StatusChip` style updates for new display states (handled during implementation if trivial)

---

## Exit Condition

A user can pause, resume, remove, and requeue torrents entirely from the Pirate Claw dashboard without opening the Transmission web UI. Missing torrents can be resolved to a terminal state. The data model has a single source of truth for torrent state. The DB carries no `lifecycle_status` column.

## Retrospective

To be completed after delivery.
