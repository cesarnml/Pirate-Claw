# Phase 11 Implementation Plan

**Status:** Delivered on `main` (tickets `P11.01`–`P11.06`).

Phase 11 integrates TMDB as the external metadata source for movies and TV shows, enriching the daemon API and dashboard with ratings, posters, and descriptive metadata without changing the core RSS intake or matching pipeline.

**Product contract:** [`docs/01-product/phase-11-tmdb-metadata-enrichment.md`](../../01-product/phase-11-tmdb-metadata-enrichment.md)

## Epic

- `Phase 11 TMDB Metadata Enrichment`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Decomposition decisions (grill-me)

| Decision              | Choice                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------- |
| Ticket ordering       | **Hybrid:** foundation ticket, then **vertical slices**                                     |
| First vertical slice  | **Movies**                                                                                  |
| Enrichment timing     | **Lazy** on API read (cache miss / stale) first; **background scheduler** in a later ticket |
| SQLite                | **Split** movie vs TV cache tables                                                          |
| Miss / error handling | **Negative cache** with shorter TTL than positive entries                                   |
| Dashboard             | **Per vertical slice** — each ticket ships minimal UI for that slice                        |
| Order after movies    | **TV shows**, then **candidates**                                                           |
| Background scheduler  | Lands **after** the candidates vertical slice                                               |

## Stack (high level)

- TMDB HTTP API v3 (read-only from daemon)
- SQLite cache tables (movie + TV), configurable TTL
- Existing daemon HTTP API (`src/api.ts`) and SvelteKit dashboard (`web/`)
- Bun runtime; config via `pirate-claw.config.json` + env

## Ticket Order

1. `P11.01 Foundation: TMDB config, client, SQLite cache, graceful degrade`
2. `P11.02 Movies vertical slice: TMDB match, lazy API enrich, minimal movie UI`
3. `P11.03 TV shows vertical slice: show/season/episode TMDB, enrich GET /api/shows, show UI`
4. `P11.04 Candidates vertical slice: enrich GET /api/candidates, candidate list/detail UI`
5. `P11.05 Background TMDB enrichment scheduler`
6. `P11.06 Docs, index updates, exit verification`

## Ticket Files

- `ticket-01-foundation-tmdb-client-cache.md`
- `ticket-02-movies-vertical-slice.md`
- `ticket-03-tv-shows-vertical-slice.md`
- `ticket-04-candidates-vertical-slice.md`
- `ticket-05-background-tmdb-scheduler.md`
- `ticket-06-docs-exit-verification.md`

## Exit Condition

Matches the product doc:

> Candidates in the dashboard display TMDB posters and ratings when TMDB is configured. Show detail pages show TMDB season/episode metadata alongside local download state. Movie candidates show TMDB overview, rating, and poster. When TMDB is not configured or unreachable, the dashboard degrades gracefully to Phase 10 behavior.

Source: [`docs/01-product/phase-11-tmdb-metadata-enrichment.md`](../../01-product/phase-11-tmdb-metadata-enrichment.md) (Exit Condition section).

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- the previous tests are green
- the behavior change is explained in the ticket `## Rationale` section when the ticket introduces or changes behavior
- the phase-level deferrals remain unchanged

## Explicit Deferrals

These are intentionally out of scope for Phase 11 (see product doc **Explicit Deferrals**):

- rating-based intake gating (`minRating` as a pipeline filter)
- TMDB-powered show/movie search and add-to-config from the UI
- release calendar or upcoming schedule views
- config editing through the UI
- TMDB metadata for candidates that were never matched (speculative discovery)
- poster/image local caching or CDN proxying beyond URL passthrough

## Stop Conditions

Pause for review if:

- TMDB API shape or rate limits force a breaking change to Phase 09/10 API contracts without a migration story
- SQLite schema choices block TV season/episode modeling without migration churn
- Dashboard image loading (TMDB image base URLs) raises CSP or deployment issues on the NAS
