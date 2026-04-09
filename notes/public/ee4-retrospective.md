# EE4 Retrospective

## Scope

Retrospective for EE4 stack PRs:

- PR #89 (EE4.01)
- PR #90 (EE4.02)
- PR #91 (EE4.03)
- PR #92 (EE4.04)

## What went well

- The core product outcomes landed: all four EE4 slices are now on `main` as separate squash commits.
- The on-demand review fallback path worked operationally when invoked:
  - Re-ran standalone AI review.
  - Patched prudent findings.
  - Re-ran until outcome became `clean`.
- Tooling improvements in EE4 itself were meaningful:
  - Better PR-body review metadata.
  - Better thread-reply/resolve mechanics.
  - Better fallback path documentation.

## Timeline evidence: review windows vs comment arrival

Assumed ticketed poll window during EE4 execution: 2-minute cadence, max wait 8 minutes, discretionary +2 minute extension (10 minutes total when in-flight).

### PR #89 (EE4.01)

- PR created: `2026-04-08T12:59:54Z`
- Actionable review comments:
  - Greptile inline findings around `13:05` (inside 8-10 minute window)
  - CodeRabbit findings at `13:12:04Z` (outside 10-minute window)
- Assessment:
  - Early Greptile feedback was in-window and was acted on during ticket flow.
  - Later CodeRabbit findings were out-of-window and required on-demand follow-up.

### PR #90 (EE4.02)

- PR created: `2026-04-08T13:15:01Z`
- Actionable review comment:
  - Greptile finding at `13:19:45Z` (inside window, ~4m44s)
- Assessment:
  - This one appears to have been in-window and should have been handled in normal polling.
  - It was ultimately addressed, but lingering thread state later required explicit on-demand cleanup.

### PR #91 (EE4.03)

- PR created: `2026-04-08T13:21:25Z`
- No actionable inline review findings detected in final evidence.
- Assessment:
  - No clear polling miss.

### PR #92 (EE4.04)

- PR created: `2026-04-08T13:33:52Z`
- Actionable review comment:
  - Greptile inline finding at `13:37:51Z` (inside window, ~3m59s)
- Assessment:
  - In-window finding was surfaced and handled with a follow-up patch.

## Did we respect the polling window?

Mixed.

- For #89 and #92, polling behavior aligned with expectations for the comments that arrived in-window.
- For #89 specifically, significant actionable comments arrived after the window, which is expected to require a manual/on-demand cycle.
- For #90, there was in-window actionable feedback, and while it was eventually fixed, the overall process still left stale/open review-state artifacts that had to be cleaned later.

Conclusion: timing policy mostly held, but review-state reconciliation was not reliably "done means done" without manual follow-through.

## Did orchestrator deliver on son-of-anton ethos?

Partially.

What it delivered:

- Strong execution backbone for ticket progression.
- Ability to continue through stack with automation.
- Recoverability via repair/manual fallback when needed.

Where it fell short in this run:

- Early execution discipline errors (running orchestrator commands from the wrong context/worktree) caused avoidable state issues and recovery work.
- We reached closeout with some unresolved/stale review artifacts that should ideally have been fully reconciled before stack collapse.
- Closeout required manual conflict handling; this is acceptable per recovery rules, but it weakens the "smooth continuous flow" promise.

Bottom line: ethos intent was achieved (phase completed end-to-end), but the path had avoidable operational friction and late cleanup.

## Pain points

- Worktree/context fragility:
  - Running delivery commands from the wrong location can corrupt expected state flow.
- Review artifact drift:
  - Old comments can remain "actionable" in artifacts after practical resolution unless thread resolution and metadata refresh are tightly synchronized.
- Poll-window configuration drift:
  - Standalone and ticketed windows diverged in code/messaging at times (8 vs 10), creating confusion.
- Closeout conflict risk:
  - Even approved stacks can conflict during squash closeout, requiring manual conflict decisions.

## Improvements for future runs

1. Preflight guardrails in orchestrator

- Add a strict "execution context check" before mutating commands:
  - verify expected repo root and ticket worktree mapping.
  - fail fast with a corrective command instead of proceeding.

2. Explicit review-completeness gate before closeout

- Before allowing closeout:
  - no unresolved actionable findings in latest artifacts.
  - no unresolved review threads for ticket PRs marked reviewed/done.

3. Unify polling profile

- Single source of truth for ticketed + standalone review windows:
  - interval 2m
  - default max 10m
  - discretionary extension to 12m when in-flight
- Reuse same profile in runtime and user-facing messages.

4. Stronger stale-comment filtering

- In triage/reporting:
  - treat outdated/superseded findings as non-actionable by default unless explicitly revalidated against current head.

5. "Late-review sweep" as standard step

- Add a standard final pass before closeout:
  - run on-demand `ai-review` against all open stack PRs.
  - resolve/reconcile findings and thread state before merge collapse.

## Stance

EE4 still counts as a successful delivery, but not a clean one operationally.
The orchestrator is good enough to deliver the phase, yet current process safety rails are not strong enough to consistently prevent context mistakes, stale review-state drift, and late cleanup work.

Priority fix for next cycle: enforce pre-closeout review completeness and unify polling configuration/runtime messaging so the system behavior is predictable and auditable.
