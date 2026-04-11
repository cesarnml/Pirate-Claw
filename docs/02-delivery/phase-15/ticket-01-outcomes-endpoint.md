# P15.01 GET /api/outcomes — Skipped No-Match Outcomes Endpoint

## Goal

Add `GET /api/outcomes` to the daemon API, returning `feed_item_outcomes` records where `status = 'skipped_no_match'` for the last 30 days. This endpoint feeds the Unmatched Candidates view and anchors the fixture snapshot required before P15.06 begins.

## Scope

### Repository

- Add `listSkippedNoMatchOutcomes(days: number): SkippedOutcomeRecord[]` to the `Repository` interface and `createRepository` implementation in [`src/repository.ts`](../../../src/repository.ts).
- SQL: `SELECT fo.id, fo.run_id, fo.status, fo.created_at, fi.raw_title AS title, fi.feed_name FROM feed_item_outcomes fo LEFT JOIN feed_items fi ON fo.feed_item_id = fi.id WHERE fo.status = 'skipped_no_match' AND fo.created_at >= datetime('now', '-' || ? || ' days') ORDER BY fo.created_at DESC`
- Return type:
  ```typescript
  export type SkippedOutcomeRecord = {
    id: number;
    runId: number;
    status: 'skipped_no_match';
    recordedAt: string;
    title: string | null; // null when feed_item_id is NULL on the outcome row
    feedName: string | null; // null when feed_item_id is NULL on the outcome row
  };
  ```
- Add `listSkippedNoMatchOutcomes` to the `Repository` type definition.

### API

- Add `GET /api/outcomes` handler to [`src/api.ts`](../../../src/api.ts).
- Query param `?status=skipped_no_match` is the only supported value in P15; other values return `400 { "error": "unsupported status filter" }`. No param defaults to `skipped_no_match` (require explicit param — unambiguous).
- Calls `repository.listSkippedNoMatchOutcomes(30)`.
- Response shape:
  ```json
  {
    "outcomes": [
      {
        "title": "Some.Show.S01E01.720p",
        "feedName": "main-tv",
        "runId": 42,
        "status": "skipped_no_match",
        "recordedAt": "2026-04-01T12:00:00.000Z"
      }
    ]
  }
  ```
  `title` and `feedName` may be `null`.

### Fixture Snapshot

- Commit `fixtures/api/outcomes-skipped-no-match.json` — a representative `GET /api/outcomes?status=skipped_no_match` response with at least 3 entries (mix of null and non-null `title`/`feedName`) for use by P15.06.

### Tests

- Repository unit tests:
  - returns only `skipped_no_match` rows
  - respects the 30-day window (rows older than 30 days excluded)
  - LEFT JOIN: title and feedName are populated when `feed_item_id` is non-null, null when it is null
- API handler tests:
  - `GET /api/outcomes?status=skipped_no_match` → 200 with correct shape
  - `GET /api/outcomes?status=other` → 400
  - `GET /api/outcomes` (no param) → 400 (require explicit param)
  - empty result when no matching outcomes → `{ "outcomes": [] }`

## Out of Scope

- Additional `status` filter values (P16+)
- Pagination or server-side search
- Any web UI (P15.06)

## Exit Condition

`GET /api/outcomes?status=skipped_no_match` is live, returns the correct shape, tests are green, and `fixtures/api/outcomes-skipped-no-match.json` is committed and readable by P15.06.

## Rationale

_(Update this section after implementation with any behavior or tradeoff changes discovered.)_
