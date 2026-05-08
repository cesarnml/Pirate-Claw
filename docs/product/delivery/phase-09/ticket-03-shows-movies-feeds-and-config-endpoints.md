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

`curl http://localhost:<port>/api/shows` returns a JSON breakdown of TV shows with season/episode structure. `curl http://localhost:<port>/api/movies` returns a JSON list of movie candidates grouped by title. `curl http://localhost:<port>/api/feeds` returns feed status with last polled time and an `isDue` boolean. `curl http://localhost:<port>/api/config` returns the full effective config with nested `transmission.username` and `transmission.password` redacted. No endpoint mutates daemon state.

## Rationale

- **Show grouping**: `buildShowBreakdowns` groups TV candidates by `normalizedTitle` → season → episodes, providing a structured hierarchy that mirrors how users think about TV content (show → season → episode). TV candidates with missing season or episode are skipped rather than synthesized as 0, to avoid collision with real specials (S00).
- **Movie grouping**: `buildMovieBreakdowns` filters candidates to movies only and maps to a flat list since movies lack the season/episode hierarchy.
- **Feed status with poll state**: `buildFeedStatuses` combines static feed config with persisted poll state timestamps and computes an `isDue` boolean by delegating to the shared `isDueFeed()` helper from `poll-state.ts`, keeping the API and daemon scheduler in lockstep.
- **Credential redaction**: `redactConfig` uses a shallow spread copy to replace nested `transmission.username` and `transmission.password` with `'[redacted]'` without mutating the original config object.
- **Dependency injection expansion**: `ApiFetchDeps` grew to include `config`, `pollStatePath`, and `loadPollState` alongside the existing `repository` and `health`. This keeps the fetch handler fully testable with stubs — no file I/O or real config needed in tests.
- **No router library**: URL pathname matching remains a simple `switch` statement. Seven routes do not justify a dependency.
