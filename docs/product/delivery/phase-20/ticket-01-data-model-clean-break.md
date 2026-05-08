# P20.01 Data Model Clean Break

## Goal

Remove `CandidateLifecycleStatus` as a concept from the entire codebase. Replace it with a `pirateClawDisposition` terminal field and a `torrentDisplayState()` derived function. The build must pass with zero references to `lifecycleStatus` or `CandidateLifecycleStatus` anywhere in the repo.

## Background

`CandidateLifecycleStatus` duplicates information already present in `transmissionStatusCode`. The reconciler writes it on every cycle, creating two sources of truth that drift whenever the user acts directly on the Transmission web UI. This ticket performs the clean break before any action endpoints are added.

## Scope

### 1. Startup DB migration (`src/repository.ts` or DB init)

Add two idempotent SQL statements that run at daemon startup:

```sql
ALTER TABLE candidates DROP COLUMN IF EXISTS lifecycle_status;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS pirate_claw_disposition TEXT;
```

### 2. Backend type changes (`src/repository.ts`)

- Remove `CandidateLifecycleStatus` type export
- Remove `lifecycleStatus` field from `CandidateStateRecord`
- Add `pirateClawDisposition?: 'removed' | 'deleted'` to `CandidateStateRecord`
- Update all repository read/write methods that reference `lifecycle_status` or `lifecycleStatus`

### 3. Reconciler guard

In the reconciler (wherever candidates are loaded for Transmission polling), add a filter:

```ts
// skip terminal candidates
WHERE pirate_claw_disposition IS NULL
```

Candidates with a disposition set are never polled again.

### 4. Frontend type changes (`web/src/lib/types.ts`)

- Remove `CandidateLifecycleStatus` type
- Remove `lifecycleStatus` from `CandidateStateRecord`
- Add `pirateClawDisposition?: 'removed' | 'deleted'`

### 5. `torrentDisplayState()` function (`web/src/lib/helpers.ts`)

Add the derived state function:

```ts
export type TorrentDisplayState =
  | 'queued'
  | 'paused'
  | 'downloading'
  | 'completed'
  | 'missing'
  | 'removed'
  | 'deleted';

export function torrentDisplayState(
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

### 6. Component updates

Replace all existing reads of `candidate.lifecycleStatus` across Svelte components with `torrentDisplayState()`. The `liveHashes` set is derived from the `activeDownloads` prop already available on the dashboard page.

## Out of Scope

- New API endpoints (P20.02+)
- Context menu UI (P20.05)
- StatusChip updates for new display states (handle during implementation if trivial)

## Exit Condition

- `grep -r "lifecycleStatus\|CandidateLifecycleStatus" src/ web/src/` returns zero matches
- `bun run typecheck` passes
- Dashboard renders without errors on a fresh DB (no `lifecycle_status` column) and on a pre-Phase-20 DB (migration runs silently)
