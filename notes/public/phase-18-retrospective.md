## Scope delivered

Phase 18 shipped through PRs [#164](https://github.com/cesarnml/Pirate-Claw/pull/164), [#165](https://github.com/cesarnml/Pirate-Claw/pull/165), and [#166](https://github.com/cesarnml/Pirate-Claw/pull/166) on the stacked `agents/p18-*` branches. Delivered scope: optional `plex` config and secret handling, Plex HTTP client plus SQLite cache tables, daemon background refresh for movies and shows, read-only `plexStatus` / `watchCount` / `lastWatchedAt` fields on `/api/movies` and `/api/shows`, minimal movie/show dashboard affordances, doc updates, and review-driven resilience follow-up for independent movie/show sweep failures.

## What went well

Mirroring the Phase 11 TMDB shape kept the new boundary legible. Reusing the same pattern of optional config, SQLite cache, background refresh, and API-only enrichment meant each ticket stayed small and the call sites were obvious enough that TypeScript surfaced integration misses quickly instead of burying them in runtime behavior. The pirate-claw-first refresh pattern also held up well because the tracked-item set is tiny relative to a real Plex library, so the implementation stayed cheap and easy to reason about without introducing a full-library crawl.

## Pain points

The delivery orchestrator reported generated handoff paths for later tickets, but those handoff files were not actually present under `.agents/delivery/phase-18/handoffs/`. That was avoidable workflow waste because the ticket docs were enough to proceed, but the missing artifact weakened the intended context-reset contract. A second friction point was that Phase 18 added required Plex fields to shared API types in P18.01, which meant later web fixture updates showed up during unrelated ticket verification rather than at the exact change site.

## Surprises

The most useful surprise was external AI review on P18.03 catching a real resilience gap: one movie/show sweep failure could cancel the other, and one show lookup exception could abort the rest of the show pass. That was not explicit in the ticket spec, but it materially affected the daemon's "best-effort optional enrichment" contract, so patching it immediately made the phase outcome stronger. Another surprise was how little extra code the UI needed once the API shape was right; the main complexity stayed in refresh/cache semantics rather than presentation.

## What we'd do differently

We would formalize the shared Plex matching helpers earlier instead of duplicating the movie and show similarity logic in separate modules. The initial choice to keep each vertical slice self-contained was reasonable because it reduced ticket coupling, but by the end of P18.03 the duplicated normalization/scoring code was clearly reusable infrastructure. We would also fix the orchestrator handoff-generation gap before starting another stacked product phase so the workflow contract matches the actual repo behavior.

## Net assessment

Phase 18 achieved its stated goals. Operators can now configure Plex once and see read-only library/watch state in the daemon API and dashboard, while operators without Plex keep the pre-existing behavior and defaults. The implementation stayed inside the intended product boundary: optional external service, cached locally, display-only in v1, and resilient when Plex is unreachable.

## Follow-up

- Fix the missing generated handoff artifacts for later tickets in stacked cook-mode runs before the next multi-ticket product phase.
- Extract shared Plex matching utilities if Phase 18 gets follow-up work or another media-library provider is introduced.
- Revisit cache refresh strategy if tracked items grow enough that per-item searches stop being obviously cheap, or if a future provider lacks a fast title-search path.
- Keep intake gating explicitly deferred until the current display-only Plex signals are exercised by real operators.

_Created: 2026-04-16. PR #166 open._
