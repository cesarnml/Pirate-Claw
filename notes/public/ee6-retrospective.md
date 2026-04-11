# EE6 Retrospective

_Engineering Epic 06: Compaction Gate and Findings Surfacing — single standalone PR #132_

---

## Scope delivered

Single PR on branch `engineering/ee06-compaction-gate-and-findings-surfacing` covering both scope items from `docs/03-engineering/epic-06-compaction-gate-and-findings-surfacing.md`:

1. **Compaction gate** — `advance` no longer auto-starts the next ticket. Emits `compaction_required=true` and a human-readable directive. Stops. The model must call `start` (zero-arg) after compacting to initialize the next ticket's worktree, branch, and handoff.
2. **Condensed findings block** — `formatCurrentTicketStatus` now appends a `findings (N):` block when the ticket has actionable `reviewComments` in state. Format: `[vendor] path:line — title`. Outdated and resolved findings suppressed. Model gets what it needs from `poll-review` stdout without reading the full `.txt` artifact.

---

## What went well

**The scope was exactly right.** Two targeted changes, ~300 net code line additions, single PR. The grill-me session resolved the key architecture question (advisory vs. gate) before a line was written. Having the grill-me output as the locked spec meant implementation was transliteration, not design.

**`advance` simplification was cleaner than expected.** Removing `startNext: boolean` from `advanceToNextTicket` and `advanceToNextTicketImpl` eliminated a flag that had no business existing — the "sometimes start, sometimes don't" logic was always an awkward seam. The function is now a pure state transition: find the reviewed ticket, mark it done, return new state. The `start` command is now the single place responsible for worktree initialization, which is the correct ownership boundary.

**`compaction_required=true` as machine-readable signal.** The field was added as a forward-looking hook — parseable by future tooling or CI without scraping prose. It costs nothing now and opens options later (e.g., a wrapper script that enforces the gate before allowing `start`).

**`reviewComments` was already in state.** The findings block required no new state writes, no new disk artifacts, no schema changes. `poll-review` was already persisting `reviewComments` to `state.json`. `formatCurrentTicketStatus` just needed to read what was already there. This is a good sign that the state schema is load-bearing in the right places.

**Bold title extraction works for CodeRabbit.** The `/\*\*([^*]+)\*\*/` regex reliably pulls the first bold phrase from CodeRabbit comment bodies, which is consistently the finding title. In practice on P15.06 review artifacts, every finding had a clean bold title in the first 40 characters of the body. The 120-char truncation fallback is there but wasn't needed.

**AI review caught four real bugs.** Four distinct findings across two commits, all genuine:

- Selector in `formatCurrentTicketStatus` missed `needs_patch` and `operator_input_needed` statuses — the findings block would never render after a `poll-review` triage that moved the ticket to those states, which is exactly the states where you need findings.
- `kind === 'finding'` filter excluded SonarQube comments normalized as `kind: 'unknown'` — SonarQube findings would silently disappear from the condensed block.
- `cli.ts` `getUsage()` still listed `advance [--no-start-next]` after the flag was removed.
- Doc description of the 6-minute fast path said "posted findings" implying it only fires when findings exist, when the correct behavior is "all detected agents finished their run (including agents that report clean)."

None of these would have been caught by the test suite as written. The first two are logic errors in the feature being shipped. The last two are correctness problems in the public interface.

**12 new tests, all passing.** Two describe blocks covering: `advance` no longer starts next ticket, `advance` throws when no reviewed ticket, `formatCurrentTicketStatus` emits findings block, suppresses outdated/resolved, omits block when empty, uses truncation fallback for bold-less body, includes `kind: 'unknown'` (SonarQube), selects `needs_patch` ticket.

**Verification clean on first run after formatting.** No TypeScript errors. Prettier caught formatting on both commit rounds; `bun run format` + `bun run spellcheck` before each commit.

---

## Pain points

**Two Prettier passes required.** EE6 split across two commits (initial implementation + review patch). Each commit required its own `bun run format` pass. Not a real pain point — this is correct behavior for two-commit PRs — but worth noting that the format-before-commit discipline adds a fixed cost per commit regardless of diff size.

**`ReviewOutcome` type doesn't include `needs_patch`.** A test fixture initially included `reviewOutcome: 'needs_patch'` which TypeScript rejected — `ReviewOutcome` is `'clean' | 'patched'`, while `needs_patch` is a ticket `status` value. These two concepts are adjacent enough that the confusion is easy and the error message is not immediately helpful. A comment in the type definition separating "terminal outcomes" from "intermediate states" would have prevented the confusion.

**Pre-existing `review.test.ts` failures required triage time.** Three tests failed with `effectiveMaxWaitMinutes: 10` vs `12` assertions — but these were pre-existing failures on `main` before EE6 branched, not regressions introduced by EE6. Confirmed via `git stash` + re-run. Still required investigation time before the determination could be made. The pre-existing failures are a debt item: they make new regressions harder to distinguish from known breakage.

**The grill-me question about SonarQube (`kind: 'unknown'`) was not asked.** The EE6 spec said `kind === 'finding'` as the filter. CodeRabbit and Greptile use `kind: 'finding'`; SonarQube check annotations are normalized as `kind: 'unknown'` (a distinct normalization because they come from check-run annotations, not native review threads). This mismatch was only surfaced by the AI review — it wouldn't have been caught by any existing test or by a careful re-read of the spec, because the spec was written with the CodeRabbit shape in mind. The fix (`kind !== 'summary'`) is arguably more correct as an intent statement anyway — include everything that isn't an orchestration-noise summary — but it should have been in the original spec.

---

## Surprises

**The selector gap was the most impactful bug.** Finding that `formatCurrentTicketStatus` wouldn't render findings for tickets in `needs_patch` or `operator_input_needed` was the most consequential catch. Those are exactly the states where the model is deciding whether to patch. If the findings block is empty in those states, the model reads the full `.txt` artifact — the exact behavior EE6 was supposed to eliminate. The feature would have been broken for its primary use case on the first real `needs_patch` ticket.

**`kind !== 'summary'` is a better invariant than `kind === 'finding'`.** This came from the SonarQube fix but holds more generally. The current `AiReviewComment` `kind` values are `'finding' | 'summary' | 'unknown'`. Filtering by `kind !== 'summary'` correctly includes findings from any vendor, including future vendors that may normalize to `'unknown'`. The spec had the right intent but the wrong implementation — a reminder that exclusive filters (`!== 'summary'`) are more robust than inclusive filters (`=== 'finding'`) when the value space is expected to grow.

**`--no-start-next` removal was not on the reviewer's radar.** The `getUsage()` stale flag finding came from CodeRabbit, not from a systematic review of CLI-facing surfaces. After removing the flag, the change propagated to `advanceToNextTicket`, `advanceToNextTicketImpl`, the orchestrator `advance` case, and `orchestrator.test.ts` — but `cli.ts` `getUsage()` was the one place the flag appeared as user-visible text and didn't get updated. This is a class of bug that's easy to introduce when a flag is removed: update the logic, forget the help text.

---

## Did EE6 close the gaps?

**Compaction gate: stronger but still advisory.** The two-command split is a real behavioral improvement. The model must now make an explicit `start` call rather than having the next ticket's worktree already initialized. In practice, the model can still call `start` immediately after `advance` without compacting — no enforcement mechanism prevents it. What EE6 provides is a cleaner pause point and a machine-readable signal that could power enforcement later. The hypothesis is that requiring an explicit `start` call creates enough friction that the model is more likely to compact first. This will be tested in Phase 16.

**Findings surfacing: fully closed.** The `reviewComments` in state already had the data; `formatCurrentTicketStatus` now exposes it. The model gets `[vendor] path:line — title` for each actionable finding in `poll-review` stdout. For a P15.06-scale review (4 findings, 2 vendors), this replaces a several-KB `.txt` read with ~6 lines of structured output. This part of EE6 is done.

---

## Improvements (follow-up)

**Enforcement wrapper for the compaction gate.** A thin shell wrapper around `start` that checks for a `compaction_required` flag in state and refuses to proceed (or prompts) until compaction is acknowledged. This would turn the advisory gate into a hard gate. Whether that's worth the complexity depends on how often the model honors the two-command split in Phase 16 execution.

**`ReviewOutcome` type annotation.** Add a comment distinguishing terminal outcomes (`ReviewOutcome`) from intermediate ticket statuses (`needs_patch`, `operator_input_needed`). The confusion is latent whenever someone writes test fixtures.

**Fix pre-existing `review.test.ts` failures.** Three tests have stale `effectiveMaxWaitMinutes: 10` assertions against the `12`-minute default introduced in EE5. These are debt from EE5 delivery. They should be trivial to fix (update the expected values) and would eliminate false-positive failure noise for future PRs.

**Consider `kind: 'check_annotation'` for SonarQube.** The current `'unknown'` normalization for SonarQube check-run annotations is technically correct but semantically weak. A distinct `kind: 'check_annotation'` value would make the data model explicit and allow the findings filter to be written as `kind !== 'summary'` with documented intent rather than `kind !== 'summary'` with implicit tolerance for unknown shapes.

---

_Created: 2026-04-12. PR #132 open, pending developer review._
