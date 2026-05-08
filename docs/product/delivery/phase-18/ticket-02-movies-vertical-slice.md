# P18.02 Movies vertical slice: Plex match, cache enrichment, /api/movies fields, movie UI

## Goal

Wire movie enrichment end-to-end: iterate pirate-claw's tracked movies in the
background refresh, search and fuzzy-match each against the Plex library, write
results to `plex_movie_cache`, and surface `plexStatus`, `watchCount`, and
`lastWatchedAt` on `GET /api/movies` with minimal dashboard display.

## Scope

- **Movie enrichment module** (`src/plex/movies.ts`):
  - Accepts the list of tracked movies from `buildMovieBreakdowns` (or equivalent)
  - For each movie: fires a Plex title search (`/library/search?query=<title>&type=1`)
    against the configured server; fuzzy-matches the result set on title + year
    using a hardcoded internal confidence threshold (not operator-configurable)
  - On match: writes/upserts `plex_movie_cache` row with `in_library=1`,
    `watch_count`, `last_watched_at`, `plex_rating_key`, `cached_at=now`
  - On no match: writes/upserts row with `in_library=0`, `watch_count=0`,
    `last_watched_at=null`, `cached_at=now`
  - On Plex unreachable or error: skips the movie, logs a warning, leaves
    existing cache row intact (or absent); does not crash the refresh
- **`runPlexBackgroundRefresh` updated:** calls movie enrichment when `plex`
  is configured; the no-op skeleton from P18.01 is replaced with a real sweep
- **`/api/movies` enriched:** each movie item in the response gains three new
  optional fields read from `plex_movie_cache`:
  - `plexStatus`: `"in_library"` | `"missing"` | `"unknown"` (unknown when no
    cache row or row is expired)
  - `watchCount`: `number | null` (null when unknown)
  - `lastWatchedAt`: ISO 8601 string | null (null when unknown)
- **Minimal movie dashboard UI:** display the three new fields alongside existing
  movie metadata; treatment at minimum: a status badge for `plexStatus` and
  plain text for watch count / last watched date

## Out Of Scope

- TV show enrichment (P18.03)
- Changes to `/api/shows` (P18.03)
- Lazy enrichment on cache miss (deferred per grill-me decision)
- Operator-configurable match threshold (deferred)

## Exit Condition

After the background refresh runs, movies present in the Plex library show
`plexStatus: "in_library"` and a non-null `watchCount` in `GET /api/movies`.
Movies not in the library show `plexStatus: "missing"`. Movies not yet refreshed
(e.g. during the first startup sweep) show `plexStatus: "unknown"`. Plex
unreachability is logged and does not prevent `/api/movies` from returning.

## Rationale

Movies are the simpler slice (one item → one Plex result) so they validate the
Plex client, cache write path, and API enrichment pattern before the TV slice
inherits it. Shipping minimal UI in the same ticket keeps the PR self-contained
and visually reviewable.
