# EE9 Retrospective

_Engineering Epic 09: Review Policy Enforcement And Doc-Only Consolidation — stacked PRs #151, #152, #153_

---

## Scope delivered

EE9 shipped as three linked PRs on `agents/ee9-01-doc-only-detection-consolidation` through `agents/ee9-03-review-policy-enforcement-and-defaults`: `#151` consolidated doc-only detection onto a shared local-branch git diff helper, `#152` replaced overloaded state-sync call sites with explicit scratch/existing wrappers, and `#153` made `skip_doc_only` behavior real across self-audit, Codex preflight gating, external review skipping, defaults, tests, and workflow docs/skill guidance.

## What went well

The ticket order was correct. EE9.01 created the shared doc-only primitive first, which let EE9.03 wire policy behavior without introducing a second ad hoc detection path. EE9.02 also proved the value of a small clarity-only slice inside a stacked epic: the wrapper rename was easy to review, low risk to land, and removed a real readability hazard before the policy work expanded the surface further.

The orchestrator test suite remained a strong safety rail because the policy behavior is concentrated in a few explicit seams. Once the defaults, self-audit wrapper, poll-review skip helper, and `open-pr` gate were updated, the tests made the remaining drift obvious instead of ambiguous. The AI review on EE9.03 also added real signal by catching documentation mismatches after the code path was already correct.

## Pain points

**Authoritative state depends on invocation cwd.** Running `post-verify-self-audit` from a ticket worktree rewrote the local delivery state with nested future worktree paths (`..._ee9_01_ee9_02` style names) because worktree derivation keys off the current cwd. This is avoidable waste: the execution flow assumes the root worktree is authoritative, but the CLI does not enforce or document that strongly enough.

**Root-worktree orchestration lags ticket-worktree code changes during the active epic.** EE9.03 changed the orchestrator defaults and policy behavior, but the live `bun run deliver` commands during the stack still executed from the root worktree’s older code. That did not block delivery because the active repo config still used the old defaults, but it is a real process sharp edge: the branch being implemented and the orchestrator binary driving the stack are not necessarily the same code.

## Surprises

The biggest surprise was that the review-policy text drift mattered more than the code drift by the end of the epic. EE9.03’s code paths were correct on the first clean verify pass, but CodeRabbit correctly flagged the durable docs and the Son-of-Anton skill for still describing the old default posture or the wrong state field name. Future epic work should expect workflow docs to be part of the executable surface, not just commentary.

Another surprise was how localized the real semantic change was. Adding `'skipped'` to `ReviewOutcome` sounded broad in the ticket, but in practice the behavior stayed narrow: self-audit records `skipped`, `poll-review` still records `clean` on skip, and `open-pr` only needed a policy-aware gate. That narrower shape kept the state and review lifecycle simpler than the ticket initially suggested.

## What we'd do differently

If redoing EE9, the orchestrator would expose an explicit “authoritative delivery root” concept instead of deriving worktree paths from whichever repo clone ran the command. That would remove the accidental nested-path state rewrite and make multi-worktree execution safer.

We would also document the root-vs-ticket execution split earlier in the engineering docs. The current workflow assumes the repo root is the control plane and the ticket worktree is the implementation plane; that distinction only became obvious once EE9.03 updated orchestrator behavior while the live stack was still running on pre-EE9.03 root code.

## Net assessment

EE9 achieved its stated goal. `skip_doc_only` now behaves like a real policy value instead of dead metadata, the defaults match the intended steady-state posture, doc-only detection has a single local-branch utility, `syncStateWithPlan` call sites are self-describing, and the durable workflow docs reflect the shipped behavior after review follow-up. The remaining gaps are process-level sharp edges around state authority and root-vs-ticket execution, not failures of the policy implementation itself.

## Follow-up

- Make the orchestrator state/worktree derivation independent of the current cwd so ticket worktree invocations cannot synthesize nested future worktree paths.
- Document or enforce that stacked delivery commands should run from the authoritative root worktree unless a command is intentionally worktree-local.
- Consider whether `ReviewOutcome` should stay shared between self-audit and external-review state or whether those domains should split if another non-review-state-only value like `skipped` appears in future epics.

_Created: 2026-04-14. PRs #151, #152, and #153 open._
