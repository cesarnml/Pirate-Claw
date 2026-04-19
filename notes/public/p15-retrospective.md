# P15 Retrospective

_Phase 15: Rich Visual State and Activity Views — P15.01–P15.07_

---

## Scope delivered

Seven stacked PRs across two sessions. P15.01–P15.06 completed in one session; P15.07 (docs and phase exit) required a fresh session after the context ceiling was hit.

| Ticket                                      | PR                                                       | Review outcome |
| ------------------------------------------- | -------------------------------------------------------- | -------------- |
| P15.01 GET /api/outcomes Endpoint           | [#125](https://github.com/cesarnml/Pirate-Claw/pull/125) | clean          |
| P15.02 Transmission Proxy Endpoints         | [#126](https://github.com/cesarnml/Pirate-Claw/pull/126) | clean          |
| P15.03 Dashboard Overview Enhancement       | [#127](https://github.com/cesarnml/Pirate-Claw/pull/127) | patched        |
| P15.04 TV Shows View — Progress and Sort    | [#128](https://github.com/cesarnml/Pirate-Claw/pull/128) | patched        |
| P15.05 Movies View — Filter, Sort, Progress | [#129](https://github.com/cesarnml/Pirate-Claw/pull/129) | patched        |
| P15.06 Unmatched Candidates View            | [#130](https://github.com/cesarnml/Pirate-Claw/pull/130) | clean          |
| P15.07 Docs and Phase Exit                  | [#131](https://github.com/cesarnml/Pirate-Claw/pull/131) | clean          |

What shipped: `GET /api/outcomes?status=skipped_no_match`; Transmission RPC proxy endpoints (`/api/transmission/torrents`, `/api/transmission/session`); dashboard active downloads section; TV shows per-episode progress bars and sort; movies filter tabs, sort, and progress; unmatched candidates view with title search.

Explicit deferrals: genre filter on movies view (`TmdbMoviePublic` carries no genres field); server-side filter/pagination on `/api/outcomes`.

---

## What went well

- **Live torrent join strategy held.** Threading `transmissionTorrentHash` through daemon and web types and client-joining against `GET /api/transmission/torrents` kept the API surface clean with no N+1 DB queries.
- **Thin API slices matched the plan.** P15.01–P15.02 established the API surface before UI tickets touched it — no mid-phase API contract changes required.
- **AI review caught three real bugs.** The `isMovieDownloading` predicate divergence (three different expressions for the same condition), the stale lifecycle-status approach for progress-bar gating (live torrent presence is the correct signal), and missing `null` guards in page loaders. All three were genuine pre-merge catches.
- **EE5 mechanisms reduced noise.** `verify:quiet` suppressed passing output on every verify pass. `formatCurrentTicketStatus` kept `poll-review` output to the current ticket only. The 6/12-minute poll timing was followed with no read-ahead during review windows.

---

## Pain points

- **Context ceiling hit before P15.07.** The session wall was hit starting P15.07 after completing P15.06. This is the same 6-ticket ceiling as Phase 14, despite EE5 improvements — EE5 held the ceiling against higher per-ticket complexity but did not raise it.
- **P15.03 had the most fix cycles.** Lifecycle status type error, archive grid test scoping, and stats test ambiguity each required re-reading the dashboard file and re-running verify. A large file with multiple failing tests is the strongest context driver per ticket, and fix-cycle count is the binding variable — not the file read itself.
- **Svelte 5 `fireEvent` quirk required undocumented workaround.** P15.04 tests hit a behavior difference in `@testing-library/svelte` under Svelte 5. Not documented anywhere in the repo; required discovery at implementation time.
- **Compaction directive 0/6 honored.** `advance` emitted "CONTEXT COMPACTION REQUIRED" at every ticket boundary. Zero instances resulted in actual compaction. See `notes/public/p15-ee5-effectiveness-evaluation.md`.

---

## Surprises

- **`isMovieDownloading` predicate factored three times before landing.** Tab count, filter predicate, and row renderer each independently derived the same condition with slight differences — invisible until AI review surfaced the divergence. When the same conditional drives multiple UI points, define it once at the spec level.
- **Live torrent presence vs lifecycle status.** P15.04's initial implementation used episode lifecycle fields to gate the progress bar. The correct signal is whether the torrent hash maps to a live entry in the Transmission response. An episode can have `completed` lifecycle status and still have an active Transmission torrent (re-download scenario) — DB field and live state are orthogonal.
- **Dashboard `null` sentinel gap was predictable.** P15.03 didn't guard against `null` Transmission responses in the page loader. Any ticket introducing a new external service call has this failure mode — it should be in the acceptance criteria, not caught in review.

---

## What we'd do differently

- **EE6 (done):** Split `advance` into two commands and add condensed findings block to `formatCurrentTicketStatus`. Directly addresses the compaction directive failure and the review artifact read cost.
- **Add `null` sentinel requirement to planning template.** Any ticket introducing a new `fetch()` call in a page loader should explicitly include "handle null/error from fetch" in acceptance criteria.
- **Name shared conditionals at spec time.** When a condition drives multiple UI points (tabs, filter, row renderer), name it in the ticket spec. `isMovieDownloading` should have been defined before implementation began.

---

## Net assessment

Phase 15 was the first phase with EE5 active throughout. EE5 held the 6-ticket ceiling against substantially higher per-ticket complexity compared to Phase 14. The ceiling didn't drop — that is the EE5 success case. But it also didn't rise. EE6 followed directly from this result.

---

## Follow-up

- **EE6 (done):** Compaction gate and condensed findings block. See `notes/public/ee6-retrospective.md`.
- **Genre filter on movies view:** Deferred — requires adding genres to `TmdbMoviePublic` during TMDB enrichment. Phase 16+ scope.
- **Server-side filter/pagination on `/api/outcomes`:** Deferred. Current 30-day window is sufficient for the unmatched candidates view.
- **Svelte 5 `fireEvent` workaround:** Document the workaround in a test helper or inline comment so the next ticket doesn't rediscover it.

---

_Created: 2026-04-12._
