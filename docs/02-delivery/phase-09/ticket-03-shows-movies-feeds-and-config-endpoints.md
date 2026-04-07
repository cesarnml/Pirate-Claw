# P9.03 Shows, Movies, Feeds, And Config Endpoints

## Goal

Wire `GET /api/shows`, `GET /api/movies`, `GET /api/feeds`, and `GET /api/config` into the daemon HTTP server to complete the read-only API surface.

## Scope

- Implement `GET /api/shows` returning `{ shows: ShowBreakdown[] }` — per-show season/episode breakdown derived by grouping candidate state records by `normalizedTitle` where `mediaType === 'tv'`
  - Each `ShowBreakdown` contains: `normalizedTitle`, `seasons` array where each season has `season` number and `episodes` array with episode number, identity key, lifecycle status, and queue status
  - This is pure post-processing of `listCandidateStates()` — no new database query
- Implement `GET /api/movies` returning `{ movies: MovieBreakdown[] }` — movie candidates grouped by `normalizedTitle` where `mediaType === 'movie'`
  - Each `MovieBreakdown` contains: `normalizedTitle`, `year`, `resolution`, `codec`, `identityKey`, `status`, `lifecycleStatus`, `queuedAt`
  - Simpler than shows — no season/episode nesting, just a flat list of matched movies
- Implement `GET /api/feeds` returning `{ feeds: FeedStatus[] }` — each configured feed with its name, URL, media type, poll interval, last polled time, and next due time
  - Combines feed config with poll state (from `loadPollState`) and `isDueFeed` logic
  - The daemon must load poll state for this endpoint (read-only, from the poll state file)
- Implement `GET /api/config` returning the effective `AppConfig` with Transmission credentials (`username`, `password`) redacted to `"[redacted]"`
  - Uses the same config the daemon loaded at startup — no re-reading from disk
- Add integration tests: `/api/shows` returns expected grouping shape, `/api/movies` returns expected movie shape, `/api/feeds` returns expected feed status shape with poll timing, `/api/config` returns config with redacted credentials, redaction does not affect the daemon's in-memory config object

## Out Of Scope

- Write endpoints (config editing, queue/retry triggers)
- Authentication or TLS
- Docs/example config update (P9.04)

## Exit Condition

`curl http://localhost:<port>/api/shows` returns a JSON breakdown of TV shows with season/episode structure. `curl http://localhost:<port>/api/movies` returns a JSON list of movie candidates grouped by title. `curl http://localhost:<port>/api/feeds` returns feed status with last polled and next due times. `curl http://localhost:<port>/api/config` returns the full effective config with credentials redacted. No endpoint mutates daemon state.
