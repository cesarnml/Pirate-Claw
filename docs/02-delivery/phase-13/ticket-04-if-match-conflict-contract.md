# P13.04 If-Match Conflict Contract

## Goal

Enforce optimistic concurrency for config writes using revision matching (`If-Match`) and deterministic `409` conflict responses on stale updates.

## Scope

- Require `If-Match` (or chosen equivalent) on config write endpoint(s) in [`src/api.ts`](../../../src/api.ts).
- Compare incoming revision to current config revision and reject stale writes with `409`.
- Keep failure semantics safe and non-destructive (no partial write on conflict).
- Add deterministic tests for matching revision success and stale revision conflict.

## Out Of Scope

- Token model/auth policy changes.
- Web form conflict UX behavior (handled in web tickets).
- Any expansion beyond approved runtime-only writable fields.

## Exit Condition

Write requests enforce revision preconditions and return `409` on stale revisions with tests proving conflict safety.

## Rationale

- Required `If-Match` for config writes and surfaced `428` when missing so clients must participate in optimistic concurrency.
- Added deterministic `409` conflict responses when provided revisions are stale, with current `ETag` echoed for immediate retry workflows.
- Conflict checks happen before persistence; stale writes never touch disk, preserving safe/no-partial-write behavior.
