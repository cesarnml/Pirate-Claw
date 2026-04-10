# P14.02 Feeds Write Endpoint

## Goal

Add `PUT /api/config/feeds` to the daemon API with blocking HTTP fetch validation — the only genuinely new behavior in Phase 14's API surface.

## Scope

- Add `PUT /api/config/feeds` to [`src/api.ts`](../../../src/api.ts):
  - validates each feed entry in the request body using `validateFeed` from `src/config.ts`
  - for each URL in the incoming array that is **not** already present in the on-disk `feeds` array, performs a blocking HTTP GET:
    - server-side timeout: 10 seconds
    - HTTP 2xx response required; any other result rejects the PUT with `400 { "error": "feed URL did not return a successful response: <url>" }`
    - existing feed URLs (URL already on disk) are skipped — no re-fetch
  - if all new URLs pass, replaces the full `feeds` array atomically via `writeConfigAtomically`
  - returns the updated redacted config with a fresh ETag on success
- Enforce same auth/concurrency contract as P14.01:
  - `Authorization: Bearer <token>`; 401 if missing, 403 if wrong token or writes disabled
  - `If-Match` with current ETag; 428 if missing, 409 on stale revision
  - `403 { "error": "config writes are disabled" }` when no write token is configured
- Add API tests covering:
  - disabled mode
  - missing / wrong bearer token
  - missing `If-Match`, stale ETag
  - validation failure (malformed feed entry)
  - new URL returns non-2xx → 400 with the failing URL in the error body
  - new URL times out (10s) → 400
  - existing URL in both old and new array → not re-fetched (assert no outbound request)
  - happy path: new URL passes, config updated, fresh ETag returned
- Commit `fixtures/api/config-with-feeds.json` — a real `GET /api/config` response snapshot with the feeds array populated, for the Feeds UI ticket to anchor types against

## Implementation Note

The blocking fetch runs within the Bun HTTP request handler. Keep the implementation simple: `fetch(url, { signal: AbortSignal.timeout(10_000) })`. Do not introduce retry logic, connection pooling, or custom DNS behavior — a single attempt per new URL is the contract.

## Out Of Scope

- Any web UI changes.
- Per-feed poll interval editing.
- Advisory validation or auto-retry on transient failures (product decision: blocking reject is the contract).
- `PUT /api/config/tv/defaults` or `PUT /api/config/movies` (P14.01).

## Exit Condition

The feeds endpoint is live with blocking fetch validation, full auth/ETag contract, and green tests. Existing-URL skip behavior is verified. Fixture snapshot committed.

## Rationale

_To be filled in after implementation._
