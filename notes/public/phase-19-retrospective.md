# Phase 19 Retrospective

## Scope delivered

Phase 19 shipped through stacked PRs `#168`-`#174` plus this closeout slice on branch `agents/p19-08-docs-index-updates-exit-verification`. The phase delivered the Obsidian Tide design system, responsive sidebar shell, dashboard consolidation of Candidates and Unmatched, redesigned TV/movie/config routes, the TV detail TMDB refresh flow, and the final doc/index/verification pass.

## What went well

The ticket decomposition was mostly correct for the visual surface because each slice mapped to a route or cross-route shell boundary the reviewer could evaluate quickly. That kept review comments local, let the orchestrator restack cleanly, and made it cheap to patch small UI defects without reopening unrelated surfaces. The existing API surface also proved richer than the old UI used, so most of the redesign landed as route-level presentation work instead of backend churn.

## Pain points

The orchestrator artifact mirroring was still fragile across worktrees. Generated handoff files repeatedly failed to appear in the next worktree, which forced manual copying of `state.json`, `reviews/`, and handoff artifacts at every ticket boundary. That was avoidable waste, not inherent work. The other recurring cost was orchestrator command sequencing: `record-review` and `advance`, or `post-verify-self-audit` and `open-pr`, can race if launched in parallel, so stateful transitions had to be rerun serially.

## Surprises

The reference design for `P19.05` implicitly required data the repo did not yet expose: show network metadata, episode spec tags on `/api/shows`, and a manual TMDB refresh action. That forced an approved scope exception inside a phase that was originally documented as frontend-only. A second surprise was that the final Config footer screenshot asked for host-level metrics that the existing endpoints do not publish; the implementation had to preserve the four-metric shape with operator-facing live proxies instead of literal storage/CPU telemetry.

## What we'd do differently

We would add an explicit orchestrator mirror step for delivery artifacts instead of treating it as a manual workaround described in docs. The original assumption was that worktree-local state would be sufficient because the orchestrator creates the next handoff itself, but the missing-handoff failures showed that assumption is not durable. We would also make state-transition commands explicitly serial in the workflow examples and tooling so agents are not tempted to parallelize commands that read and write the same delivery state.

## Net assessment

Phase 19 achieved its stated goal. The web UI now reads as a coherent, premium media command center instead of a set of utilitarian admin pages, and the redesigned shell plus route consolidation make the dashboard surface materially easier to navigate. The only meaningful scope bend was the approved `P19.05` API exception, and that exception stayed narrow enough to preserve the phase intent.

## Follow-up

- Fix the orchestrator handoff mirroring gap so new ticket worktrees always receive the generated handoff artifact without manual copying.
- Encode serial-state guidance for `post-verify-self-audit` → `open-pr` and `record-review` → `advance` in the Son-of-Anton skill or orchestrator CLI.
- Decide in Phase 20 whether the Config footer should keep its current operator-proxy metrics or whether true host-level storage/CPU telemetry deserves a dedicated future API surface.

_Created: 2026-04-17. PR stack #168-#174 open; P19.08 closeout slice pending._
