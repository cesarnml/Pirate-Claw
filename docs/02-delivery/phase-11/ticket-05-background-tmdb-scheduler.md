# P11.05 Background TMDB enrichment scheduler

## Goal

Run TMDB metadata refresh on a **daemon background schedule** (not inline with RSS polling), respecting cache TTLs and negative-cache rules, backfilling or refreshing stale rows that lazy API reads may not have touched recently.

## Scope

- Scheduled pass in the daemon lifecycle: iterate eligible candidates or cache rows, refresh when stale, respect rate limits and errors.
- **No** blocking of RSS or pipeline cycles on TMDB latency; log warnings on TMDB downtime.
- Align behavior with product doc: enrichment is not inline during RSS polling.

## Out Of Scope

- Changing intake or matching pipeline semantics
- New API routes (read paths already exist from P11.02–P11.04)

## Exit Condition

With TMDB configured, metadata stays fresh within TTL without requiring every entity to be viewed in the UI; failures degrade quietly.

## Rationale

Lazy API reads ship value first; this ticket adds operational completeness after all read paths exist, matching the grill-me ordering (scheduler after candidates slice).

**Implementation notes (P11.05 delivered):**

- `runtime.tmdbRefreshIntervalMinutes` (default 360; set `0` to disable) drives a `setInterval` in `runDaemonLoop` that is **not** gated by the RSS `busy` lock.
- `runTmdbBackgroundRefresh` (`src/tmdb/background-refresh.ts`) reuses `buildMovieBreakdowns` / `buildShowBreakdowns` plus `enrichMovieBreakdowns` / `enrichShowBreakdowns` — same cache/TTL behavior as API reads, no duplicate TMDB client logic.
- TMDB refresh is only scheduled when `tmdbMovieEnrichDeps` / `tmdbShowsEnrichDeps` resolve (TMDB API key configured).
