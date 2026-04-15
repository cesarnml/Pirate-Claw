# PR 162 Retrospective

_Standalone PR #162: split AI review fetch and triage artifacts on `codex/review-artifact-split`_

---

## Scope delivered

PR #162 split persisted review state into `reviews/<ticket>.fetch.json` and `reviews/<ticket>.triage.json`, removed persisted rendered `.txt` review artifacts, slimmed `state.json` to artifact/index fields, rewired orchestrator readers and writers to the new contract, updated PR-body rendering and delivery tests, and converged the workflow docs and skills onto the hard-cut model.

## What went well

The contract decision was strong enough to drive the implementation cleanly. Once the repo stance became “one authoritative vendor artifact, one authoritative triage artifact, no rendered-text persistence, no mirrored review payloads in state,” most code and test decisions became mechanical instead of philosophical.

The existing delivery test surface paid for itself. The orchestrator and review tests were broad enough to let the refactor move through artifact writes, state persistence, PR-body rendering, and reconcile behavior without guessing where regressions were hiding. The failures were usually narrow and actionable rather than diffuse.

Driving the work through the actual standalone orchestrator path also surfaced real workflow signal instead of simulated confidence. Running `bun run deliver ai-review --pr 162` after the refactor exposed where the new persistence model was correct but the real post-PR review loop still had ambiguous edges.

## Pain points

The biggest avoidable waste was that this refactor touched both the persistence contract and the workflow contract at the same time. That meant code, tests, docs, skills, PR-body rendering, and runtime review behavior all had to stay aligned. The implementation itself was manageable; the expensive part was convergence.

The second pain point was stale review state versus current code state. After the concrete CodeRabbit findings were fixed, the PR still exited `operator_input_needed` because the remaining signal was no longer “patch this code,” it was “there is still at least one review item whose disposition is not obvious from repo policy alone.” That is expected cost, not waste, but it was the first time the repo actually had to live with that terminal state instead of immediately patching through it.

## Surprises

The main surprise was that `operator_input_needed` was real all along; it just had not been exercised to completion before. Previous PRs only hit it transiently because the remaining review items were still concrete enough for the agent to patch or dismiss within the same run. This PR changed that because the final unresolved signal was SonarQube’s duplication Quality Gate summary, which is not a line-level fix request and not obviously auto-dismissable either.

That is the key answer to “what changed?” Nothing fundamental changed in the enum or the allowed exit condition. What changed was the combination of:

- the refactor made the review contract stricter and less willing to blur ambiguous states into “clean”
- the remaining vendor signal was a repo-level judgment call rather than a concrete patch instruction
- the standalone flow has no ticketed `record-review` continuation step after `ai-review`; once the triager says “manual judgment remains,” the correct behavior is to stop there

In other words: earlier `operator_input_needed` cases looked transient because the agent could still prudently finish the job inside the same execution. This one did not. The state machine did not become stricter by accident; it finally encountered a review outcome that actually matched the stop condition.

Another surprise was that resolving stale GitHub review threads materially changed the standalone outcome wording. The flow moved from “actionable fixes still needed” to “manual judgment remains,” which is a meaningful distinction and a good sign that the fetch/triage split is preserving review semantics instead of collapsing everything into one note.

## What we'd do differently

If redoing this PR, I would probably separate “artifact contract reset” from “review-noise compaction” more aggressively in the implementation order, even if they still shipped in one PR. The fetch/triage split was the important architectural move; comment-body minimization and vendor-noise shaping should have been treated as a later optimization pass rather than mentally bundled with the persistence cleanup.

I would also add a clearer standalone follow-up path for `operator_input_needed`. The ticketed flow already has an explicit human continuation seam with `record-review`; the standalone flow currently stops correctly, but the next action is implicit. That is fine when the operator is in the thread, but it is weaker than the ticketed workflow.

## Net assessment

The PR achieved the architectural goal. Review persistence is cleaner, cheaper, and more coherent than before, and the repo now has a stricter boundary between vendor evidence, repo judgment, and orchestrator control-plane state. The only unresolved issue is not the refactor itself; it is whether the remaining Sonar duplication signal should be treated as a real follow-up target or as accepted manual judgment on this PR.

## Follow-up

- Decide whether standalone `operator_input_needed` should gain an explicit follow-up command analogous to ticketed `record-review`, or whether the current stop-and-ask behavior is sufficient.
- Decide whether SonarQube Quality Gate summary comments should keep escalating to manual judgment in standalone `ai-review`, or whether some subset should be auto-classified as non-action when they are repo-policy-level signals rather than code-line findings.
- Consider a later compaction pass on persisted comment bodies so `fetch.json` keeps actionable structure without carrying unnecessary vendor boilerplate.

_Created: 2026-04-15. PR #162 open._
