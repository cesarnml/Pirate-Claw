# Phase 15: Rich Visual State and Activity Views

**Delivery status:** Not started — product definition only; no `docs/02-delivery/phase-15/` implementation plan until tickets are approved.

Phase 15 adds the visibility layer that makes pirate-claw useful to monitor day-to-day. Phase 13 and 14 unlock config writes; Phase 15 answers "what is it actually doing right now?" by surfacing live Transmission state alongside pirate-claw's own candidate and lifecycle data.

## Phase Goal

Phase 15 should leave Pirate Claw in a state where:

- the dashboard Overview shows active downloads with live progress, speed, and ETA sourced from Transmission RPC
- TV Shows and Movies views show per-item lifecycle status, completion progress, and TMDB metadata where configured
- operators can find specific candidates by title and filter by status — client-side, no new API query params
- unmatched feed items (skipped with no policy match) are surfaced with enough detail to diagnose why something wasn't picked up
- all views refresh on demand; no real-time push or polling loop

## Committed Scope

### Daemon and API

**`GET /api/transmission/torrents`**
- proxies Transmission RPC `torrent-get` for all torrents
- returns a pirate-claw-shaped response — no raw Transmission fields leaked:
  ```
  { torrents: [{ hash, name, status, percentDone, rateDownload, eta }] }
  ```
  - `status`: `'downloading' | 'seeding' | 'stopped' | 'error'`
  - `percentDone`: 0–1
  - `rateDownload`: bytes/second
  - `eta`: seconds (-1 when unknown)
- joined to pirate-claw candidates via `transmissionTorrentId` (already stored in `candidate_state`)
- deployment assumption: Transmission is always reachable on a NAS; no offline fallback handling in v1

**`GET /api/transmission/session`**
- proxies Transmission RPC `session-get` + `session-stats`
- returns: `{ version, downloadSpeed, uploadSpeed, activeTorrentCount }`
- used by the Overview dashboard header strip

**`GET /api/outcomes`**
- returns `feed_item_outcomes` records with `status = skipped_no_match`
- scoped to the last 30 days to avoid unbounded result sets
- response shape: `{ outcomes: [{ title, feedName, runId, status, recordedAt }] }`
- enables the "unmatched candidates" view in the dashboard
- server-side filter param `?status=skipped_no_match` only in Phase 15; additional filters deferred

### Web (`web/`)

**Overview / Dashboard**
- header strip: daemon uptime, last run/reconcile cycle timestamps (from `GET /api/health`), Transmission version + session DL/UL speed + active torrent count (from `GET /api/transmission/session`)
- Active Downloads section: in-progress torrents from `GET /api/transmission/torrents`, joined to pirate-claw candidate for title normalization; each row shows TMDB poster thumbnail (fallback: colored initial box), title, progress bar, rateDownload, eta; max 5 visible with "View all" link
- Event Log: last 10 pirate-claw candidate events from `GET /api/candidates`, status chips color-coded: queued=blue, completed=green, failed=red, skipped_no_match=gray, skipped_duplicate=slate
- Stats row: total tracked, completed this week, failed, skipped (no match) — derived client-side from candidates payload
- Archive Commit grid: 6 most recently completed items with TMDB poster and completedAt date; graceful placeholder when TMDB unconfigured

**TV Shows view**
- show grid cards: TMDB poster (placeholder when unconfigured), show title, network badge (from TMDB `networks`), episode count, completion % (pirate-claw tracked episodes ÷ TMDB `totalEpisodes`; omitted when TMDB unavailable)
- click-to-expand inline drill-down: season accordion from pirate-claw + TMDB data; episode rows with TMDB episode name (fallback: "Episode N"), resolution, codec, status chip, progress bar + rateDownload for active episodes only
- TMDB still image thumbnail per episode when available
- sort by title or progress; client-side only

**Movies view**
- grid cards: TMDB poster, title, year, resolution badge, codec badge, genre (from TMDB), status overlay chip, progress bar + speed when actively downloading
- filter tabs: All / Downloading / Completed / Failed / Missing; client-side
- genre filter dropdown: populated from TMDB data, hidden when TMDB unconfigured
- sort: by date added, title, year, resolution; client-side
- explicit deferral note in UI for server-side filtering

**Unmatched Candidates view** (tab within Candidates or standalone route)
- table: title | feed | recorded at | run id
- sourced from `GET /api/outcomes`
- search bar filters by title client-side
- no action buttons — read-only diagnostic view

## Explicit Deferrals

- server-side filtering query params on `GET /api/candidates` or `GET /api/outcomes`
- real-time WebSocket or SSE push for live download updates
- disk/storage usage (no filesystem API available)
- audio format metadata (Dolby Atmos, channel count, FPS) — not in Transmission RPC or pirate-claw data
- global throttle controls or seed ratio management (Transmission session writes out of scope)

## Exit Condition

An operator can open the dashboard and immediately see what is actively downloading, what completed recently, what was skipped by policy and why, and browse their full TV/movie library with TMDB enrichment — all without touching the terminal.

## Rationale

Phase 14 makes config writable. Phase 15 makes the running system observable. Together they eliminate the two most common reasons to SSH into the NAS: changing what to download and checking whether it's working. Transmission is treated as always-available (Synology NAS, always-on) so no defensive offline fallback is needed in v1.

## Implementation Notes

- fixture snapshots for `GET /api/transmission/torrents`, `GET /api/transmission/session`, and `GET /api/outcomes` must be added to ticket specs before any UI ticket that reads these endpoints
- `transmissionTorrentId` is already stored in `candidate_state` — use this as the join key between pirate-claw candidates and Transmission torrent records
- TMDB enrichment follows the existing lazy-enrich pattern from `GET /api/shows` and `GET /api/movies` — reuse `enrichShowBreakdowns` and `enrichMovieBreakdowns`
