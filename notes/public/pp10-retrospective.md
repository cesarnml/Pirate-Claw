# P10 Retrospective

_Phase 10: Read-Only SvelteKit Dashboard — P10.01–P10.05_

---

## Scope delivered

Five stacked PRs (#84–#88) adding a read-only SvelteKit dashboard (`web/`) layered on the existing daemon API. One route per ticket: scaffold, candidates list, show detail, config view, dashboard home.

---

## What went well

- **Thin vertical slices held discipline.** Each ticket delivered exactly one visible route end-to-end. No horizontal sprawl. Every PR diff was scoped only to its ticket, which kept the review surface small.
- **External review caught three real bugs before merge:**
  - P10.03: `decodeURIComponent(params.slug)` called twice. SvelteKit already URL-decodes route params; a second call throws `URIError` for any title containing a literal `%` (e.g. "100%"). A real user-facing break for a real subset of content.
  - P10.04: Transmission password rendered in plaintext in the browser. The API already returns `[redacted]` but the UI had no defense-in-depth.
  - P10.05: `DaemonHealth.lastRunCycle` typed as `string` when the API returns a snapshot object. The template called `formatDate()` on an object, which would have produced `[object Object]` in the browser.
  - None of these are edge cases or style nits — they are functional and security bugs.
- **Pre-push hooks held parity with CI.** Every push from every worktree passed Prettier, `tsc`, ESLint, and cspell locally. No formatting or linting surprises on the remote.
- **Stacked branching kept diffs clean.** Each PR targets its predecessor branch, so the GitHub diff shows only the ticket's changes.

---

## Pain points

- **CI red on every PR throughout the phase.** `bun test` at the repo root discovers `web/src/routes/**/*.test.ts` files, but `@testing-library/svelte` is installed in `web/node_modules`, not root `node_modules`. Result: 5 web test files fail to import, giving `5 fail / 278 pass` on every CI run for every Phase 10 PR. CodeRabbit flagged this on PR #84 and the thread was resolved — but the underlying problem was left to accumulate across all five PRs. Every reviewer on PRs #85–#88 saw a red CI badge.
- **PR bodies #85–#88 were thin after reactive review patches.** PR #84 has a full enumeration of review findings with disposition entries. PRs #85–#88 show a single patch-commit line with no record of what findings existed, which were acted on, and which were dismissed. The gap exists because the orchestrator's PR body update after `record-review patched` appended a commit line rather than re-enumerating findings with dispositions. A developer reviewing the stack has no trail to follow for dismissal decisions.
- **Types scaffolded from prose, not real API responses.** `DaemonHealth.lastRunCycle` being typed as `string` when the API returns an object is a symptom of the broader pattern: SvelteKit types were written from ticket spec descriptions of the API shape, not from an actual API response inspection. Every ticket's `types.ts` additions were educated guesses. They mostly landed, but P10.05's cycle fields were wrong in a way that produced silent rendering garbage.
- **Worktree state drift.** When types from an earlier ticket needed revision in a later worktree, the file had to be rewritten rather than patched because the source of truth had diverged between worktrees. This produced full-file rewrites rather than targeted edits.

---

## Surprises

- **Three functional bugs found by AI review in a five-ticket phase.** The double-`decodeURIComponent`, plaintext password, and wrong `lastRunCycle` type are all subtle enough to pass code review and produce hard-to-reproduce runtime errors. The external review pass is earning its keep.
- **The "reviewed commit ≠ current head" notice in PR bodies is unexplained.** Every PR #85–#88 body included: _"the latest recorded external AI review applies to an older branch head."_ For an informed maintainer this makes sense. For any other reviewer it raises an unanswered question without a resolution sentence. The notice is technically accurate but reads as a warning rather than confirmation.

---

## What we'd do differently

- **Fix CI before the first PR, not after.** Adding a dedicated `validate-web` job to `.github/workflows/ci.yml` that installs `web/` dependencies and runs the web test suite separately is a one-session fix. Letting the red badge accumulate across all five PRs was a visibility tax on reviewers and undermined trust in the CI signal.
- **Anchor types to real API responses.** Include a `fixtures/api/` directory or a JSON comment block in each ticket spec showing the actual response shape. Types then have ground truth rather than derived prose.
- **PR body format should carry full finding disposition on all patches.** After `record-review patched`, the PR body update should enumerate each finding with a disposition entry (fixed or dismissed with reason) regardless of whether review landed before or after `open-pr`. The format should be consistent across the stack.

---

## Net assessment

Phase 10 established the dashboard with strong per-PR reviewability (stacked branching earns that for free). External review caught three real bugs — that is the review gate doing exactly what it is supposed to do. The persistent CI red from P10.01 onward was the main structural cost: avoidable waste that accumulated through five PRs and undermined reviewer confidence in the green state that actually existed locally.

---

## Follow-up

- **Fix CI:** Add `validate-web` job to `.github/workflows/ci.yml`; install `web/` deps and run web test suite as a separate step.
- **PR body finding disposition:** Update orchestrator `update-pr` logic after `record-review patched` to enumerate each finding with disposition rather than a single commit-line summary.
- **Stale-SHA notice resolution sentence:** When PR body is updated after a review patch, add: "Patch commit `<sha>` addresses all findings from the `<review-sha>` review."
- **Don't resolve review threads without a visible disposition reply.** If a finding was dismissed, reply on the thread before resolving it explaining why.

---

_Created: 2026-04-08._
