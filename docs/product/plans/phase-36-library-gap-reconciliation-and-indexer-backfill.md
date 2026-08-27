# Phase 36: Library Gap Reconciliation and Indexer Backfill

**Delivery status:** Draft — product definition only, not yet approved. Requires a planning pass and `grill-me` before acceptance; no `docs/product/delivery/phase-36/` implementation plan until tickets are approved.

Every acquisition path in Pirate Claw today is push-based and present-tense. `src/feed.ts` fetches RSS, `src/pipeline.ts` walks whatever items happen to be in the feed window, matches them against rules, and submits to Transmission. If the daemon is down — or a release simply never appeared in the window — that item is gone. The RSS window holds roughly 50–100 recent items; a multi-day outage is unrecoverable by design.

Phase 36 adds the missing half: the ability to ask _what should I have?_, compare it against _what do I actually have?_, and resolve the difference by querying an indexer for a specific title at a specific quality.

## TL;DR

**Goal:** Let the owner answer "the daemon was down — what did I miss?" and close those gaps with releases matching their configured resolution and codec.

**Ships:**

- A movie calendar (`src/tmdb/calendar.ts` is TV-only today) to establish expected-state for movies
- A gap reconciler performing a three-way diff: expected − (Plex ∪ in-flight candidates)
- A read-only gap report (CLI + web page), safe to run at any time
- A source-agnostic resolver interface: `resolveRelease(identity) → candidate[]`
- YTS resolver for movies, EZTV resolver for episodes
- IMDb identity plumbing (`external_ids` lookup, persisted `imdb_id`)
- An operator-triggered backfill action, dry-run by default
- Downtime-aware reconcile trigger derived from the existing `runs` table

**Defers:** automatic grab without approval, upgrade-in-place, hold-for-better-release, additional indexers, unbounded historical backfill, cross-seed.

---

## Phase Goal

Phase 36 should leave Pirate Claw in a state where:

- The owner can view a gap report listing expected-but-absent episodes and movies, with the reason each one is considered missing
- The report never re-reports items that are already downloading or downloaded-but-not-yet-imported
- The owner can select gaps and trigger a backfill that queues releases obeying the same `resolutions` / `codecs` / `codecPolicy` rules as the feed pipeline
- When an indexer is unreachable, the gap report still works; only the backfill action degrades
- Restarting after an outage surfaces a gap report automatically rather than silently resuming with a hole in the library

## Committed Scope

### Expected-State Ledger

Reconciliation requires a queryable answer to "what should exist." Today that exists only as TV calendar rendering.

- **Movie calendar:** extend `src/tmdb/calendar.ts` beyond `getTvCalendar` / `CalendarTvItem` to cover movie releases for tracked movie rules. This is the movie equivalent of the existing TV calendar and is a prerequisite for the movie gap path.
- **Expected-state persistence:** the calendar is currently a render-time concern. Reconciliation needs it durable and queryable, keyed by identity, so a gap can be recorded, acted on, and not re-reported.

### The Three-Way Diff

The naive formulation — `expected − Plex present` — is incorrect and will cause repeated re-acquisition.

An item can legitimately be aired, absent from Plex, and already in flight: queued in Transmission, downloading, or complete but not yet imported and scanned. `candidate_state` in `src/repository.ts` already tracks exactly this.

The reconciler computes:

```text
gaps = expected − (plex_present ∪ in_flight_candidates)
```

Each gap carries a reason code so the report is explainable rather than a bare list.

### Bounding the Horizon

Without bounds, adding a ten-season show triggers a two-hundred-episode acquisition.

- **Maturity window:** an item is not "missing" until `release_date + maturityHours`. TMDB dates are network-local and routinely off by a day, and a release does not exist the instant something airs.
- **Lookback cap:** reconcile only within `lookbackDays`.
- **Tracked-at-time:** only reconcile items whose rule was already tracked when they released. Newly added titles do not retroactively generate gaps.

### Resolver Interface

A single interface, two implementations, so a third indexer is a small job later.

```text
resolveRelease(identity, policy) → candidate[]
```

- **Identity** is IMDb-keyed. Both EZTV and YTS key on IMDb id; TMDB supplies TMDB ids. This phase adds the `external_ids` lookup and persists `imdb_id` on tracked shows and movies — one prerequisite serving both resolvers.
- **Candidates** carry quality attributes that are either _declared by the source_ or _parsed from the release title_.

This distinction matters:

- **YTS declares them.** Each movie returns a `torrents[]` array with explicit quality, codec, size, and seed fields. Resolution and codec selection becomes a structured field filter.
- **EZTV does not.** It returns release titles plus structured `season` / `episode` fields, so quality attributes still require `src/normalize.ts` to recover them from the title.

`src/normalize.ts` is therefore demoted from universal path to per-source fallback.

### Quality Policy Reuse

`src/match-policy.ts` is already source-agnostic — `matchesAllowedQuality(resolution, codec, resolutions, codecs)` and `scoreQualityPreference(...)` take plain strings and do not care about provenance. Resolver candidates feed into the existing functions unchanged.

Backfill picks obey the same configured `resolutions[]`, `codecs[]`, and `codecPolicy: 'prefer' | 'require'` as feed picks. No parallel scoring path, no second rule system.

One semantic upgrade falls out of this: `codecPolicy: 'require'` becomes genuinely enforceable. Under RSS, "no matching release available" actually means _the feed window did not happen to contain one_ — absence of evidence. A resolver query returns the complete candidate set for that identity, which is evidence of absence.

### Report First, Act Second

Two distinct operations, not one:

1. **Gap report** — read-only, always safe, no indexer required. CLI command plus a web page.
2. **Backfill** — consumes a gap set, dry-run by default, requires explicit operator action.

The report is independently useful and ships before any resolver exists.

### Downtime-Aware Trigger

The `runs` table already records run timestamps. On daemon start, compare the last successful run against now; when the gap exceeds the feed window, a reconcile is warranted and the operator is notified. This does not auto-acquire — it surfaces the report.

### Indexer Operational Contract

Both indexers are unofficial APIs served from migrating mirrors (`yts.gg`, `yts.bz`; `eztv.re`, `eztvx.to`).

- Base URLs are **config, not constants**
- Responses receive the same untrusted-input schema validation already applied in `src/tmdb/schema.ts` and `src/plex/schema.ts`
- Request throttling per resolver, consistent with existing TMDB client throttling
- An unreachable indexer degrades the feature to report-only; it never fails the pipeline sweep
- Endpoint shapes must be verified against live hosts during the spike, not assumed

## Suggested Sequencing

The two media types are asymmetric: TV has the better expected-state ledger (calendar exists) but the worse resolver (title parsing). Movies have the better resolver (declared quality fields) but no ledger.

Movies are the cleaner first slice:

1. Movie calendar / expected-state ledger
2. Gap reconciler + read-only gap report (movies)
3. YTS resolver + backfill action (movies)
4. TV expected-state ledger from the existing calendar
5. EZTV resolver + backfill action (TV)

This proves the resolver interface on the case with declared quality metadata before taking on title parsing.

## Explicit Deferrals

- **Automatic acquisition without approval:** report automatically, grab manually. Auto-grab is an opt-in config flag in a later phase.
- **Upgrade-in-place:** re-querying owned items to replace them with better releases.
- **Hold-for-better-release:** declining today's candidate and re-checking on a schedule. Re-queryable sources make this possible; it is not in this phase.
- **Additional indexers** beyond EZTV and YTS.
- **Unbounded historical backfill:** full-catalog acquisition for newly added titles.
- **Cross-seed and release-group affinity.**
- **Season-pack resolution:** episode-level only.

## Exit Condition

After an outage of arbitrary length, the owner can:

1. Open Pirate Claw and see a gap report identifying expected-but-absent movies and episodes, with a reason for each
2. Confirm the report excludes anything already downloading or awaiting import
3. Trigger a dry-run backfill and review exactly which release would be queued for each gap
4. Execute the backfill and see the queued items obey their configured resolution and codec rules
5. Run the report again and see the closed gaps disappear

## Schema Impact

This phase adds persisted `imdb_id` identity and a gap/expected-state ledger. Both are schema changes and interact with the `schemaVersion` / `PRAGMA user_version` contract defined in Phase 35. If Phase 36 lands after v1.0.0, it requires a version bump under that policy.

## Retrospective

`required` — Phase 36 introduces the first pull-based acquisition path in the product, changes the meaning of a "no match" outcome, and establishes the resolver interface that any future indexer will implement.

## Open Questions

Unresolved; to be settled in the planning pass before decomposition.

- **Release posture:** does this land before or after v1.0.0 (Phase 35)? Pulling it earlier slips the release train; deferring it keeps the sequence intact but ships v1.0.0 with a known unrecoverable-outage hole.
- **Gap ledger lifetime:** are closed gaps retained as history, or deleted once satisfied?
- **Report surface:** a dedicated page, or an addition to the existing calendar views?
- **Manual gap entry:** can the owner add a gap by hand for something the calendar never knew about?

## Rationale

RSS matching and indexer querying answer different questions. RSS answers "is there anything new right now?" — cheap, continuous, and lossy. An indexer query answers "does a release for this specific thing exist at this quality?" — targeted, on-demand, and complete.

Pirate Claw has only ever been able to ask the first question, which makes any daemon downtime permanently lossy and makes `codecPolicy: 'require'` a best-effort promise rather than an enforceable one. Phase 36 adds the second question without disturbing the first: the feed pipeline remains the steady-state path, and reconciliation is the exception path that makes outages recoverable.
