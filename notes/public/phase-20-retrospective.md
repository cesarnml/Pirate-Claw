# Phase 20 Retrospective

_Phase 20: Dashboard Torrent Actions — P20.01–P20.07_

---

## Scope delivered

Phase 20 shipped across stacked PRs [#181](https://github.com/cesarnml/Pirate-Claw/pull/181) through [#187](https://github.com/cesarnml/Pirate-Claw/pull/187) on branches `agents/p20-01-data-model-clean-break` through `agents/p20-07-docs-exit-verification`. Delivered scope: data model clean break (drop `CandidateLifecycleStatus`, add `pirateClawDisposition` terminal field, `torrentDisplayState()` derived function, startup migration, reconciler skip guard); pause/resume torrent RPC endpoints; remove/remove+delete endpoints with disposition writes; dispose endpoint for missing-candidate resolution; right-click context menu UI for torrent row actions; Queue button in FeedEventLogCard for manual candidate requeue; and this exit verification pass.

---

## What went well

**Data model clean break landed atomically.** Dropping `CandidateLifecycleStatus` and replacing it with `torrentDisplayState()` plus a `pirateClawDisposition` terminal field was the right scope boundary. The derived-state approach is simpler than maintaining a second source of truth: there is nothing for the reconciler to drift against. The startup migration ran silently on both fresh and pre-phase DBs.

**Security review caught real auth gaps.** CodeRabbit flagged missing `checkWriteAuth` on all four torrent action endpoints (P20.05) and the dispose endpoint (P20.04). These were genuine holes, not false positives — the endpoints were writing state without verifying the caller. The review cycle paid for itself on this phase.

**Stacked branch discipline held.** Seven tickets, each branching off the previous merge, with no merge conflicts across the full chain. The orchestrator handoff artifacts were present at each ticket boundary, which kept context-reconstruction cost low.

---

## Pain points

**CI stacking friction (avoidable waste).** Each ticket inherited the pre-existing Svelte component test failures from the P19 base branch. CI stayed red throughout the entire stack despite zero test regressions in P20 code. The root cause (Svelte test runner breakage introduced in P19) was out of scope for P20, so the failures persisted as noise across every review cycle. This was avoidable: the failures should have been isolated in a standalone fix ticket before P20 branched.

**Queue button required two passes (expected cost).** The initial implementation fetched `feed_item_outcomes` rows by `status = 'failed'`, but after a successful requeue the `candidate_state.status` changed while the outcome row remained `failed`. The query returned stale rows that no longer represented requeue-eligible candidates. The fix — JOIN `candidate_state` and filter by current status — was correct but required a second pass through the SQL query, the API handler, and the test fixture.

---

## Surprises

**Five endpoints shipped without auth guards.** The torrent action endpoints and dispose endpoint all called `transmissionRpc` or wrote to the DB before reaching `checkWriteAuth`. This was not caught during implementation review because the auth check pattern is applied per-endpoint by convention, not enforced by the type system or a middleware layer. CodeRabbit caught it; it would have been missed otherwise.

**`SkippedOutcomeRecord` naming became immediately stale.** The Queue button feature required widening `listSkippedNoMatchOutcomes` to return both `skipped_no_match` and `failed` outcomes. The function name, the API query parameter (`?status=skipped_no_match`), and the response type are all now misleading because they predate the widened query. The name locked in before the implementation fully clarified what the query needed to return.

---

## What we'd do differently

**Fix pre-existing test failures before stacking a new phase on top of them.** The P19 Svelte test breakage was known at P20 kickoff and flagged as out-of-scope. In retrospect, paying the cost to fix it in a one-commit standalone PR before P20 branched would have been cheaper than carrying red CI across seven tickets. The original reasoning ("not in scope, don't touch it") was correct as a scope judgment but wrong as a sequencing judgment.

**Give `listSkippedNoMatchOutcomes` a wider name earlier.** The function was named for the initial use case (skipped outcomes for the feed log). When the Queue button reused the query, the scope expanded but the name stayed narrow. The right moment to rename was P20.06 when the query changed, not later. Renaming mid-ticket has no blast radius; deferring leaves stale identifiers in the API surface.

---

## Net assessment

Phase 20 achieved its stated goals. A user can now pause, resume, remove, and requeue torrents entirely from the Pirate Claw dashboard without opening the Transmission web UI. Missing torrents can be resolved to a terminal disposition. The data model has a single source of truth for torrent state, and the DB carries no `lifecycle_status` column. The auth gap was caught in review and closed before merge.

---

## Follow-up

- **Fix pre-existing Svelte component test failures** in a standalone ticket before P21 branches. These are inherited from P19 and unrelated to P20 code; they should not be carried forward again.
- **Rename `listSkippedNoMatchOutcomes`** to `listRecentFeedItemOutcomesForReview` (function, API endpoint, query parameter, response type). Small rename with no behavior change; should be a one-commit PR.

---

_Created: 2026-04-19. PR stack #181–#187 open._
