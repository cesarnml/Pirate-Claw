# P20.06 Queue Button (FeedEventLogCard)

## Goal

Wire the existing stub Queue button in FeedEventLogCard to immediately resubmit a failed or skipped candidate to Transmission. Provide per-row in-flight state and success/failure feedback.

## Depends On

P20.01 (data model clean break — ensures types are consistent)

## Background

FeedEventLogCard (currently named this, may be renamed) shows failed and skipped candidates. The Queue button is already rendered but does nothing. This ticket makes it functional via a new `POST /api/candidates/:id/requeue` endpoint that calls `downloader.submit()` immediately (Option A — synchronous, not deferred to next daemon cycle).

## Scope

### 1. API endpoint (`src/api.ts`)

**`POST /api/candidates/:id/requeue`**

Where `:id` is the candidate's `identityKey`.

1. Find candidate by `identityKey` — return `404` if not found
2. Reject with `400` if candidate `status` is not `'failed'` or `'skipped_no_match'` — only these are eligible for requeue
3. Call `downloader.submit({ downloadUrl: candidate.downloadUrl })`
4. On success: update candidate record with `transmissionTorrentId`, `transmissionTorrentHash`, `transmissionTorrentName`
5. Return response:

```ts
// success
{
  ok: true;
  torrentHash: string;
  torrentId: number;
  torrentName: string;
}

// submission failure
{
  ok: false;
  error: string;
}
```

The endpoint requires `downloader` to be available in `ApiFetchDeps`. Confirm it is accessible or thread it through.

### 2. FeedEventLogCard UI

- Per-row in-flight state: disable the Queue button for that row while the request is in flight (other rows unaffected)
- On success: replace button with a brief "Queued ✓" text label, then reset after ~2 seconds
- On failure: show inline error message beneath the row (or as a tooltip); re-enable the button

### Eligible candidates

Only candidates where `status === 'failed' || status === 'skipped_no_match'` show an active Queue button. Other statuses render the button disabled or hidden (current behavior is a stub — match whatever is already rendered).

## Out of Scope

- Re-running the full pipeline match logic (just direct submission via `downloadUrl`)
- Bulk requeue
- Queue button on the context menu (not planned)

## Exit Condition

- `POST /api/candidates/:id/requeue` on a `failed` candidate: `downloader.submit()` called, torrent fields written, `200 { ok: true, ... }` returned
- `POST /api/candidates/:id/requeue` on a non-eligible candidate: `400` returned
- Queue button shows per-row loading state while in flight
- Success shows "Queued ✓" then resets
- Failure shows inline error, re-enables button
- `bun run typecheck` passes
