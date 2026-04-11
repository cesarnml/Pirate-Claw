# EE5 Effectiveness Evaluation: Phase 15 Execution

_Scope: this conversation's execution of P15.01–P15.06. P15.07 required a separate conversation._

---

## Baseline

Phase 14 (6 tickets) burned ~84% of the 5-hour context limit in a single session. EE5 targeted the four root causes: noisy verify output, full-file re-reads at ticket boundaries, full poll-review state dumps, and no mechanical reset between tickets.

Phase 15 has 7 tickets of higher average complexity (rich UI views with live torrent joins, TMDB enrichment, filter tabs, progress bars, and full test suites) compared to Phase 14's config-write endpoints and form sections.

---

## Headline result

**Same ticket count ceiling, higher complexity per ticket.** Phase 15 got through 6/7 tickets before hitting the session wall — identical count to Phase 14, but with substantially more code-dense tickets. That is a qualified improvement: EE5 appears to have offset the complexity increase, keeping the ceiling stable rather than letting it drop.

Phase 15 also required one context summary (auto-compaction by the system between sessions) mid-run, confirming the ceiling was real. P15.07 (docs + phase exit) was completed in a new conversation.

---

## What worked

### `verify:quiet` — effective

Every verify pass in this run emitted only failures. On the several tickets where all checks passed, the tool output was near-zero. This is a direct, observable reduction: prior phases absorbed 60–120 lines per verify call from passing output. With 2–3 verify passes per ticket × 7 tickets, EE5 likely suppressed 1,000–2,000 lines of passing-output noise.

### `modified_sections` in handoffs — partially effective

The P15.07 handoff had a `Modified Sections` field listing exactly which doc sections and new files to touch. In practice, the P15.xx UI tickets' handoffs specified which files to read/modify. This prevented full re-reads of files like `+page.svelte` from scratch — the agent targeted specific sections. Precise savings are hard to measure, but the field is structurally correct and was being populated.

### `formatCurrentTicketStatus` for poll-review — effective

The `poll-review` output for P15.06 showed only the current ticket's state block, not the full 6-ticket stack. At P14.05, each poll check was emitting 5 prior tickets × 10–15 lines each. This fix was clean and visible.

### 6/12 poll timing — working as designed

The review window correctly launched a 375-second background job (6 minutes) and waited. No read-ahead occurred during the wait. The "Be sabaai sabaai" no-read-ahead directive in the handoff was followed.

### Doc-only PR skip — not triggered in this phase

P15.07 is the docs ticket, but the skip behavior is in `open-pr`, which requires P15.07 to have opened a PR. The doc-only evaluation would have applied there; the earlier conversation ended before P15.07 reached that point.

---

## What didn't work

### Compaction directive not honored — the critical gap

The orchestrator correctly emitted "CONTEXT COMPACTION REQUIRED before starting P15.07" at the `advance` call after P15.06. The model read and acknowledged the directive, then continued: read the P15.07 handoff, checked the docs structure, located API endpoint references. No compaction occurred. The context ceiling was hit while starting P15.07 rather than before it.

This is the central EE5 limitation in practice. The directive is advisory. The model does not stop and compact when instructed — it continues processing because the next handoff path is immediately present and "just a few reads." By the time the compaction opportunity passes, the token spend for P15.07 setup has already occurred.

**Implication**: the compaction directive is a correct design but an incomplete enforcement mechanism. It relies on the model choosing to stop at a moment when continuing feels cheap. In practice, the model does not stop.

### Review artifact condensation — partial/incomplete

The P15.06 review artifact read into session context was still the full verbose `.txt` file — multiple KB of CodeRabbit prose including full suggested diffs, internal state HTML, platform fingerprinting metadata, and the complete SonarQube badge block. The EE5 spec called for a condensed extract (finding titles + severity + file only) to be surfaced to the session, with the full artifact kept on disk.

What landed: `formatCurrentTicketStatus` shows a condensed view of the ticket's review state in poll-review. But the `record-review` triage step still reads and surfaces the full `.txt` artifact. The condensation is at the poll output level, not at the artifact-read level. For a P15.06-scale review with 4 findings from 2 vendors, the full read added several hundred lines of context.

---

## Ticket-by-ticket observations

| Ticket | Review outcome | Notable context driver                                                                                    |
| ------ | -------------- | --------------------------------------------------------------------------------------------------------- |
| P15.01 | clean          | No major re-reads; small endpoint ticket                                                                  |
| P15.02 | clean          | Transmission RPC proxy; moderate size                                                                     |
| P15.03 | patched ×2     | Dashboard rewrite; largest file in phase; multiple fix cycles for `lifecycleStatus`, archive test scoping |
| P15.04 | patched        | Show detail progress; Svelte 5 `fireEvent` quirk; AI review caught live-torrent priority bug              |
| P15.05 | patched        | Movies view; `TmdbMoviePublic` genre discovery deferred; AI review caught inconsistent predicate          |
| P15.06 | patched        | Unmatched view; review caught sr-only label gap; this is where context ceiling hit                        |

**P15.03 was the heaviest ticket.** Multiple fix cycles (lifecycle status type error, archive grid test scoping, stats test ambiguity) each required re-reading dashboard files and re-running verify. That ticket likely consumed a disproportionate share of context. EE5 reduced the noise per cycle, but the fix-cycle count itself is the real driver.

---

## Net assessment

| Mechanism                       | Delivered     | Effective in P15                                              |
| ------------------------------- | ------------- | ------------------------------------------------------------- |
| `verify:quiet`                  | Yes           | Yes — measurable noise reduction                              |
| `modified_sections` in handoffs | Yes           | Partial — structurally correct, hard to measure               |
| `formatCurrentTicketStatus`     | Yes           | Yes — clean poll-review output                                |
| 6/12 timing + no read-ahead     | Yes           | Yes — followed as designed                                    |
| Doc-only PR skip                | Yes           | N/A — docs ticket didn't reach `open-pr` before context wall  |
| Review artifact condensation    | Partial       | Partial — condensed at poll level, not at artifact-read level |
| Compaction directive            | Yes (emitted) | No — not acted upon by model                                  |

**Overall**: EE5 delivered meaningful structural improvements that held the context ceiling at 6 tickets despite higher per-ticket complexity in Phase 15 vs. Phase 14. The ceiling didn't drop — that's the success case. But it also didn't rise. The compaction directive is the unfilled gap: it is the highest-leverage mechanism and the one that failed to execute.

---

## What would actually move the ceiling

**Option A (unchanged from EE5 spec)**: fresh session per ticket. The developer runs `bun run deliver -- start <next>` in a new Claude Code session. Zero carry-forward. This is the correct architecture; EE5 punted on it because it breaks the "cook for an hour unsupervised" run. For a 7-ticket phase, it means 7 session starts. That is a real usability cost.

**Option B (incremental)**: the review artifact condensation gap should be closed. The `record-review` triage step should read a condensed extract (finding title + severity + file + one-line description), not the full `.txt`. The full artifact is already on disk for the developer. For a P15.06-scale review, this alone would have saved several hundred lines of context.

**Option C (model behavior)**: the compaction directive needs to be mechanically enforced, not advisory. One approach: `advance` emits the directive and then emits nothing else — no handoff path, no next ticket metadata. The model cannot start the next ticket until it explicitly calls a "ready to continue" command. This reframes the directive as a gate, not a reminder.

---

_Conversation scope: P15.01–P15.06 (this session). P15.07 completed in a subsequent session._
_Written: 2026-04-12._
