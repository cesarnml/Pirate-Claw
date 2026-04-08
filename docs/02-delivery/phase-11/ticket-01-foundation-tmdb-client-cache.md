# P11.01 Foundation: TMDB config, client, SQLite cache, graceful degrade

## Goal

Establish the TMDB integration boundary: configuration, HTTP client, split SQLite cache tables (movie + TV), and safe behavior when TMDB is disabled or unavailable—without yet shipping full API or dashboard enrichment.

## Scope

- **Config:** Optional `tmdb` block: `apiKey` (or env `PIRATE_CLAW_TMDB_API_KEY`), `cacheTtlDays` (default 7). Validate in config loading; document in `pirate-claw.config.example.json`.
- **SQLite migrations:** Separate tables for **movie** and **TV** TMDB cache rows; columns for TMDB id, expiry, scalar fields aligned with the product doc (overview, poster path, backdrop path, vote average, vote count, genre ids, release / first air date; TV: season count, episode counts as specified). Support **negative cache** entries (miss or transient error) with a **shorter TTL** than successful fetches.
- **TMDB client module:** HTTP client with timeouts, basic throttling, handle HTTP 429 with backoff or skip; no coupling to RSS polling or pipeline runs.
- **Graceful degrade:** If key is missing or TMDB is unreachable, daemon startup and existing cycles continue; log warnings; enrichment helpers return empty/disabled state without throwing into the main daemon loop.

## Out Of Scope

- Enriching `GET /api/movies`, `GET /api/shows`, or `GET /api/candidates` (P11.02–P11.04)
- Dashboard UI beyond any smoke wiring needed for local dev (no Phase 11 exit UX yet)
- Background enrichment scheduler (P11.05)
- Eager backfill of all candidates

## Exit Condition

With TMDB configured, the daemon starts and migrations apply; with TMDB omitted or invalid, the daemon still runs Phase 10 behavior. Unit or integration tests cover config parsing and “no key” path.

## Rationale

This ticket isolates persistence and external API risk so later vertical slices can focus on matching and read-path enrichment without mixing schema migrations with UI work.

**Implementation notes (P11.01):**

- Optional `tmdb` config supports `cacheTtlDays` and `negativeCacheTtlDays` (defaults in code); `GET /api/config` redacts `tmdb.apiKey` like Transmission credentials.
- `ensureSchema` applies `tmdb_movie_cache`, `tmdb_tv_cache`, and `tmdb_tv_season_cache` via `ensureTmdbSchema`.
- Tests cover match-key helpers, config validation, TMDB table presence after migration, config redaction, and isolated `.env` loading for Transmission so parent env does not mask sibling `.env` values.
