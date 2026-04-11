# Phase 15 Retrospective

_Phase 15: Rich Visual State and Activity Views — P15.01–P15.07_

---

## PR stack state at phase close

| Ticket                                      | PR                                                       | Review outcome |
| ------------------------------------------- | -------------------------------------------------------- | -------------- |
| P15.01 GET /api/outcomes Endpoint           | [#125](https://github.com/cesarnml/pirate_claw/pull/125) | clean          |
| P15.02 Transmission Proxy Endpoints         | [#126](https://github.com/cesarnml/pirate_claw/pull/126) | clean          |
| P15.03 Dashboard Overview Enhancement       | [#127](https://github.com/cesarnml/pirate_claw/pull/127) | patched        |
| P15.04 TV Shows View — Progress and Sort    | [#128](https://github.com/cesarnml/pirate_claw/pull/128) | patched        |
| P15.05 Movies View — Filter, Sort, Progress | [#129](https://github.com/cesarnml/pirate_claw/pull/129) | patched        |
| P15.06 Unmatched Candidates View            | [#130](https://github.com/cesarnml/pirate_claw/pull/130) | clean          |
| P15.07 Docs and Phase Exit                  | _this ticket_                                            | —              |

---

## What shipped

- **`GET /api/outcomes?status=skipped_no_match`** — exposes the `feed_item_outcomes` table that has existed since early phases but had no API surface. LEFT JOINs to `feed_items` for `feedName`/`title`; NULL fields render as "—" in the UI.
- **`GET /api/transmission/torrents`** — proxies Transmission RPC `torrent-get` for pirate-claw-managed torrents only (those with a non-null `transmission_torrent_hash`). Returns `TorrentStatSnapshot[]` with `rateDownload` and `eta`.
- **`GET /api/transmission/session`** — proxies Transmission RPC `session-get`. Returns 502 if Transmission is unreachable; dashboard handles `null` gracefully.
- **Dashboard overview enhancement** — active downloads section with speed/ETA sourced from live Transmission data; archive commit grid derived client-side from the candidates payload (filter `lifecycleStatus === 'completed'`, sort by `transmissionDoneDate` desc, last 6).
- **TV Shows view enhancements** — `transmissionTorrentHash` threaded from `candidate_state` through `ShowEpisode`; per-episode progress bar and download speed/ETA when a live torrent is present; client-side sort (A–Z, Z–A, active first).
- **Movies view enhancements** — filter tabs (All / Downloading / Completed / Not Downloaded), client-side sort (A–Z, Z–A, newest first), per-movie progress bar and speed/ETA when live torrent present. Genre filter deferred — `TmdbMoviePublic` has no genres field.
- **Unmatched Candidates view** — `/candidates/unmatched` route backed by `GET /api/outcomes`, client-side title search, 30-day data window, "Unmatched" nav link in header.

---

## Explicit deferrals encountered during implementation

- **Genre filter on movies view** — plan listed genre filter as a feature. During P15.05 it was confirmed that `TmdbMoviePublic` carries no genres field (TMDB movie data is enriched but genres are not stored). Deferred cleanly with no ticket change needed.
- **Server-side filter params on `/api/outcomes`** — only `status=skipped_no_match` implemented per plan. Full filter/pagination deferred.

---

## Tradeoffs and surprises worth recording

**Live torrent join strategy was correct.** Threading `transmissionTorrentHash` through `ShowEpisode` and `MovieBreakdown` (daemon types + web types) and doing a client-side join against `GET /api/transmission/torrents` kept the API surface clean. No new query complexity, no N+1 DB queries.

**`isMovieDownloading` predicate factored three times before landing.** P15.05 initially diverged on whether a movie was "downloading" — the tab count, the filter predicate, and the row renderer each used slightly different expressions. CodeRabbit caught the divergence; the patch unified them into a single `isMovieDownloading(movie, torrentMap)` predicate. The lesson: when the same conditional drives multiple UI points, define it once.

**Live torrent presence should drive `hasProgress`/`active` state, not episode lifecycle status.** P15.04's initial implementation used episode lifecycle fields to decide whether to show a progress bar. CodeRabbit flagged this as stale for actively-downloading episodes. The correct signal is whether the torrent hash maps to a live torrent in the `GET /api/transmission/torrents` response — a live presence check, not a DB field check.

**Dashboard `null` sentinel discipline.** P15.03's initial implementation didn't handle the case where the Transmission fetch or candidates fetch failed during `+page.server.ts` load. CodeRabbit flagged missing null guards. The patch added explicit `null` sentinels for failed fetches and graceful "unavailable" states in the UI. This is a recurring pattern: page loaders must be resilient to partial API failures.

**Transmission always-on assumption held for P15.** The plan documented this as a happy-path assumption. All tests were written against fixture data, not a live Transmission instance. The assumption held — no NAS reachability issues were encountered during implementation.
