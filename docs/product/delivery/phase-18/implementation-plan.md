# Phase 18 Implementation Plan

**Status:** Not started — ticket decomposition approved; ready for orchestrator.

Phase 18 adds an optional read-only Plex Media Server connection, enriching
`/api/shows` and `/api/movies` with library status and watch history. The
integration is structurally identical to Phase 11 (TMDB): optional config block,
local SQLite cache, background-only refresh. When the `plex` block is absent the
daemon behaves exactly as before.

**Product contract:** [`docs/product/plans/phase-18-plex-media-server-enrichment.md`](../../01-product/phase-18-plex-media-server-enrichment.md)

## Epic

- `Phase 18 Plex Media Server Enrichment`

Follow the shared guidance in [`docs/product/delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Decomposition Decisions (grill-me)

| Decision              | Choice                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Template              | Phase 11 shape                                                                                                   |
| Enrichment timing     | Background-only; no lazy path                                                                                    |
| Fuzzy match threshold | Hardcoded internally; not operator-configurable in v1                                                            |
| Refresh strategy      | Pirate-claw-first: iterate tracked items → Plex title search → fuzzy-match small result set → cache only matches |
| Vertical slice order  | Movies first, then TV shows                                                                                      |
| Dashboard             | Per vertical slice — each ticket ships minimal UI for that slice                                                 |
| Scheduler skeleton    | Wired in foundation (P18.01); enrichment logic added per vertical slice                                          |

### Why pirate-claw-first refresh

The live Plex library has ~12 000 shows and ~8 000 movies; pirate-claw tracks a
few dozen matched items. Fetching all 20 000 Plex entries to serve a few dozen
lookups is wasteful. The background refresh instead iterates pirate-claw's
tracked items, fires a per-item Plex title search, fuzzy-matches the small result
set, and writes only matched cache entries. At this scale a few dozen LAN HTTP
calls per interval completes in under a second.

## Stack (high level)

- Plex Media Server local HTTP API (read-only, LAN-only, no Plex.tv cloud)
- SQLite cache tables (`plex_movie_cache`, `plex_tv_cache`)
- Existing daemon HTTP API (`src/api.ts`) and SvelteKit dashboard (`web/`)
- Bun runtime; config via `pirate-claw.config.json` + env

## Ticket Order

1. `P18.01 Foundation: plex config, HTTP client, SQLite cache, scheduler skeleton, graceful no-op`
2. `P18.02 Movies vertical slice: Plex match, cache enrichment, /api/movies fields, movie UI`
3. `P18.03 TV shows vertical slice: Plex match, cache enrichment, /api/shows fields, shows UI`
4. `P18.04 Docs, index updates, exit verification`

## Ticket Files

- `ticket-01-foundation-plex-client-cache.md`
- `ticket-02-movies-vertical-slice.md`
- `ticket-03-tv-shows-vertical-slice.md`
- `ticket-04-docs-exit-verification.md`

## Exit Condition

Matches the product doc:

> An operator with Plex configured sees `plexStatus: "in_library"` and a
> non-null `watchCount` on shows and movies present in their library. An operator
> without Plex configured sees `plexStatus: "unknown"` and `watchCount: null` on
> all items with no errors. The daemon starts, polls, and refreshes Plex data on
> the configured interval without blocking or crashing when Plex is unreachable.

Source: [`docs/product/plans/phase-18-plex-media-server-enrichment.md`](../../01-product/phase-18-plex-media-server-enrichment.md) (Exit Condition section).

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- the previous tests are green
- the behavior change is explained in the ticket `## Rationale` section when the ticket introduces or changes behavior
- the phase-level deferrals remain unchanged

## Explicit Deferrals

These are intentionally out of scope for Phase 18 (see product doc **Explicit Deferrals**):

- intake gating based on Plex state (`skipIfInLibrary` or similar)
- write operations to Plex (marking watched, creating playlists, modifying library state)
- Jellyfin / Emby / Kodi support
- Plex.tv cloud auth (OAuth or managed accounts)
- webhook / push updates from Plex
- per-season or per-episode watch state
- operator-configurable fuzzy match threshold

## Stop Conditions

Pause for review if:

- the Plex local API shape (section listing, per-item search) forces an incompatible change to the `/api/shows` or `/api/movies` contract
- SQLite schema choices for `plex_tv_cache` / `plex_movie_cache` conflict with future per-episode expansion without a migration story
- LAN Plex search latency at the actual library size materially changes the refresh timing model

## Phase Closeout

- **Retrospective:** `required`
- **Why:** Phase 18 introduces a durable optional external-service boundary (Plex) that is structurally new to the system. The matching strategy, cache TTL policy, and "display-only in v1" constraint are decisions future phases will revisit.
- **Trigger:** architecture/process impact + durable-learning risk
- **Artifact:** `notes/public/phase-18-retrospective.md`
- **Scope:** retrospective writing is in scope for P18.04 (docs/exit ticket).
