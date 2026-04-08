# P11.03 TV shows vertical slice: TMDB show/season/episode, enrich GET /api/shows, show UI

## Goal

Enrich TV show candidates with TMDB show and season/episode metadata, serve it through the daemon API, and display it on show detail pages alongside local download state.

## Scope

- **TMDB TV:** Match shows and pull season/episode metadata into the **TV** cache table (per P11.01 schema).
- **API:** Enrich `GET /api/shows` / show breakdown payloads with TMDB fields per product doc (posters, ratings, season/episode detail as committed).
- **Web:** Show detail route: TMDB season/episode metadata **alongside** existing local candidate/download status from Phase 10; reuse poster/rating patterns from P11.02 where practical.

## Out Of Scope

- Movie-specific flows (covered in P11.02)
- Mixed candidates list enrichment (P11.04)
- Background scheduler (P11.05)

## Exit Condition

Show detail pages show TMDB-backed season/episode context when configured; graceful degrade when TMDB is off or fails.

## Rationale

TV is the heavier TMDB shape; it lands after movies so shared UI and cache patterns are already proven while keeping tickets reviewable.

**Implementation notes (P11.03 delivered):**

- Added `src/tmdb/tv-enrichment.ts` with lazy TV show + per-season TMDB fetch, mirroring movie enrichment: negative cache **only** on `searchTv` miss; no negative rows on transient `getTv` / `getTvSeason` failures or cache read errors (cache reads stay inside `try`).
- `GET /api/shows` is async and enriches when TMDB deps are wired (same shared `TmdbCache` + `TmdbHttpClient` as movies via `tmdbShows` in `ApiFetchDeps`).
- Show breakdown types live in `src/tv-api-types.ts` (show + episode TMDB fields) to avoid circular imports with enrichment.
- `src/tmdb/constants.ts`: `stillUrl()` for episode stills (`w300`).
- Dashboard show detail (`web/src/routes/shows/[slug]/+page.svelte`): poster, backdrop tint, rating when vote average exists, season count, overview, table columns for TMDB still + episode title + air date alongside local status.
