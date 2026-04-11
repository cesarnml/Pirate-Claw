# EE5 Retrospective

_Engineering Epic 05: Orchestrator Context Minimization — single standalone PR #124_

---

## Scope delivered

Single PR on branch `engineering/ee05-orchestrator-context-minimization` covering all five scope items from `docs/03-engineering/epic-05-orchestrator-context-minimization.md`:

1. `verify:quiet` script
2. `modified_sections` handoff field
   3a. Suppress orchestrator poll stdout per check (`formatCurrentTicketStatus`)
   3b. Condense session-side review extract (via `formatCurrentTicketStatus` + triager summaries)
3. Poll timing 6/12 + doc-only skip + no read-ahead directive
4. Session compaction directive at `advance`

---

## What went well

**All five scope items delivered in a single focused session.** No scope drift, no prerequisite gaps, no ambiguous acceptance criteria in practice. The epic document was tight enough that implementation could proceed without planning detours.

**The Phase 14 retrospective was load-bearing.** The token spend breakdown (pain points 1–4) directly drove the implementation priority. Having quantified estimates (~15%, ~20%, ~10%, ~35–40%) gave a clear ranking: compaction directive first in design priority, `modified_sections` second, `formatCurrentTicketStatus` third, `verify:quiet` fourth.

**The `partial_timeout` bug was caught and fixed.** Changing `DEFAULT_REVIEW_POLLING_PROFILE` to `extendByOneInterval: false` exposed a latent design gap: the `pollForAiReview` loop's final-boundary check (`checkMinute === extendedMaxWaitMinutes`) never triggered because `extendedMaxWaitMinutes = 18` but the last check was at `12`. The test suite failed with `clean` instead of `operator_input_needed`, making the bug unambiguous. The fix (`isAtFinalBoundary` using `||` between extended and non-extended cases) is cleaner than the original and more general.

**235 tests, full verify clean on first run after formatting.** TypeScript caught nothing after edits; lint caught one unused import (`computeExtendedReviewPollMaxWaitMinutes` in `notifications.ts` after removing the "one final check" message line). No hidden integration failures.

**Bulk test replacement via `sed` was the right tool.** 35 occurrences of `reviewPollIntervalMinutes: 2` and `reviewPollMaxWaitMinutes: 10` across two test files replaced in a single command. Four separate patterns for sleep millisecond assertions (`[120000, 240000]`, `[120000, 240000, 360000, 480000, 600000, 720000]`, `[120000, 240000, 360000, 480000, 600000]`, `[120000]`) replaced without incident.

**CodeRabbit caught three real issues:**

- `verify-quiet.ts:34` — `result.status ?? 0` silently exits 0 on signal-terminated subprocesses (`null` status). Fixed to `?? 1` with explicit `result.error` surface. This is the class of bug that integration tests won't catch because they don't kill the subprocess.
- `orchestrator.ts` — `docOnly` detection gated on `status !== 'in_review'` at call time. If a PR is initially doc-only but gains code changes, rerunning `open-pr` would not clear the flag. Fixed: always recompute `docOnly` from the current diff on every `open-pr` call.
- `delivery-orchestrator.md` — self-audit section still said `bun run verify` after the Typical Flow section was updated to prescribe `verify:quiet`. Fixed.

All three were genuine issues worth the external review gate.

**`formatCurrentTicketStatus` is structurally better than the quick-fix framing.** The name and shape (header + single ticket block) makes it usable as a future general purpose "show me just this ticket" output, not only for poll-review. It already exports cleanly and could be used in notifications or debugging contexts.

---

## Pain points

**The `notifications.ts` coupling was a surprise cleanup.** `computeExtendedReviewPollMaxWaitMinutes` was imported into `notifications.ts` solely to compute the "one final check at N minutes" message line. When that line was removed (correct: it described behavior that no longer exists), the import became unused and lint failed. This required reading `notifications.ts` to understand the dependency before making the edit. Small but a reminder that helper imports often carry hidden coupling.

**The `formatReviewWindowMessage` "one final check" line required a judgment call.** The function currently doesn't know whether `extendByOneInterval` is true or false — it just uses the state's poll interval and max. The line said "the orchestrator performs one final check at 18 minutes" which was incorrect with the new default. Rather than threading `extendByOneInterval` into the state or the function signature, I removed the line entirely. This is the right call (the extension behavior is disabled), but it's a case where the function's lack of awareness of the polling profile created a messaging inconsistency that only became visible when the default changed.

**Sleep millisecond assertions are brittle by design.** The test suite hardcodes `120000`, `240000`, etc. as exact sleep values. These are correctly derived from the interval in minutes × 60000, but they create a O(n tests) update burden whenever the polling interval changes. A helper constant like `INTERVAL_MS = DEFAULT_REVIEW_POLLING_PROFILE.intervalMinutes * 60_000` used in assertions would survive future interval changes without needing sed. Not worth fixing now, but worth noting.

**The doc-only detection is best-effort with no test coverage.** `isPrDocOnly` calls `gh pr diff --name-only` which requires an actual GitHub remote. It has a `try/catch` that returns `false` on failure, so failures are safe. But there's no unit test for this path — the function is pure platform I/O that can't easily be exercised without a real PR. The existing test structure doesn't mock `gh` commands at this level. Acceptable tradeoff for this scope.

**Stale CR comment created a false `operator_input_needed` outcome.** The doc-consistency finding (CR flagged `delivery-orchestrator.md` self-audit section) was fixed in the patch commit, but CR's original comment thread wasn't marked outdated by GitHub. The second `ai-review` run saw the active thread and classified it as a finding. Required manual triage to confirm "already fixed." This is a fundamental limit of comment-thread staleness — the fetcher has no way to know a thread's content was addressed in a later commit unless GitHub marks it outdated. Expected behavior, but costs a triage step.

---

## Did we deliver on the token minimization premise?

**Immediate measurable wins:**

- `verify:quiet`: each verify pass on a clean repo now emits 0 lines instead of 60–120. For 2 verify passes per ticket × 6 tickets = ~1,000 lines suppressed per phase.
- `formatCurrentTicketStatus` for `poll-review`: at P14.05, each check was dumping 5 prior tickets × 10–15 lines each = 50–75 lines of dead metadata. With 2 checks under the new 6/12 protocol = ~100–150 lines suppressed per ticket. Across a 6-ticket phase, ~600–900 lines.
- `modified_sections`: quantifying this requires knowing how many times the agent reads which files, but the structural improvement is clear — a 650-line `+page.svelte` read 4 times was ~2,600 lines of context. Targeting a 50–100 line scope section keeps that to 200–400 lines.

**The compaction directive is the highest-leverage change, but unmeasurable here.** The directive says "call /compact before reading the next handoff." Whether the agent actually compacts depends on the model and the user's workflow. Option 2 (in-session compact) is the right primitive for solo continuous runs. The improvement is real but deferred to the next multi-ticket phase to observe.

**The 6/12 poll timing saves fewer tokens than it saves time.** As the P14 retro noted, poll wait time is free (LLM idle during subprocess sleep). The token savings from fewer checks come only from reduced subprocess output processing — roughly 2 checks × ~15 lines output each = ~30 lines suppressed per ticket vs. ~6 checks × ~15 lines = ~90 lines. Not the primary motivator, but directionally right.

**Net estimate for a P14-scale 6-ticket phase:** roughly 1,000 (verify) + 800 (poll-review) + 2,000 (modified_sections, optimistically) + unknown (compaction) lines of context reduction. At Phase 14's burn rate (~14% per ticket at steady state), eliminating 3,800+ lines of structural overhead per phase should meaningfully extend the session ceiling. Whether this fits 8 tickets instead of 6 per session, or consistently gets through 6 without hitting 84%, will be visible in Phase 15.

---

## Improvements (follow-up)

**Sleep millisecond test assertions should reference a constant.** Replace `120000` literal values with `DEFAULT_REVIEW_POLLING_PROFILE.intervalMinutes * 60_000` so interval changes don't require sed. Low priority but eliminates future brittleness.

**`formatReviewWindowMessage` should be profile-aware.** The function currently omits the "one final check" line entirely (correct for `extendByOneInterval: false`). If a user ever configures a non-default polling profile with extension enabled, the function wouldn't surface that. Threading the full `ReviewPollingProfile` into the function (or accepting `extendByOneInterval` directly) would keep the message accurate regardless of configuration.

**`isPrDocOnly` edge cases.** The current implementation returns `false` on any error, and `true` only if all files end in `.md`. This handles the common cases (no PR, no network, mixed files). One gap: if `gh pr diff --name-only` returns an empty string (e.g., empty PR), `files.length > 0` gates prevent a false positive. Confirmed correct behavior, but worth documenting explicitly.

**The SonarQube cognitive complexity warnings (orchestrator.ts: 19, ticket-flow.ts: 16) are genuine.** Both are one level above the 15-allowed threshold after EE5 additions. The `runDeliveryOrchestrator` function grew with the doc-only skip path; `buildTicketHandoff` grew with the `modifiedSectionsNote` conditional block. Neither is immediately problematic, but they're candidates for helper extraction in a future engineering epic if the functions continue growing.

**Consider a `bun run verify:quiet` pre-push hook variant.** The current pre-push hook runs `bun run verify`. If that's noisy in a hook context, `verify:quiet` would suppress passing output there too. Not urgent (hooks don't add to session context), but consistent with the principle.

---

_Created: 2026-04-10. PR #124 pending developer review._
