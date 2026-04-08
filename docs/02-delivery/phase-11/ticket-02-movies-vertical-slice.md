# P11.02 Movies vertical slice: TMDB match, lazy API enrich, minimal movie UI

## Goal

Match movie candidates to TMDB, lazily fetch and cache metadata on API read, expose enriched movie data via the daemon API, and prove the path in the dashboard with posters, ratings, and overview.

## Scope

- **Matching:** Resolve movie candidates to TMDB using normalized title + year (per product doc).
- **Lazy enrichment:** On movie-related API reads (e.g. `GET /api/movies` / movie breakdown builders in `src/api.ts`), read cache; on miss or stale TTL, call TMDB, write positive or **negative** cache rows, return enriched payload or degraded local-only data.
- **API:** Enrich movie responses per product doc (ratings, poster URLs or paths per repo convention, overview).
- **Web:** Minimal SvelteKit UI for movie surfaces: poster, TMDB rating badge, overview where the product doc requires—enough to validate the slice end-to-end.

## Out Of Scope

- TV show TMDB flows (P11.03)
- Full candidates list enrichment (P11.04)
- Background scheduler (P11.05)

## Exit Condition

With TMDB configured, an operator can browse movie-related dashboard views and see poster and rating when TMDB returns data; when TMDB is down or missing, the UI degrades without breaking Phase 10 layouts.

## Rationale

Movies are the first vertical slice after foundation so the simpler TMDB entity (single title+year match) validates client, cache, and UI patterns before TV season/episode complexity.

**Implementation notes (P11.02):**

- `GET /api/movies` uses `buildMovieBreakdowns` then `enrichMovieBreakdowns` when the daemon has resolved TMDB settings (`tmdbMovies` on `ApiFetchDeps`): SQLite cache read, TTL via `isCacheExpired`, TMDB search + movie details on miss, positive/negative cache rows.
- JSON adds optional `tmdb` on each movie row (`posterUrl`, `backdropUrl`, `overview`, `voteAverage`, `voteCount`, `tmdbId`, `title`).
- Dashboard: new `/movies` route listing movie candidates with poster placeholder, rating badge, and overview when present.
- `createApiFetch` returns an async `fetch` handler; callers `await` the handler result.
