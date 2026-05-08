# P18.03 TV shows vertical slice: Plex match, cache enrichment, /api/shows fields, shows UI

## Goal

Apply the same enrichment pattern established in P18.02 to tracked TV shows:
iterate tracked shows in the background refresh, search and fuzzy-match each
against the Plex library, write results to `plex_tv_cache`, and surface
`plexStatus`, `watchCount`, and `lastWatchedAt` on `GET /api/shows` with minimal
dashboard display.

## Scope

- **TV show enrichment module** (`src/plex/shows.ts`):
  - Accepts the list of tracked shows from `buildShowBreakdowns` (or equivalent)
  - For each show: fires a Plex title search
    (`/library/search?query=<title>&type=2`) against the configured server;
    fuzzy-matches the result set on normalized title using the same hardcoded
    internal threshold as the movie slice
  - On match: writes/upserts `plex_tv_cache` row with `in_library=1`,
    `watch_count`, `last_watched_at`, `plex_rating_key`, `cached_at=now`
  - On no match: writes/upserts row with `in_library=0`, `watch_count=0`,
    `last_watched_at=null`, `cached_at=now`
  - On Plex unreachable or error: skips the show, logs a warning, leaves
    existing cache row intact; does not crash the refresh
- **`runPlexBackgroundRefresh` updated:** calls TV show enrichment after the
  movie sweep; both sweeps run in the same background pass
- **`/api/shows` enriched:** each show item in the response gains the same three
  new optional fields read from `plex_tv_cache`:
  - `plexStatus`: `"in_library"` | `"missing"` | `"unknown"`
  - `watchCount`: `number | null`
  - `lastWatchedAt`: ISO 8601 string | null
- **Minimal shows dashboard UI:** display the three new fields alongside existing
  show metadata; consistent badge and text treatment with the movie UI from P18.02

## Out Of Scope

- Per-season or per-episode Plex state (deferred per product doc)
- Changes to `/api/movies` (already landed in P18.02)
- Candidates enrichment (no candidates slice in Phase 18)

## Exit Condition

After the background refresh runs, shows present in the Plex library show
`plexStatus: "in_library"` and a non-null `watchCount` in `GET /api/shows`.
Shows not in the library show `plexStatus: "missing"`. Shows not yet refreshed
show `plexStatus: "unknown"`. The full refresh sweep (movies + shows) completes
without blocking the daemon. Plex unreachability is logged and does not prevent
`/api/shows` from returning. The Phase 18 exit condition from the product doc is
now satisfied end-to-end.

## Rationale

Inherits the proven Plex client, cache write path, and API enrichment pattern
from P18.02. TV matching is slightly more ambiguous than movies (no year key)
but still operates against a small tracked-item set, keeping the result set
fuzzy-match fast and tractable. Minimal UI ships in the same ticket for the same
reasons as P18.02: self-contained, visually reviewable PR.
