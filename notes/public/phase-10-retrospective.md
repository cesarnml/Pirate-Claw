# Phase 10 Retrospective

_Date: 2026-04-08. Written after all 5 tickets reached `done`._

Phase 10 added a read-only SvelteKit dashboard (`web/`) layered on top of the existing pirate-claw daemon API. Five stacked PRs: #84 (scaffold), #85 (candidates list), #86 (show detail), #87 (config view), #88 (dashboard home).

---

## What Went Well

**Thin vertical slices held discipline.** Each ticket delivered exactly one visible route end-to-end — no horizontal sprawl. The stacked PR structure meant every diff was scoped only to its ticket, which kept review surface small and made the `base → head` diff on each PR easy to reason about.

**External review caught real bugs.** This is the headline result for all the review tooling investment:

- P10.03: `decodeURIComponent(params.slug)` was called twice. SvelteKit already URL-decodes route params, so a second call throws `URIError` for any title containing a literal `%` (e.g. "100%"). This would have silently broken the show detail page for a real subset of content. Caught before merge.
- P10.04: Transmission password was rendered in the browser as plaintext. The API already returns `[redacted]`, but the UI had no defense-in-depth. A UI-level mask was the right move regardless.
- P10.05: `DaemonHealth.lastRunCycle` was typed as `string` but the `/api/health` response returns a snapshot object. The template was calling `formatDate()` on a whole object, which would have produced `[object Object]` in the browser. Also caught before merge.

These are not edge cases or style nits — they are functional and security bugs that would have shipped without the review pass.

**Pre-push hooks held parity with CI for everything in scope.** Every push from every worktree passed prettier, tsc, eslint, and cspell locally. No formatting or linting surprises on the remote.

**Stacked branching kept diffs clean.** Each PR targets its predecessor branch, so the GitHub diff shows only the ticket's changes. A reviewer on PR #87 (config view) only sees `web/src/routes/config/` plus the type additions — not the entire dashboard codebase.

---

## Pain Points

### 1. CI is failing on every PR, and it was known on day one

**Root cause:** `bun test` at the repo root discovers `web/src/routes/**/*.test.ts` files (because Bun's test discovery is recursive), but `@testing-library/svelte` is installed in `web/node_modules`, not in the root `node_modules`. Result: 5 web test files fail to import, giving `5 fail / 278 pass` on every single CI run for every Phase 10 PR.

CodeRabbit flagged this on PR #84. The thread was marked resolved. But the underlying problem — CI never installs `web/` dependencies and never invokes the web test runner — is still present on every downstream PR. Every reviewer arriving at PR #85 through #88 sees a red CI badge. That is noise that undermines confidence in the green state that actually exists locally.

**Why it wasn't fixed:** The fix requires a one-line CI change (`bun --cwd web install && bun --cwd web run test` as a separate step) plus some consideration of whether `bun test` at the root should continue to discover `web/` files. This was correctly identified as a scope change from the scaffold ticket. But it should have been immediately filed as a follow-up — ideally as a fixup commit on P10.01 or a tiny standalone PR — rather than left to accumulate across all five PRs.

### 2. PR bodies #85–#88 are thin for a reviewer

PR #84 has a full `Resolved Review Findings` list: per-finding summaries, resolution status (fixed vs. dismissed), and links to each review thread. A reviewer can read it and know exactly what the bots found and what was done.

PRs #85–#88 have a single line under `Actions Taken`, e.g.:

> `6d88b81ab5dd` [coderabbit,greptile] fix: accessible sort headers, status badge colors, remove unused import [P10.02]

That tells a reviewer _something_ was patched but not what the original findings were, which ones were acted on, and which were dismissed and why. If a reviewer disagrees with a dismissal, they have no trail to follow.

This is a gap in the orchestrator's `update-pr` logic: it appends the patch commit line but does not re-enumerate the findings with disposition entries when a second `open-pr` or `update-pr` is called after patching. PR #84 was populated differently because the review cycle landed before the first `open-pr` call, so all findings were included in the initial body. PRs #85–#88 were opened before review findings landed, so the body was updated reactively — and the update format is lossy compared to the initial format.

### 3. "Reviewed commit ≠ current head" notice is unexplained

Every PR #85–#88 body includes:

> _the latest recorded external AI review applies to an older branch head; the prior review history is shown below for debugging._

For an informed maintainer this makes sense. For any other reviewer it raises an unanswered question: does the review still apply? The PR body doesn't say "the patch commit addressed all flagged findings" or "these findings are now outdated." The notice is technically accurate and useful for debugging, but it reads as a warning without resolution.

### 4. Types scaffolded ahead of the actual API

`DaemonHealth.lastRunCycle` being typed as `string` when the API returns an object is a symptom of a broader pattern: the SvelteKit types were written from ticket spec descriptions of the API shape, not from an actual API response inspection. Every ticket's `types.ts` additions were educated guesses about the wire format. They mostly landed, but P10.05's cycle fields were wrong in a way that would have produced silent rendering garbage.

The right fix is to have a `GET /api/health` response snapshot committed alongside the ticket spec, so types can be verified against a real example rather than derived from prose.

### 5. Worktree state drift between tickets

Each ticket lives in a separate worktree (`pirate_claw_p10_0N`). When types from an earlier ticket needed revision (e.g., `types.ts` in the P10.05 worktree had a truncated scaffold from a prior pass), the file had to be rewritten rather than patched, because the source of truth had diverged between worktrees. This produced a `cat >` full-rewrite rather than a targeted edit — more error-prone, harder to review.

The scaffold-and-carry-forward pattern works well when base branches are clean and worktrees start from the immediately prior ticket's branch. It breaks down when a worktree is initialized from a stale or incomplete scaffold.

---

## PR Reviewer Experience Assessment

| PR  | Title diff clarity              | Body completeness               | CI signal       | Stale-SHA notice handled    |
| --- | ------------------------------- | ------------------------------- | --------------- | --------------------------- |
| #84 | Good — root config changes only | Good — full finding enumeration | Red (web tests) | N/A (review SHA = head SHA) |
| #85 | Good — candidates route only    | Thin — one-line patch note      | Red             | No                          |
| #86 | Good — shows/[slug] only        | Thin — one-line patch note      | Red             | No                          |
| #87 | Good — config route only        | Thin — one-line patch note      | Red             | No                          |
| #88 | Good — root page only           | Thin — one-line patch note      | Red             | No                          |

Every PR scores well on diff clarity (the stacked base structure earns that for free) and poorly on body completeness from #85 onward. The CI red is persistent, structural, and unresolved.

A reviewer who has not read this document would reasonably conclude from the PR list:

- All CI is failing (actually: only the web suite; the daemon suite is green)
- Reviews were applied but it's unclear what was dismissed and why (actually: only clear on #84)
- Something about "older branch head" that's never explained

---

## Improvements to Consider

**Fix CI before phase 11.** Add a dedicated `validate-web` job or step to `.github/workflows/ci.yml` that installs `web/` dependencies and runs the web test suite separately. Update the root `bun test` invocation to exclude `web/**` from discovery, or leave it and let Bun skip the directory if `node_modules` is absent. Either way, the web tests need their own install step. This is a one-session fix.

**PR body format should carry full finding disposition on all patches.** The orchestrator's `update-pr` logic after a `record-review patched` should include:

- each finding that was acted on, with a one-line summary of the fix
- each finding that was dismissed, with a one-line reason
- the same format regardless of whether the review landed before or after the PR was opened

**Don't resolve review threads without a visible disposition.** Resolving a GitHub thread collapses it from the diff view. A reviewer arriving later can't see it without clicking "Show resolved." If the finding was dismissed (not fixed), there should be a reply on the thread before resolving it explaining why. If it was fixed, the thread should reference the fix commit SHA.

**Anchor types to real API responses, not specs.** For any phase that adds new API-backed UI, include a `fixtures/api/` directory or at minimum a JSON comment block in the ticket showing the actual response shape. Types then have a ground truth to validate against.

**Stale-SHA notice needs a resolution sentence.** When the PR body is updated after a review patch, add: "Patch commit `<sha>` addresses all findings from the `<review-sha>` review." That turns the stale-SHA notice from an alarm into confirmation.
