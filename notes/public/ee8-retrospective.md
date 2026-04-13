# EE8 Retrospective

_Engineering Epic 08: Codex Preflight Review Gate — stacked PRs #148, #149, #150_

---

## Scope delivered

EE8 shipped as three linked PRs on `agents/ee8-01-self-audit-observability-and-review-policy-config` through `agents/ee8-03-docs-and-workflow-guidance`: `#148` added `selfAuditOutcome` recording, the `ReviewPolicy` config type with per-stage values, and full validation (including unknown-key rejection); `#149` added the `codex-preflight` command, `codex_preflight_complete` status, the doc-only auto-skip via local git diff, the `openPullRequest` gate that blocks PR creation until preflight resolves, and `CodexPreflightOutcome` recording in state; `#150` documented the full config surface (including `skip_doc_only` semantics), updated the Son-of-Anton skill step-4 execution flow, and fixed `repair-state` to preserve `docOnly` across state sync.

## What went well

The three-way ticket split was well-calibrated. Scaffolding the config and recording infrastructure in EE8.01 meant EE8.02 could attach `codex_preflight_complete` into a type-safe status ladder without touching config parsing, and EE8.03 had a complete, stable surface to document rather than chasing a moving implementation. The status rank extension pattern (`statusRank` in `state.ts`) remains the right insertion point: inserting `codex_preflight_complete: 3` and shifting subsequent ranks was a one-line-per-status edit with no ripple.

Isolating EE8.01 from EE8.02 changes in their respective worktrees also worked. Because EE8.01 omitted the `codex-preflight` command types entirely, CI on the EE8.01 branch stayed clean without any forward-reference noise; the EE8.02 branch inherited EE8.01 cleanly and added only the delta.

CodeRabbit added genuine signal on both code tickets. The unknown-key rejection fix (EE8.01) and the `docOnly` carry-through / doc-only detection fix (EE8.02) both addressed real latent gaps that the original implementation missed. The EE8.03 `record-review` omission in SKILL.md was cosmetic but correct to catch.

## Pain points

**Doc-only detection before a PR exists.** The original design assumed `docOnly` could be inferred from the PR diff (`gh pr diff`), but `codex-preflight` runs before `open-pr`. The fix — local `git diff origin/<baseBranch>...HEAD --name-only` in the CLI handler — is correct, but it means doc-only detection now exists in two places: the persisted `docOnly` flag set by `open-pr` and the local diff check in `codex-preflight`. If either diverges in the future, they will silently disagree. This is avoidable waste; the doc-only check should ultimately be one canonical path.

**`repair-state` clearing persisted fields.** Calling `syncStateWithPlan(undefined, ...)` discards every previously-persisted field, not just `docOnly`. The EE8.03 patch fixed the call order for `repairState`, but `syncStateWithPlan` is called from other contexts too (`loadState` in the no-existing-state branch). The root issue is that `undefined` as the previous-state argument means "fresh start," but `repairState` semantics require "merge repo reality with existing state." Passing existing state as the first argument is the right fix; this was found via CodeRabbit rather than by reading the full call graph during implementation.

**Splitting uncommitted changes across three stacked worktrees.** All EE8 changes initially existed only in the main working tree. Distributing them required careful omission — EE8.01 worktree got EE8.01-only types; EE8.02 worktree inherited EE8.01 and added the delta. This is expected cost for a stacked delivery, but the manual decomposition is error-prone. A wrong include (EE8.02 type leaking into EE8.01) would have caused CI failures that pointed at the wrong ticket.

## Surprises

**The `initOrchestratorConfig` global inheritance bug.** When `reviewPolicy` was omitted from config, the original fallback used `_config.reviewPolicy` (the module-level mutable config state). That meant repeated `initOrchestratorConfig` calls with omitted policy would inherit the previous call's policy instead of the intended defaults. CodeRabbit caught this; the fix was to inline the hard-coded defaults directly rather than reading the module global. This is the kind of bug that only manifests with multiple successive calls, which unit tests with isolated modules wouldn't normally exercise.

**`codexPreflightPolicy` needed to pass through to `openPullRequestImpl`.** The gate in `openPullRequest` needed the resolved policy value to decide whether to enforce the `codex_preflight_complete` prerequisite. Wiring `codexPreflightPolicy` from `_config.reviewPolicy.codexPreflight` through the call chain revealed that `openPullRequestImpl` had to accept policy as a parameter rather than reading config directly. This is the correct design but was not obvious during initial scaffolding.

**`skip_doc_only` definition gap in docs.** The orchestrator doc listed `skip_doc_only` as a valid stage value without explaining what it means. It made it through two tickets of implementation before CodeRabbit flagged it on the docs ticket. The lesson is that listing values without defining behavior is a documentation smell even when the implementation is clear.

## What we'd do differently

If starting EE8 again, the doc-only detection path would be designed as a single function called from both `codex-preflight` and `open-pr`, not duplicated per command. The current two-path design (`docOnly` persisted at `open-pr` time, `git diff` computed at `codex-preflight` time) is correct but fragile — one future path could diverge.

The `repair-state` semantics would also be documented in code, not just behavior. The `syncStateWithPlan(undefined, ...)` vs `syncStateWithPlan(existing, ...)` distinction is meaningful but invisible at the call site. A named boolean parameter or a wrapper function (`syncStateFromScratch` vs `syncStateFromExisting`) would make the intent explicit and prevent the same class of bug on future callers.

## Net assessment

EE8 achieved its stated goal. The orchestrator now has a first-class `ReviewPolicy` config with per-stage values, `selfAuditOutcome` is recorded on every ticket, the `codex-preflight` command exists with correct doc-only auto-skip, the `openPullRequest` gate enforces preflight when policy requires it, and the Son-of-Anton skill and delivery-orchestrator doc reflect the full workflow. The two main roughnesses — dual doc-only detection paths and the undocumented `syncStateWithPlan` semantics — are avoidable and worth addressing in a future cleanup pass.

## Follow-up

- Consolidate doc-only detection into a single utility called from both `codex-preflight` and `open-pr`; the two-path design will diverge silently if either caller is updated independently.
- Add a named wrapper or comment to `syncStateWithPlan` callers to make the `undefined` vs existing-state distinction explicit at the call site.
- Trial `codexPreflight: "required"` on an actual engineering epic once the workflow is proven stable; currently the default is `"disabled"` with no real-world data on the signal-to-noise ratio of Codex preflight findings.

_Created: 2026-04-14. PRs #148, #149, and #150 open._
