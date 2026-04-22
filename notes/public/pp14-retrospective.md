# P14 Retrospective

_Phase 14: Feed Setup and Target Management MVP — P14.01–P14.06_

---

## Scope delivered

Six stacked PRs delivering two backend write endpoints, three UI sections with server actions and reactive state, and one docs exit ticket.

| Ticket                                      | PR                                                       | CI               | Review outcome |
| ------------------------------------------- | -------------------------------------------------------- | ---------------- | -------------- |
| P14.01 TV Defaults + Movie Policy Endpoints | [#117](https://github.com/cesarnml/Pirate-Claw/pull/117) | fail (inherited) | clean          |
| P14.02 Feeds Write Endpoint                 | [#118](https://github.com/cesarnml/Pirate-Claw/pull/118) | fail (inherited) | clean          |
| P14.03 TV Section UI                        | [#119](https://github.com/cesarnml/Pirate-Claw/pull/119) | fail (inherited) | clean          |
| P14.04 Movies Policy UI                     | [#120](https://github.com/cesarnml/Pirate-Claw/pull/120) | pass             | clean          |
| P14.05 Feeds UI                             | [#121](https://github.com/cesarnml/Pirate-Claw/pull/121) | pass             | patched        |
| P14.06 Docs and Phase Exit                  | [#122](https://github.com/cesarnml/Pirate-Claw/pull/122) | pass             | clean          |

"fail (inherited)" = pre-existing test regressions from Phase 13 code, fixed in P14.04. The `closeout-stack` squash sequence lands all fixes on `main` in order.

---

## What went well

- **The orchestrator held the ticket boundary line.** Six tickets, six worktrees, six stacked PRs — the state machine advanced cleanly through `in_progress → post_verify_self_audit_complete → in_review → done` without manual state repair. One `needs_patch` cycle (P14.05) ran through the full record-review/advance loop correctly.
- **CodeRabbit caught a real critical data-loss bug.** P14.05's initial implementation serialized existing feeds through per-field hidden inputs (`feedName[]`, `feedUrl[]`, `feedMediaType[]`), silently dropping `pollIntervalMinutes` and `parserHints` on every save. This would only manifest when a user had optional feed fields set, and would manifest silently — the save would return 200 but optional fields would disappear. Patching to `existingFeedsJson` (full JSON round-trip through a single hidden input) is the correct fix, and the AI-review window existed specifically to catch this class of issue.
- **The separate-forms pattern scaled.** HTML's no-nested-forms constraint required four sibling `<form>` elements on one page. ETag chaining (`feedsEtag ?? moviesEtag ?? tvDefaultsEtag ?? etag ?? data.etag`) kept concurrent-save safety intact without a global state manager. Each section is independently submittable.
- **Pre-existing test regressions surfaced and fixed in-phase.** Two regressions from Phase 13 (`saveRuntime` renamed to `saveSettings`; Alert `role="status"` vs `role="alert"`) were discovered during P14.04 and fixed at the right ticket boundary rather than deferred.
- **Prettier pre-commit hooks caught formatting before propagation.** Every ticket had at least one `bun run format` pass — no formatting surprises in CI.

---

## Pain points

- **Pre-existing regressions cause red CI on early stack branches.** PRs #117–#119 show failing CI because they predate the P14.04 fixes. Structurally correct for stacked PRs, but visually alarming and easy to misread. The context isn't in the PR bodies.
- **Per-field hidden-input approach doesn't survive optional field additions.** The initial feed serialization enumerated every field explicitly in the template. When optional fields exist on the underlying type, any field not explicitly enumerated gets silently dropped on save. The `existingFeedsJson` pattern fixes this permanently but should have been the starting point.
- **Context compaction mid-session.** The session hit context limits between P14.05 implementation and the patch cycle. Resuming from a compressed summary worked, but required the summary to carry exact file paths, line numbers, and coderabbit findings verbatim to avoid re-deriving work. The handoff artifact helped but session continuity is real friction at this delivery scale.
- **`feedsSubmitting` scope too narrow on first pass.** Initial implementation only disabled the submit button during in-flight validation. Remove buttons and add-feed controls stayed live, allowing the user to change `feedsList` state while blocking URL validation ran. The patch added `feedsSubmitting` to all controls — correct but reactive.
- **Token spend: `bun run verify` output is a sponge.** Every ticket ran `bun run verify` at least twice. The command emits the full bun install log, every file Prettier checks by name, the svelte-check startup header, and all passing output before any failure line. A single verify invocation produces 60–120 lines of noise for every 1–5 lines of signal. Across six tickets with multiple verify passes each: hundreds of lines of captured output with no implementation information.
- **Token spend: Full re-reads of growing aggregate files.** `+page.svelte` grew from ~200 lines (start of phase) to ~650 lines (end of P14.05), and was read in full at least once per ticket — sometimes twice when edits required re-orientation. Reading a 650-line file four times across four tickets is 2,600 lines of context for a file that changes ~100 lines per ticket.
- **Token spend: `poll-review` full-stack state dumps.** `poll-review` printed full orchestrator state (all ticket metadata) on every poll interval — typically 5–6 checks per ticket × all prior ticket state. By P14.05 that was five prior tickets' full metadata block per check. The review artifact (`.txt`) added 2–4KB of structured prose per review.
- **Token spend: ticket context accumulates across boundaries.** The session kept running continuously across ticket boundaries. The context window accumulated every verify output, every file read, every poll-review dump from all prior tickets. By P14.05, the session was carrying full tool-call history from P14.01 through P14.04. The compaction directive at `advance` was the correct design but was not honored in practice.

---

## Surprises

- **The per-field hidden-input failure mode is invisible until optional fields are added.** The initial feed form serialization looked correct for the fields that existed at the time. The bug only became real when `pollIntervalMinutes` and `parserHints` existed on `FeedConfig` but weren't enumerated in the template. AI review caught this — a human reviewer reading the template would see the fields that were there, not the fields that were absent.
- **Phase 14 consumed ~84% of the 5-hour context limit in one session.** At that burn rate, context is the binding constraint, not the work itself. This drove EE5 directly.

---

## What we'd do differently

- **`existingFeedsJson` as the default for form sections with optional fields.** Per-field hidden inputs require explicit enumeration and silently drop fields added later. Full-object JSON round-trip is safer by default for any form section where the type has optional fields. Make this a standing form serialization principle.
- **`verify:quiet` instead of `verify`.** Suppress passing output; show only failures. EE5 added this as `bun run verify:quiet`. At 2 verify passes per ticket × 6 tickets, EE5 estimates ~1,000 lines suppressed per phase.
- **`modified_sections` in handoffs.** Handoffs should specify which sections are being modified so the implementing ticket reads targeted slices rather than full files. The full `+page.svelte` read-per-ticket pattern is avoidable with section-level targeting.
- **Compact at every `advance` boundary.** The handoff artifact plus `modified_sections` gives the resuming context everything it needs. Nothing else from prior tickets is load-bearing. The orchestrator should emit an explicit directive to compact before the next ticket begins — and that directive should be a gate, not advisory. EE5/EE6 addressed this.
- **Extend poll intervals from 2-minute to 6/12-minute.** The current 2-minute cadence does 5 checks in 10 minutes, most returning "no review yet" — output that gets captured and adds noise. Four clean signal points (3, 6, 9, 12 minutes) instead of five noisy ones. EE5 changed the default to 6/12.
- **Don't use the advisor tool for scoped doc edits.** One advisor call in this phase cost ~10 minutes of wall time to catch a single-line oversight (roadmap first bullet stale). For document updates where the change surface is fully visible, advisor adds latency without proportional signal. Reserve it for genuine architectural ambiguity.

---

## Net assessment

The son-of-anton promise held: AI delivered all six tickets end-to-end — server action, form, state, ETag wiring, error handling, tests — without the developer writing code. The critical data-loss bug was caught by the external AI review gate before merge, not by the developer reading every generated line. The stacked PR structure was genuinely reviewable — each PR was one ticket, one focused behavior change, with auditable review outcomes. The developer control handoff (closeout gate) was correctly placed; nothing merged without it.

The binding constraint was context accumulation, not work quality. Phase 14 established the token spend analysis that drove EE5.

---

## Follow-up

- **EE5 (done):** `verify:quiet`, `modified_sections`, condensed `poll-review` output, 6/12 poll intervals, compaction directive at `advance`, doc-only skip. See `notes/public/ee5-retrospective.md`.
- **EE6 (done):** Compaction gate split and findings surfacing. See `notes/public/ee6-retrospective.md`.
- **Inherited-CI-failure pattern:** Document in `closeout-stack` skill and phase guidance: "CI failures on early-stack PRs that post-date their fix in a later ticket are expected; `closeout-stack` squash sequence lands `main` green."
- **Surface pre-existing test failures earlier.** A `bun test` dry-run at the start of each ticket's worktree surfaces inherited regressions before the first push.

---

_Created: 2026-04-08._
