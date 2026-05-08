# P18.01 Foundation: Plex config, HTTP client, SQLite cache, scheduler skeleton, graceful no-op

## Goal

Establish the Plex integration boundary: optional config block, read-only HTTP
client, split SQLite cache tables, background refresh timer wired into the
daemon lifecycle, and safe behavior when the `plex` block is absent or the
server is unreachable — without yet shipping any enrichment logic.

## Scope

- **Config:** Optional `plex` block in `pirate-claw.config.json`:
  - `url` (required if block is present): base URL of the local Plex server
  - `token` (required if block is present): Plex authentication token; also
    accepted via `PIRATE_CLAW_PLEX_TOKEN` env var; redacted in `/api/config`
    responses using the same pattern as Transmission credentials
  - `refreshIntervalMinutes` (default `30`): how often the background refresh
    fires; `0` disables it (lazy override for local dev)
  - Validate in config loading; document in `pirate-claw.config.example.json`
- **SQLite migrations:** Two new tables via `ensurePlexSchema`:
  - `plex_movie_cache`: keyed by title + year; columns `title`, `year`,
    `plex_rating_key`, `in_library` (integer 0/1), `watch_count`, `last_watched_at`
    (ISO 8601 or null), `cached_at` (ISO 8601)
  - `plex_tv_cache`: keyed by normalized title; same columns minus `year`
  - TTL: stale when `cached_at` is older than `refreshIntervalMinutes * 2`;
    expired entries return `unknown` rather than erroring
- **Plex HTTP client** (`src/plex/client.ts`): read-only, LAN-only (no
  Plex.tv cloud); sets `X-Plex-Token` header; handles connection timeouts and
  non-2xx responses without throwing into the main daemon loop
- **Scheduler skeleton** (`src/plex/background-refresh.ts`): exports
  `runPlexBackgroundRefresh(deps)`; wired into `runDaemonLoop` on startup and
  then on the configured interval (parallel to `runTmdbBackgroundRefresh`); at
  this ticket the body is a no-op — fires, logs a debug line, returns; actual
  enrichment added in P18.02–P18.03
- **Graceful no-op:** when `plex` block is absent, `runPlexBackgroundRefresh`
  is never scheduled; all new API fields (`plexStatus`, `watchCount`,
  `lastWatchedAt`) default to `"unknown"` / `null`; no Plex connections are made
- Update `pirate-claw.config.example.json` with the `plex` block
- **`docs/engineering/sqlite-schema.mmd`:** add `PLEX_MOVIE_CACHE` and
  `PLEX_TV_CACHE` entities; also backfill the missing TMDB tables
  (`TMDB_MOVIE_CACHE`, `TMDB_TV_CACHE`, `TMDB_TV_SEASON_CACHE`) which were
  never added to the diagram — both gaps should be closed in the same commit so
  the schema diagram reflects the actual database

## Out Of Scope

- Movie or TV show enrichment logic (P18.02–P18.03)
- Any change to `/api/movies` or `/api/shows` response shape (P18.02–P18.03)
- Dashboard UI changes (P18.02–P18.03)

## Exit Condition

With `plex` configured the daemon starts, applies migrations, schedules the
background refresh timer, and logs a startup notice. With `plex` absent the
daemon runs identically to Phase 17 behavior. `plex.token` does not appear in
`GET /api/config` responses. Unit or integration tests cover config parsing and
the "no plex block" path.

## Rationale

Isolates persistence and external API risk so the vertical slices (P18.02–P18.03)
can focus on matching and cache enrichment without mixing schema migrations with
API or UI work. Same philosophy as P11.01.
