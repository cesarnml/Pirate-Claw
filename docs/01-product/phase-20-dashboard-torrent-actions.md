# Phase 20: Dashboard Torrent Actions

**Delivery status:** **Shipped on `main`.** Dashboard Transmission proxy, daemon JSON actions, `pirateClawDisposition` + derived `torrentDisplayState()`, and Transmission failures / requeue are live. Ticket stack and verification notes: [`docs/02-delivery/phase-20/implementation-plan.md`](../02-delivery/phase-20/implementation-plan.md); retrospective: [`notes/public/phase-20-retrospective.md`](../../notes/public/phase-20-retrospective.md).

**Numbering note:** The v1.0.0 / schema-versioning milestone that previously occupied the “Phase 20” planning slot is now **[Phase 30: v1.0.0 release and schema versioning](./phase-30-v1-release-and-schema-versioning.md)**. This document keeps **Phase 20** exclusively for the dashboard-as-Transmission-proxy work below.

## TL;DR

**Goal (met on `main`):** The dashboard acts as a functional proxy for the Transmission client: torrent lifecycle actions from a right-click context menu on Torrent Manager rows, a **Queue** control on the Transmission failures card for failed enqueue retries, and a data-model clean break replacing redundant `CandidateLifecycleStatus` with derived display state plus `pirateClawDisposition`.

**Ships (on `main`):** Pause, resume, remove, remove-with-delete torrent actions; missing-torrent disposition resolution; manual requeue for candidates still in `failed` after a Transmission enqueue failure; startup migration dropping `lifecycle_status` and adding `pirate_claw_disposition`; reconciler guard for terminal dispositions.

**Post-ship UI refinements (on `main`):**

- Missing torrents remain explicit in Torrent Manager until the operator resolves them as `removed` or `deleted`; this preserves ambiguity when Transmission-side deletion intent is unknown.
- Completion remains sticky for archive/history presentation once observed (`transmissionPercentDone === 1` or `transmissionDoneDate` present), even if the torrent later disappears from Transmission.
- Sidebar operations status includes Plex configuration state alongside daemon and Transmission so operators can see ingestion + library readiness in one place.

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
- **Missing after prior completion** → still treated as `missing` until explicit disposition. Pirate Claw does not infer `deleted` from absence alone.

---

## New API Endpoints

All new endpoints are flat `if (path === ... && request.method === 'POST')` blocks in `createApiFetch`. Request body is JSON. All transmission action endpoints accept `{ hash: string }`.

| Endpoint                                           | Transmission RPC                             | DB Write                                                             |
| -------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| `POST /api/transmission/torrent/pause`             | `torrent-stop`                               | none                                                                 |
| `POST /api/transmission/torrent/resume`            | `torrent-start`                              | none                                                                 |
| `POST /api/transmission/torrent/remove`            | `torrent-remove`                             | `pirateClawDisposition = 'removed'` (downloading, paused, completed) |
| `POST /api/transmission/torrent/remove-and-delete` | `torrent-remove` + `delete-local-data: true` | `pirateClawDisposition = 'deleted'`                                  |
| `POST /api/transmission/torrent/dispose`           | none                                         | `pirateClawDisposition = body.disposition` (resolves missing)        |
| `POST /api/candidates/:id/requeue`                 | none (calls `downloader.submit` directly)    | writes `transmissionTorrentId/Hash` on success                       |

### New Transmission Service Functions (in `src/transmission.ts`)

Following the existing session-negotiation pattern (409 retry):

- `pauseTorrent(config, hash)` → `torrent-stop`
- `resumeTorrent(config, hash)` → `torrent-start`
- `removeTorrent(config, hash, deleteLocalData: boolean)` → `torrent-remove`

---

## TransmissionFailuresCard — Queue button

The dashboard lists **deduped** matched candidates whose latest feed outcome is `failed` while `candidate_state` is still `failed` (Transmission enqueue rejected or errored). Each row exposes **Queue**, wired to `POST /api/candidates/:id/requeue`.

- Endpoint calls `downloader.submit(candidate.downloadUrl)` immediately (Option A: synchronous, not deferred to next daemon cycle). The daemon’s embedded API must be constructed with the same Transmission **downloader** instance used for feed runs; otherwise the handler returns **503** (`requeue is not available`).
- On success: writes `transmissionTorrentId`, `transmissionTorrentHash` back to the candidate record; the row disappears from this list on the next refresh once the candidate leaves the failed state.
- UI: deserialize SvelteKit action results (HTTP 200 can still mean `failure`); show errors inline; brief green “Queued ✓” only on real success.
- **Queue** is shown only for rows in that failed-enqueue list (not for `skipped_duplicate` or unmatched `skipped_no_match` noise on the home dashboard).

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

**Status:** This exit condition is satisfied on `main` (see delivery plan and retrospective above).

## Retrospective

See [`notes/public/phase-20-retrospective.md`](../../notes/public/phase-20-retrospective.md).
