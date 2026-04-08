# Phase 11 TMDB Metadata Enrichment

**Delivery status:** Complete on `main` (see [`docs/02-delivery/phase-11/implementation-plan.md`](../02-delivery/phase-11/implementation-plan.md)).

Phase 11 integrates TMDB as the external metadata source for movies and TV shows, enriching the daemon API and dashboard with ratings, posters, and descriptive metadata without changing the core RSS intake or matching pipeline.

## Phase Goal

Phase 11 should leave Pirate Claw in a state where:

- the daemon fetches and caches TMDB metadata for matched candidates
- the API serves enriched metadata (ratings, posters, overviews, cast) alongside candidate data
- the dashboard displays posters, ratings, and richer show/movie detail pages
- ratings are display-only — they do not gate the intake pipeline

## Product Goals For This Phase

- make the dashboard visually useful for browsing what has been downloaded and assessing quality
- give the operator at-a-glance ratings context without leaving the dashboard
- establish the TMDB integration boundary so future phases (search-to-add, calendar) can build on it

## Committed Scope

- add TMDB API client to the daemon with a configurable API key
  - `tmdb.apiKey` in config (or env-backed via `PIRATE_CLAW_TMDB_API_KEY`)
- match candidates to TMDB entries:
  - movies: search by normalized title + year
  - TV shows: search by show name, resolve season/episode metadata
- cache TMDB metadata in SQLite to avoid redundant API calls and respect rate limits
  - store: TMDB ID, title, overview, poster path, backdrop path, vote average, vote count, genre IDs, release date / first air date
  - for TV: season count, episode count per season
  - cache TTL: configurable, default 7 days
- extend the daemon API:
  - enrich `GET /api/candidates` with TMDB metadata when available
  - enrich `GET /api/shows` with TMDB show metadata, season/episode detail, and poster URLs
  - add `GET /api/movies` with TMDB-enriched movie candidates
- update the dashboard:
  - display poster images on candidate list and detail views
  - show TMDB rating badge on movie and show entries
  - add movie overview and cast summary to detail views
  - add season/episode metadata from TMDB alongside local download status on show detail pages
- TMDB metadata enrichment runs on a background schedule in the daemon, not inline during RSS polling
- gracefully degrade when TMDB is unreachable — display local data without metadata, log warnings

## Configuration Surface Added In This Phase

```json
{
  "tmdb": {
    "apiKey": "your-tmdb-api-key",
    "cacheTtlDays": 7
  }
}
```

The `tmdb` block is optional. When omitted, the daemon and dashboard operate without TMDB enrichment (Phase 10 baseline behavior).

## Exit Condition

Candidates in the dashboard display TMDB posters and ratings when TMDB is configured. Show detail pages show TMDB season/episode metadata alongside local download state. Movie candidates show TMDB overview, rating, and poster. When TMDB is not configured or unreachable, the dashboard degrades gracefully to Phase 10 behavior.

## Explicit Deferrals

These are intentionally outside Phase 11:

- rating-based intake gating (`minRating` as a pipeline filter)
- TMDB-powered show/movie search and add-to-config from the UI
- release calendar or upcoming schedule views
- config editing through the UI
- TMDB metadata for candidates that were never matched (speculative discovery)
- poster/image local caching or CDN proxying beyond URL passthrough

## Why The Scope Stays Narrow

TMDB integration is the richest phase in this wave, but its value is strictly additive — it makes existing data look better and more informative. By keeping it display-only and cache-backed, the core intake pipeline stays fast, offline-capable, and unchanged. The rating-gate and discovery features build on this metadata foundation but belong in future phases where the tradeoffs (API downtime blocking queue cycles, unrated new releases) can be evaluated against real usage.
