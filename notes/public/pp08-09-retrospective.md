# P08–P09 Retrospective

_Phase 08 (post-queue lifecycle) and Phase 09 (daemon HTTP API) — run end-to-end through the son-of-anton delivery orchestrator_

---

## Scope delivered

Two phases run consecutively through the son-of-anton delivery workflow: plan doc → ticket decomposition → stacked PRs → AI review polls (CodeRabbit, Greptile) → advance → closeout. Phase 08 covered post-queue torrent lifecycle; Phase 09 covered the daemon HTTP API. Both used Copilot-hosted delivery.

---

## What went well

- **Stacked-slice discipline held.** The one-ticket-in-flight constraint prevented the drift-across-three-concerns pattern. Every PR was thin enough that the diff was reviewable by one human in a reasonable sit.
- **Handoffs worked as designed.** Context resets at ticket boundaries reduced hallucinated carry-forward. The next ticket re-read the plan, handoff artifact, and ticket scope rather than inheriting an unbounded "what we talked about" mental model.
- **AI review polling produced real signal.** The CodeRabbit / Greptile inline-comment model caught genuine hygiene issues (credential redaction, `isDueFeed` reuse, skip-incomplete-TV-candidates). The polling window format (check at cap, record outcome, patch or advance) converted that signal into durable patches rather than drive-by suggestions.
- **Docs-only fast path.** Skipping the external review polling window for docs-only tickets was the right call. No time lost waiting for bots on markdown changes. `clean` immediate-advance reduced ceremony without cutting a real corner.
- **Real-world deployment feedback loop.** NAS deployment during and after Phase 09 produced three direct runbook improvements within hours: `docker load` dangling-image behavior, cleanup for `/tmp` archive and `image prune -f`, `apiPort` config-only enable pattern. The tight loop between delivered code and operator feedback is the best argument for keeping NAS validation in the delivery model.

---

## Pain points

- **PR body linking and stacked-PR navigation were manual overhead.** GitHub doesn't understand the stack. Every PR body needed manual parent/child links, "merged via" notes after parent landing, and occasional restack. The orchestrator handles this, but the convention adds friction at every ticket boundary for operators who haven't internalized stacking.
- **Poll-review window timing is a rough heuristic.** The polling caps were guesses. On slow review days, feedback lands after the window closes and becomes a "late follow-up" tracked separately. The orchestrator records what it saw during the window but didn't automatically reconcile findings that arrived after `done`.
- **State-file location assumptions break across worktrees.** The closeout script assumed the invocation cwd owns the plan state. When the operator switches to main for closeout, the state file may be absent or stale if the final ticket's worktree was the last writer. First encountered in Phase 13; documented then.

---

## Surprises

- **Copilot and Claude have meaningfully different continuation bias.** Copilot under son-of-anton is more compliance-oriented: follows SKILL.md precisely but won't stretch past ambiguous state the way Claude does. If a ticket boundary condition is grey, Copilot pauses and asks; Claude resolves it from repo context and keeps moving. Neither is wrong — they are different trust-model operating modes. The son-of-anton SKILL.md was written with Claude's continuation bias in mind; its negated-rule language ("do not stop because X") is less effective for a rule-following model that can interpret "do not stop" as a rule while still finding reasons to stop.
- **The model differences matter less than the quality of the plan.** Phases that worked smoothest were the ones where the plan was tightest upfront. Review feedback was additive (catching gaps), not corrective (fixing broken design). That asymmetry is the point.

---

## What we'd do differently

- **Outcome-spec language instead of negated-rule language in SKILL.md.** "Expected completion state: every ticket reaches `done` without re-invocation" is more robust across model trust styles than "do not stop merely because one PR was opened." The skill now uses outcome-spec framing.
- **Late-review reconcile command.** Add a way to pick up AI review comments that arrive after the polling window closes without reopening the ticket — without tracking them in a separate `late-review-followups.md` file. EE4 delivered `reconcile-late-review`.
- **Explicit NAS validation gate in phase plans.** Phases that touch the daemon runtime should have a formal "validate on NAS" entry in the ticket checklist, not just a runbook section. The feedback loop is too valuable to leave to operator initiative.

---

## Net assessment

Son-of-anton is not a prompt — it is a delivery model that relies on specific structural properties: thin ticket slices, explicit handoffs, review-gated advancement, and the model's ability to read those structures as standing permissions rather than waiting for per-step approval. Phases 08 and 09 validated the model end-to-end with two consecutive phase runs. The main operational gaps (state-file drift, late review reconciliation) were identified and subsequently addressed in EE4 and later engineering work.

---

## Follow-up

- **Late-review reconcile command (done):** `bun run deliver --plan <path> reconcile-late-review <ticket-id>`. Delivered in EE4.
- **Closeout state-source discovery:** `closeout-stack` should search for plan state in candidate worktrees when the invoking cwd doesn't have coherent state. Partially addressed via documentation; full discovery not yet automated.
- **Polling window extension on fresh signal:** Instead of a fixed cap, extend when new inline comments arrive during the window. Not yet implemented.
- **Stack status command:** `bun run deliver --plan <path> status` prints per-ticket state as a table. Delivered; now includes branch, PR#, status, and last review outcome.

---

_Created: 2026-04-08._
