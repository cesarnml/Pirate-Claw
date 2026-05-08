## Scope delivered

Phase 26 shipped across stacked PRs for `P26.01` through `P26.04` on the `agents/p26-01-...` through `agents/p26-04-...` stack. Delivered scope: a repo-owned Mac `launchd` reference artifact and boundary contract, a real-machine Apple Silicon validation harness that proved restart truthfulness under per-user `launchd`, a dedicated Mac operator runbook plus README truthfulness updates, and the overview/retrospective closeout needed to hand Phase 29 a settled deployment story.

## What went well

Locking the Mac supervisor contract before touching runtime validation paid off. Once `P26.01` made the support claim concrete, `P26.02` could focus on proving one path instead of debating multiple fuzzy Mac supervisor options. The second repeatable win was turning validation into a repo-owned harness rather than a chat-only checklist. That made the Phase 26 claim reviewable, easy to run again, and less dependent on memory about which exact restart steps had been tried on the developer machine. The third useful pattern was keeping the Mac runbook separate from the Synology runbook. The shared product truth stayed aligned, but the operator steps stopped fighting over platform-specific assumptions.

## Pain points

The main avoidable waste was orchestrator timing friction around docs-only and disabled-review tickets. The state recorder and follow-up commands are correct, but when `poll-review` and `advance` or `post-verify-self-audit` and `open-pr` run too close together, the later command can see a stale state snapshot and fail even though nothing is conceptually wrong. Another pain point was that the Phase 26 worktree for `P26.01` had been created before the plan docs landed on `main`, which forced a rebase repair before the orchestrator recorder could see the plan path again. That was a process-sequencing cost, not product work.

## Surprises

The biggest technical surprise was how little runtime code Phase 26 actually needed once the restart proof model from Phase 25 was already sound. The decisive work was not a daemon redesign; it was proving that the same durable restart artifact and SQLite boundary survive a real `launchd` restart on Mac. Another surprise was that the repo's pre-push gate exposed an unrelated environment-sensitive API test while publishing `P26.01`. The fix belonged in the current ticket branch because the branch could not be published safely without it, but the failure itself was not Mac-specific. A third surprise was that the temporary validation harness installing a per-user `launchd` agent surfaced as a signed Bun background process in macOS, which is correct behavior but worth calling out so it does not look like unexplained agent drift next time.

## What we'd do differently

We would teach the orchestrator a slightly more atomic happy path for docs-only/disabled-review tickets so the immediate next command does not race the just-written state. The current sequencing was still reasonable when designed because each command is independently idempotent and review-policy-aware, but Phase 26 showed that the operator experience is noisier than necessary when state transitions complete milliseconds before the next orchestrator command starts. On the product side, we would probably have planned the repo-owned validation harness explicitly from the beginning instead of first thinking in terms of manual real-machine validation. The manual instinct was understandable because Mac validation is inherently host-specific, but the harness produced a stronger long-term artifact than prose notes alone.

## Net assessment

Phase 26 achieved its goal. Pirate Claw now has a truthful Mac always-on story: one supported Apple Silicon `launchd` supervisor contract, one durable install boundary, one real-machine validation proof for restart-backed behavior, and one dedicated operator runbook that does not blur into the Synology deployment path. The remaining product-completion work is no longer deployment truth; it is Phase 29 polish and then Phase 30 release/versioning ceremony.

## Follow-up

- Phase 29 should treat the Mac and Synology deployment stories as settled operator boundaries and avoid reopening them casually while polishing the UI.
- The orchestrator should consider smoothing state transitions for docs-only or `externalReview: disabled` tickets so immediate `advance` retries are less timing-sensitive.
- If Pirate Claw ever widens Mac support beyond Apple Silicon or per-user `launchd`, that should be a new explicit phase or bounded follow-up rather than an incidental runbook edit.

_Created: 2026-04-23. Phase 26 stack PRs #224, #225, and #226 open at time of writing._
