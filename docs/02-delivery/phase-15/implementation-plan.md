# Phase 15 Implementation Plan

Phase 15 adds the visibility layer that makes pirate-claw useful to monitor day-to-day. Phase 13 and 14 unlock config writes; Phase 15 answers "what is it actually doing right now?" by surfacing live Transmission state alongside pirate-claw's own candidate and lifecycle data.

## Epic

- `Phase 15 Rich Visual State and Activity Views`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Product contract

- [`docs/01-product/phase-15-rich-visual-state-and-activity-views.md`](../../01-product/phase-15-rich-visual-state-and-activity-views.md)

## Grill-Me decisions locked for this phase

- **Framework**: SvelteKit 2 + Svelte 5 runes throughout `web/`. Not React+Vite. All web tickets use `+page.server.ts`, `$props()`, `@testing-library/svelte`, and vitest.
- **Transmission torrents scope (Decision B)**: `GET /api/transmission/torrents` returns only pirate-claw-managed torrents — those with a non-null `transmission_torrent_hash` in `candidate_state`. No unrelated Transmission torrents are exposed.
- **Status code mapping**: Transmission integer status → string: `4 → 'downloading'`, `6 → 'seeding'`, `7 → 'error'`, all others → `'stopped'`.
- **NULL feedName/title in outcomes**: `GET /api/outcomes` LEFT JOINs to `feed_items`. When `feed_item_id` is NULL, `feedName` and `title` are returned as `null`. UI renders "—".
- **Separate Transmission types**: New `TorrentStatSnapshot` type (adds `rateDownload`, `eta`) and new `fetchTorrentStats` function in `src/transmission.ts`. Existing `TorrentSnapshot` and `lookupTorrents` are not modified — they serve the reconcile path.
- **"View all" link**: The Overview Active Downloads "View all" links to `/candidates` (existing Candidates route). No new route.
- **Archive Commit grid**: Derived client-side from the full `GET /api/candidates` payload (filter `lifecycleStatus === 'completed'`, sort by `transmissionDoneDate` desc, take 6). No new API endpoint or query params.
- **Transmission session failure**: `GET /api/transmission/session` returns HTTP 502 if Transmission is unreachable. The dashboard `+page.server.ts` catches this and returns `transmissionSession: null`, rendering a graceful "Transmission unavailable" state in the header strip.
- **Fixture snapshots**: `fixtures/api/transmission-torrents.json`, `fixtures/api/transmission-session.json`, and `fixtures/api/outcomes-skipped-no-match.json` must be committed before any UI ticket that reads those endpoints begins implementation.
- **Join key for speed/progress**: `transmissionTorrentHash` is added to `ShowEpisode` and `MovieBreakdown` (both `src/` types and `web/src/lib/types.ts`) and passed through the build functions. Show and movie pages join to `GET /api/transmission/torrents` by hash to surface live `rateDownload` and `eta`.

## Stack

- Bun + TypeScript daemon/API in `src/`
- SvelteKit 2 + Svelte 5 + TypeScript in `web/`
- Existing transmission client in [`src/transmission.ts`](../../../src/transmission.ts)
- Existing API layer in [`src/api.ts`](../../../src/api.ts): `createApiFetch`, `ApiFetchDeps`, `buildShowBreakdowns`, `buildMovieBreakdowns`
- Existing show/movie types in [`src/tv-api-types.ts`](../../../src/tv-api-types.ts) and [`src/movie-api-types.ts`](../../../src/movie-api-types.ts)
- Existing web types in [`web/src/lib/types.ts`](../../../web/src/lib/types.ts)
- Existing `apiFetch` helper in [`web/src/lib/server/api.ts`](../../../web/src/lib/server/api.ts)
- SQLite `feed_item_outcomes` table — LEFT JOINable to `feed_items` via `feed_item_id`

## Ticket Order

1. `P15.01 GET /api/outcomes — Skipped No-Match Outcomes Endpoint`
2. `P15.02 Transmission Proxy Endpoints — GET /api/transmission/torrents and GET /api/transmission/session`
3. `P15.03 Dashboard Overview Enhancement`
4. `P15.04 TV Shows View — Progress and Sort`
5. `P15.05 Movies View — Filter Tabs, Genre Filter, Sort, and Progress`
6. `P15.06 Unmatched Candidates View`
7. `P15.07 Docs and Phase Exit`

## Ticket Files

- `ticket-01-outcomes-endpoint.md`
- `ticket-02-transmission-proxy-endpoints.md`
- `ticket-03-dashboard-overview-enhancement.md`
- `ticket-04-tv-shows-progress-and-sort.md`
- `ticket-05-movies-filter-sort-progress.md`
- `ticket-06-unmatched-candidates-view.md`
- `ticket-07-docs-and-phase-exit.md`

## Exit Condition

An operator can open the dashboard and immediately see what is actively downloading, what completed recently, what was skipped by policy and why, and browse their full TV/movie library with TMDB enrichment — all without touching the terminal. All views refresh on demand via page reload. No real-time push.

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- tests/checks for the current ticket are green
- fixture snapshots for new endpoints are committed before any dependent UI ticket begins
- ticket rationale is updated for any behavior or tradeoff changes discovered during implementation

## Explicit Deferrals

- Server-side filtering query params on `GET /api/candidates` or `GET /api/outcomes` (beyond the single `status=skipped_no_match` in P15)
- Real-time WebSocket or SSE push for live download updates
- Disk/storage usage (no filesystem API available)
- Audio format metadata (Dolby Atmos, channel count, FPS) — not in Transmission RPC or pirate-claw data
- Global throttle controls or seed ratio management (Transmission session writes out of scope)
- `GET /api/candidates?lifecycle=completed&limit=N` query param — archive grid uses client-side filtering
- Transmission offline fallback handling (always-on NAS assumption holds)

## Stop Conditions

Pause for review if:

- the Transmission RPC shape for `torrent-get` (all-torrent variant) differs significantly from what `buildLookupRequestBody` already handles — surface the delta before proceeding
- `transmissionTorrentHash` is null for candidates that are actively downloading (unexpected reconciliation gap) — diagnose before wiring the join
- any UI ticket requires exposing `config.transmission.password` or other credentials through the web layer

## Developer approval gate

**Do not begin implementation** until this implementation plan and all Phase 15 ticket docs are merged to `main` and explicitly approved for delivery.

## Delivery status

Planning/decomposition only. Implementation has not started.
