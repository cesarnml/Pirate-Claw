# P11.04 Candidates vertical slice: enrich GET /api/candidates, candidate UI

## Goal

Attach TMDB metadata to the mixed candidates API and surface posters and ratings on candidate list and detail views without duplicating fetch logic—prefer joining or reusing movie/TV cache rows and shared enrichment helpers.

## Scope

- **API:** Extend `GET /api/candidates` (or response shaping in `src/api.ts`) so each candidate includes TMDB metadata when a cache hit exists for its movie or TV identity.
- **Web:** Candidate list and detail views: show poster and rating when available; handle missing metadata consistently with P11.02/P11.03.
- **Implementation note:** Avoid a third independent TMDB fetch path; centralize lookup through cache + shared services established in earlier tickets.

## Out Of Scope

- Background refresh loop (P11.05)
- New TMDB features deferred in the product doc (search-to-add, rating gates, etc.)

## Exit Condition

The operator’s primary queue view benefits from TMDB when configured; when TMDB is not configured or the API fails, the UI still matches Phase 10 behavior.

## Rationale

Candidates are last among the read paths so lazy enrichment reuses movie and TV caches; a dedicated ticket prevents duplicating TMDB calls across three surfaces.

**Implementation notes (P11.04 delivered):**

- `GET /api/candidates` uses `enrichCandidatesFromCache` (`src/tmdb/candidate-cache-enrich.ts`): reads only `TmdbCache` rows keyed with `movieMatchKey` / `tvMatchKey` — no TMDB HTTP. Reuses `movieCacheRowToPublic` and `tvCacheRowToShowMeta` from existing enrichment modules.
- CLI passes `tmdbCache: tmdbMovies?.cache ?? tmdbShows?.cache` so the cache is wired whenever TMDB deps exist.
- Dashboard candidates table: poster column, TMDB rating column, display title prefers cached TMDB name/title when present (list view; TV still links to show detail).
- `onCandidateTmdbCacheError` logs cache read failures without failing the request; tests cover movie + TV cache paths with `try/finally` DB cleanup.
