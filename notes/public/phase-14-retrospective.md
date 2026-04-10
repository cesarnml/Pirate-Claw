# Phase 14 Retrospective

_Phase 14: Feed Setup and Target Management MVP — P14.01–P14.06_

---

## PR stack state at phase close

| Ticket                                      | PR                                                       | CI validate      | SonarCloud       | CodeRabbit | Review outcome |
| ------------------------------------------- | -------------------------------------------------------- | ---------------- | ---------------- | ---------- | -------------- |
| P14.01 TV Defaults + Movie Policy Endpoints | [#117](https://github.com/cesarnml/pirate_claw/pull/117) | fail (inherited) | fail (inherited) | pass       | clean          |
| P14.02 Feeds Write Endpoint                 | [#118](https://github.com/cesarnml/pirate_claw/pull/118) | fail (inherited) | fail (inherited) | —          | clean          |
| P14.03 TV Section UI                        | [#119](https://github.com/cesarnml/pirate_claw/pull/119) | fail (inherited) | pass             | pass       | clean          |
| P14.04 Movies Policy UI                     | [#120](https://github.com/cesarnml/pirate_claw/pull/120) | pass             | pass             | pass       | clean          |
| P14.05 Feeds UI                             | [#121](https://github.com/cesarnml/pirate_claw/pull/121) | pass             | pass             | pass       | patched        |
| P14.06 Docs and Phase Exit                  | [#122](https://github.com/cesarnml/pirate_claw/pull/122) | pass             | pass             | —          | clean          |

"fail (inherited)" = pre-existing test regressions in Phase 13 code, fixed in P14.04, not yet in those early branch heads. The `closeout-stack` squash sequence will land all fixes on `main` in order.

---

## What went well

**The orchestrator held the ticket boundary line.** Six tickets, six worktrees, six stacked PRs — the state machine advanced cleanly through `in_progress → post_verify_self_audit_complete → in_review → done` without manual state repair. One mid-phase `needs_patch` cycle (P14.05) ran through the full record-review/advance loop correctly.

**CodeRabbit caught a real critical bug.** The P14.05 initial implementation serialized existing feeds through per-field hidden inputs (`feedName[]`, `feedUrl[]`, `feedMediaType[]`), silently dropping `pollIntervalMinutes` and `parserHints` on every save. This is the kind of data-loss bug that is easy to write and easy to miss in review — it would only manifest when a user had optional feed fields set, and would manifest silently (the save would succeed with 200 but the optional fields would disappear). Patching to `existingFeedsJson` (full JSON round-trip through a single hidden input) is the correct fix and the AI-review window existed specifically to catch this class of issue.

**The separate-forms pattern scaled to four editable sections.** HTML's no-nested-forms constraint required four sibling `<form>` elements on one page. The ETag chaining (`feedsEtag ?? moviesEtag ?? tvDefaultsEtag ?? etag ?? data.etag`) kept concurrent-save safety intact without adding a global state manager or a shared form. Each section is independently submittable with no coupling except the ETag thread.

**Prettier pre-commit hooks caught formatting before propagation.** Every ticket had at least one `bun run format` pass before the push — formatting issues were caught locally, not in CI. The hook discipline is paying off.

**Pre-existing test regressions were surfaced and fixed in-phase.** Two regressions from Phase 13 code were discovered during Phase 14 delivery: `actions.saveRuntime` (stale action name, renamed to `saveSettings` in P13) and `getByRole('alert')` (shadcn-svelte's Alert 'default' variant renders `role="status"`, not `role="alert"`). Both were fixed at the right ticket boundary (P14.04) rather than deferred, keeping the stack's `main`-bound state clean.

---

## Pain points

**Pre-existing regressions cause red CI on early stack branches.** PRs #117, #118, and #119 show failing CI because they predate the test fixes that landed in P14.04. A developer reviewing the stack sees red checks on the first three PRs. This is structurally correct — the stacked branch heads don't include their descendants' fixes — but visually alarming and easy to misread as "this PR broke something." The actual delivered `main` after `closeout-stack` will be green; the red state is an artifact of per-branch CI isolation.

**The `pollIntervalMinutes`/`parserHints` oversight had a clear root cause: the field listing was not driven by the type.** The initial per-field hidden-input approach required enumerating every field explicitly in the template. When new optional fields were added to `FeedConfig`, the template didn't update automatically. The `existingFeedsJson` pattern fixes this permanently — the full object is serialized, no field enumeration required — but the initial implementation didn't start there.

**Context compaction mid-session.** The session hit context limits between P14.05's initial implementation and the patch cycle. Resuming from a compressed summary worked, but the summary had to carry enough detail (exact file paths, line numbers, both coderabbit findings verbatim) to avoid re-deriving work. The handoff artifact system helped, but session continuity is real friction at this delivery scale.

**`feedsSubmitting` scope was too narrow on first pass.** The initial implementation only disabled the submit button during the in-flight window. Remove buttons and add-feed controls stayed live, which meant a user could change `feedsList` state while the blocking URL validation was running. This is a defensible simplification on first read — the submit button is the "commit" action — but it allows a confusing state where UI feedback says "saving" while controls still respond. The patch added `feedsSubmitting` to all three add-form controls and the remove buttons.

---

## Did we deliver on the son-of-anton promise?

The promise: AI runs long enough to do meaningful end-to-end work; you do not surrender authorship, reviewability, or control.

**The "meaningful end-to-end work" side held.** Phase 14 was six tickets: two backend write endpoints, three UI sections with server actions and reactive state, one doc pass. AI delivered all six end to end — server action, form, state, ETag wiring, error handling, tests — across multiple sessions without the developer needing to write any code. The blocking URL validation spinner, the chip-style multi-select, the separate-forms ETag chain: all of these were specified in the ticket and landed correctly.

**The "authorship, reviewability, control" side held, with one asterisk.** The stacked PR structure is genuinely reviewable — each PR is one ticket, one focused behavior change, with a PR body that links the ticket, records the self-audit, and names the AI review outcome. The developer can read the stack in order and understand what each slice added. CodeRabbit's critical finding was triaged honestly (real bug, patched, recorded), not dismissed or silently fixed before review. The `patched` outcome on P14.05 is visible in the state and in the PR body.

The asterisk: the early-branch CI red state (P14.01–03) is a reviewability tax. A developer scanning the stack sees red on the first three PRs and has to know that stacked PRs inherit base-branch failures to correctly interpret the signal. That context isn't in the PR bodies. A future improvement could add a note to early-stack PR bodies when a known pre-existing regression is present and has since been fixed downstream.

**The control handoff is correctly placed.** The developer decides when to `closeout-stack`. Nothing was merged without that gate. The orchestrator ran the AI-review window and recorded outcomes but did not auto-merge. Phase 15 planning requires a new grill-me pass and developer sign-off before any implementation starts. The workflow enforced this at every boundary.

Verdict: yes, the promise held. The critical data-loss bug was caught by the external AI review gate — not by the developer having to read every line of generated code, and not by a test that the AI happened to write. That's the gate doing its job.

---

## Improvements (follow-up)

**Document the inherited-CI-failure pattern in `closeout-stack` skill and phase guidance.** Early stack PRs will have CI failures when a later ticket fixes a pre-existing regression. The current docs don't explain this to a developer reviewing the PR stack. Add a note: "CI failures on early-stack PRs that post-date their fix in a later ticket are expected; the `closeout-stack` squash sequence will land `main` green."

**Start from `existingFeedsJson` for any section with optional fields.** Per-field hidden inputs require explicit enumeration and will silently drop fields added later. The full-object JSON round-trip pattern is safer by default for any form section where the underlying type has optional fields. Document this in `phase-implementation-guidance.md` as a form serialization principle.

**Surface pre-existing test failures earlier.** A `bun test` dry-run at the start of each ticket's worktree would surface inherited regressions before the first push, giving the implementing ticket the opportunity to fix them in-place rather than deferring to a later ticket. The P14.04 fix was correct but the failures were visible in CI for three PRs before landing.

---

## Token Minimization Learnings

Phase 14 consumed ~84% of the 5-hour context limit in ~72 minutes of wall time — roughly one phase per session at the current rate. At that burn rate the context window is the binding constraint, not the work itself. Three orchestrator-dictated patterns drove the majority of token spend.

**Pain point 1: `bun run verify` output is a token sponge (estimated ~15% of total spend)**

Every ticket ran `bun run verify` at least twice (post-implementation + post-format). The command pipes the full bun install log, every file prettier checks by name, the full svelte-check startup header, and all passing output before the failure line. A single verify invocation produces 60–120 lines of noise for every 1–5 lines of signal. Across six tickets with multiple verify passes each, this added up to hundreds of lines of captured output that carried no implementation information.

Fix: wrap verify calls with noise suppression — `bun run verify 2>&1 | grep -E "(error|warn|\[warn\]|FAIL|✗|exit code)" || true` — or add a `verify:quiet` script alias to `package.json` that only emits failures. The pre-push hook already runs the full suite; the session only needs the signal.

**Pain point 2: Full re-reads of growing aggregate files at every ticket boundary (estimated ~20% of total spend)**

The handoff model requires re-reading "required docs" at each ticket boundary. For Phase 14, that included `+page.svelte` and `+page.server.ts` at the start of each UI ticket. `+page.svelte` grew from ~200 lines (start of phase) to ~650 lines (end of P14.05), and was read in full at least once per ticket — sometimes twice when edits required re-orientation. Reading a 650-line file four times across four tickets is 2,600 lines of context for a file that changes ~100 lines per ticket.

Fix: handoffs should specify _which sections_ are being modified (start/end line ranges or named section anchors) so the implementing ticket reads targeted slices rather than full files. The delivery orchestrator already writes handoff artifacts — adding a `modified_sections` field per-ticket is low-overhead. Alternatively, Grep over the file to find the relevant section, then Read only that offset range.

**Pain point 3: `poll-review` state dumps and review artifact reads (estimated ~10% of total spend)**

The `poll-review` command prints the full orchestrator state (all ticket metadata) on every poll interval — typically 5–6 checks per ticket × all prior ticket state. By P14.05 that was five prior tickets' full metadata block per check. The final review artifact (`.txt`) is also read into context and can be 2–4KB of structured prose including full coderabbit comment text.

Fix: `poll-review` output should emit only the current ticket's state and the poll check result, not the full stack. The review artifact summary piped into the session should be condensed to finding titles + severity + file, not full prose — the full artifact stays on disk for the developer to read; the session only needs to triage it.

**On the advisor tool: use sparingly**

One advisor call in this phase cost ~10 minutes of wall time and substantial context overhead to catch a single-line oversight (roadmap first bullet still saying "01–11" instead of "01–14") that a careful self-read would have caught. For document updates and scoped edits where the change surface is fully visible, advisor adds latency without proportional signal. Reserve it for genuine architectural ambiguity — cases where the implementation approach is in question, not cases where the question is "did I miss a sentence."

The advisor tool's value is front-loaded: it prevents wrong approaches from crystallizing. Its value after implementation is much lower unless the change surface is large enough that self-review misses structural gaps. A rule of thumb: if you can state exactly what each changed line does, you don't need advisor at the end.

**Pain point 4 (structural): ticket boundaries are contractual, not mechanical — the context window isn't actually cleared between tickets (~35–40% of total spend, accumulated)**

This is the biggest one, and it's architectural. The handoff artifact system was designed to make context resets safe: each handoff captures exactly what the next ticket needs (branch, base, carry-forward review notes, stop conditions). The "Context Reset Contract" in every handoff even says explicitly: "Start from the current repository state and this handoff artifact, not from prior chat assumptions." But in practice the session keeps running continuously across ticket boundaries — the context window accumulates every verify output, every file read, every poll-review dump from all prior tickets. By P14.05, the session was carrying the full tool-call history of P14.01 through P14.04 plus half of P14.05.

The handoff artifact makes a hard reset safe. We should use it that way.

**Stance: compact at every `advance` boundary.** The orchestrator's `advance` command should emit an explicit directive to compact conversation history before the next ticket begins. The handoff artifact plus `modified_sections` field (from Pain point 2's fix) gives the resuming context everything it needs: which branch, which files changed in adjacent tickets, what the review carried forward. Nothing else from prior tickets is load-bearing.

Concretely, two implementation paths:

1. **New Claude Code session per ticket.** The orchestrator emits a `bun run deliver ... start <next-ticket>` command that the developer runs in a fresh session. Each session starts cold, reads the handoff, implements one ticket, stops. Zero accumulated carry-forward. This is the cleanest model and the one son-of-anton was originally designed for — "hand off to the orchestrator" was always meant to be a fresh context, not a continuous one.

2. **Explicit `/compact` call at `advance`.** If running in a single session, the agent calls `/compact` (or the equivalent context-compression primitive) immediately after `advance` records the new ticket as `in_progress`, before reading the handoff or any files. The compacted session retains a summary of what happened but drops all raw tool output. Then it reads the handoff fresh.

Option 1 is strictly better for token efficiency. Option 2 is a reasonable fallback for the "keep going in one session" workflow the user prefers.

At Phase 14's burn rate (~14% per ticket at steady state), option 1 would fit the entire six-ticket phase with ~84% headroom per ticket instead of per phase. Option 2 with aggressive compaction might get to ~4–5 tickets per session. Either is a significant improvement over the current "one phase per session" ceiling.

The handoff system was built for this. We should use it as the mechanical reset point, not just the contractual one.
