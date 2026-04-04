name: ai-code-review
description: Detect and triage AI-generated pull request review comments for the delivery orchestrator flow. Use when `poll-review` finds AI review feedback or when you need to inspect recent AI review comments on the current PR.

---

# AI Code Review

This is a repo-local delivery skill. It is intended to travel with the orchestrator workflow as that workflow becomes template-ready.

## Boundary

The orchestrator owns:

- polling cadence and stop conditions
- delivery state transitions
- artifact persistence under `.codex/delivery/.../reviews/`
- auto-recording `clean` when no AI review is detected by the final check

This skill owns:

- fetching review data with `gh`
- deciding whether fetched comments count as AI review
- normalizing detected comments into structured and rendered review artifacts
- triage judgment after comments are detected

The only contract between them is the repo-local helper script output:

- fetcher:
  - `detected: true|false`
  - `artifact_text: "<normalized text summary>"`
  - `vendors: ["coderabbit", "qodo", ...]`
  - `comments: [...]`
- triager:
  - `outcome: "clean" | "needs_patch" | "patched"`
  - `note: "<concise final note>"`
  - `action_summary?: "<what was acted on>"`
  - `non_action_summary?: "<what was ignored and why>"`
  - `vendors: [...]`

Use this skill when the orchestrator has saved an AI review artifact or when you need to inspect recent AI review comments on a PR in this repo.

## Workflow

1. Resolve the PR number with `gh pr view` if the user did not provide one.
2. Fetch review data with the repo-local helper script:
   - `.agents/skills/ai-code-review/scripts/fetch_ai_pr_comments.sh <pr-number>`
3. If the orchestrator already saved `review.json`, use that structured artifact as the source of truth for vendor attribution and comment shape.
4. Apply the detection policy in the helper script:
   - comments from bot or vendor identities that correspond to AI review
   - comments whose wording explicitly identifies them as AI-generated code review
   - ordinary human drive-by comments do not count as AI review
   - preserve inline comment resolution/outdated state so stale bot comments do not block the flow by default
5. Return the fetcher contract to the orchestrator when this is being used inside `poll-review`:
   - `detected=false` means keep polling or auto-clean at the end
   - `detected=true` means save the artifacts and hand off to judgment
6. Triage each detected AI review comment before recommending any action.
   Classify it as actionable, stale, wrong, over-scoped, or out of scope.
7. Treat AI review comments as advisory, not authoritative.
   They are never gospel and should not be implemented blindly.
8. Apply the repo's `ai-cr` policy explicitly.
   Push back on stale, over-scoped, unnecessary, or policy-conflicting suggestions.
9. When the triage is being run by the orchestrator hook, return the triager contract and let the active agent environment decide whether to patch immediately or stop for ambiguity.
10. If the user explicitly approves your triage and asks you to patch, make the patch immediately.
11. After applying an approved patch:

- run the smallest relevant verification
- commit the patch changes in the current repo
- push the current branch so the PR updates automatically

## Output expectations

- Start with whether AI review comments were found.
- Filter out generic summary noise by default and focus on unresolved review items.
- State which comments are actionable and which should be rejected.
- Group by unresolved issue, not by raw API payload.
- Include file and line when available.
- Call out stale or already-addressed comments explicitly instead of blindly implementing them.
- Only stop for operator input when the right action is genuinely ambiguous.
