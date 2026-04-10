# P14.01 TV Defaults and Movie Policy Write Endpoints

## Goal

Add `PUT /api/config/tv/defaults` and `PUT /api/config/movies` to the daemon API, using the same bearer + ETag/If-Match + atomic write infrastructure established in Phase 13.

## Scope

- Add `PUT /api/config/tv/defaults` to [`src/api.ts`](../../../src/api.ts):
  - validates request body against `validateCompactTvDefaults` from `src/config.ts`
  - merges updated defaults into the on-disk config, preserving existing `tv.shows` entries (same `mergeTvShowsPreservingDiskEntries` pattern as the existing `PUT /api/config` tv.shows path)
  - writes atomically via `writeConfigAtomically`
  - returns the updated redacted config with a fresh ETag on success
- Add `PUT /api/config/movies` to [`src/api.ts`](../../../src/api.ts):
  - validates request body against `validateMoviePolicy` from `src/config.ts`
  - `codecPolicy` is required (`'prefer' | 'require'`); reject 400 if absent
  - replaces the `movies` section atomically
  - returns the updated redacted config with a fresh ETag on success
- Both endpoints enforce:
  - `Authorization: Bearer <token>`; 401 if missing, 403 if wrong token or writes disabled
  - `If-Match` with current ETag; 428 if header missing, 409 on stale revision
  - `403 { "error": "config writes are disabled" }` when no write token is configured
- Add API tests covering:
  - disabled mode (no token configured)
  - missing / wrong bearer token (401 / 403)
  - missing `If-Match` (428)
  - stale ETag (409)
  - validation failure (400) for each endpoint
  - happy path: updated config returned with fresh ETag
- Commit `fixtures/api/config-with-tv-defaults.json` and `fixtures/api/config-with-movies.json` — real `GET /api/config` response snapshots with these sections populated, for UI tickets to anchor types against

## Out Of Scope

- `PUT /api/config/feeds` (P14.02).
- Any web UI changes.
- Per-show overrides — `tv.shows` is untouched by `PUT /api/config/tv/defaults`.
- Per-feed poll interval editing.

## Exit Condition

Both endpoints are live with full bearer + ETag auth, validated writes, and atomic file updates. Tests are green. Fixture snapshots are committed and readable by subsequent UI tickets.

## Rationale

_To be filled in after implementation._
