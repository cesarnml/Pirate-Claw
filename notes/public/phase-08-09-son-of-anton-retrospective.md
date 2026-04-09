# Phase 08 & 09 Son of Anton Retrospective

## What This Note Covers

Phase 08 (post-queue lifecycle) and Phase 09 (daemon HTTP API) were both run end-to-end through the Copilot-hosted son-of-anton delivery orchestrator — plan doc → ticket decomposition → stacked PRs → AI review polls → advance → closeout. This note captures what that experience actually taught about the workflow, the model differences that showed up in practice, and what the next round of operator tooling should address.

---

## What Went Well

### Stacked-slice discipline held

The one-ticket-in-flight constraint prevented the pattern where an AI drifts across three concerns in one commit and makes the diff unreadable. Every PR was thin enough that the diff was actually reviewable by a single human in a reasonable sit.

### Handoffs worked as designed

Context resets at ticket boundaries genuinely helped. Rather than the next ticket inheriting an unbounded "what we talked about in the last thread" mental model, it re-read the plan, handoff artifact, and ticket scope. The narrower starting state reduced hallucinated carry-forward between tickets.

### AI review polling produced real signal

The CodeRabbit / Greptile inline-comment model finds things a solo developer would miss on a first pass — not groundbreaking findings, but genuine hygiene catches (credential redaction, `isDueFeed` reuse, skip-incomplete-TV-candidates). The polling window format (check on a cap, record outcome, patch or advance) converted that signal into actual durable patches rather than drive-by suggestions.

### Docs-only PR fast-path

Skipping the external review polling window for docs-only tickets was the right call. No time lost waiting for bots to say nothing on markdown changes. The `clean` immediate-advance path for docs reduced ceremony without cutting a real corner.

### Real-world deployment feedback loop

The pirate-claw deployment on the NAS during and after Phase 09 produced three direct runbook improvements within hours of delivery:

- `docker load` dangling-image behavior
- cleanup step for `/tmp` archive and `image prune -f`
- `apiPort` config-only enable pattern

That tight loop between delivered code and operator feedback — the kind you only get from actually running the thing — is the best argument for keeping the NAS validation gate in the delivery model.

---

## What Didn't Go Well

### PR body linking and stacked-PR navigation were manual overhead

GitHub doesn't understand the stack. Every PR body needed manual parent/child links, "merged via" notes after parent landing, and occasional restack. The orchestrator handles this, but it adds friction at every ticket boundary. An operator who hasn't internalized the stacking convention will likely make mistakes.

### The poll-review window timing is still a rough heuristic

The polling caps (2/4/6/8 minutes) are guesses. On slow review days, feedback lands after the window closes and becomes a "late follow-up" tracked separately in `late-review-followups.md`. The orchestrator records what it saw during the window but doesn't automatically reconcile findings that arrive after `done` is recorded. This is a real gap.

### State-file location assumptions break across worktrees

The `stacked-closeout` script assumes the invocation cwd owns the plan state. When the operator switches back to main and runs closeout, the state file may be absent or stale if the final ticket's worktree was the last writer. The `late-review-followups.md` already calls this out as a needed fix.

### Copilot-as-orchestrator has a continuation-bias difference from Claude Code

Copilot's son-of-anton runs are generally more compliance-oriented: it follows the SKILL.md rules precisely, but it won't stretch past ambiguous state the way Claude Code does under the same ethos. If a ticket boundary condition is grey, Copilot will pause and ask; Claude typically resolves it from repo context and keeps moving. Neither is wrong — but they are different operating modes and the operator needs to know which they have.

---

## The Model Bias Difference: Opus vs. ChatGPT 4.5

This is the more interesting structural observation.

### Opus (Claude) — strong prior, resolves ambiguity from context

Claude/Opus under son-of-anton ethos:

- Treats the approved plan + SKILL.md as a strong prior
- Resolves ambiguous ticket state by reading adjacent repo context rather than asking
- Will diverge from the literal SKILL.md wording when it judges the spirit clearly points another direction
- Strong continuation bias: it will "keep going" through edge cases unless a hard blocker exists
- Produces more narrative rationale in ticket docs and PR bodies — sometimes too much
- When it hits a tool error or unexpected state, it tends to try an alternative approach before surfacing the problem

Failure mode: Opus can over-resolve ambiguity in ways the developer didn't intend. It may silently make a judgment call and commit it, only visible in the diff. On multi-ticket runs, those judgment calls can compound across tickets before the developer catches them.

### ChatGPT 4.5 — rule-following, lower continuation bias

ChatGPT 4.5 under son-of-anton ethos:

- Treats SKILL.md as a spec to comply with rather than a prior to reason from
- More likely to surface an acknowledgment that it is doing X because the spec says so
- Lower continuation bias: more likely to stop at what feels like a "natural milestone" and return control, even when the skill says to keep going
- Less likely to silently resolve ambiguity — more likely to ask a clarifying question or note the uncertainty explicitly
- Produces more structured, templated outputs (PR bodies, ticket rationales) that are easier to audit but can feel mechanical

Failure mode: ChatGPT 4.5 can treat the orchestrator's milestones (one PR opened, one review window completed) as implicit stop conditions despite the SKILL.md anti-patterns explicitly naming those. The operator may need to re-invoke more often than with Opus.

### The operational implication

These are not quality differences — they are trust-model differences.

- If you want a run that advances with minimal re-invocation and you are confident the plan is solid: Opus under son-of-anton is faster.
- If you want a run where the model surfaces every ambiguous decision explicitly and you maintain tighter control: ChatGPT 4.5 is more comfortable to supervise.

The workflow was designed with the Opus model in mind — the strong-continuation-bias language in the SKILL.md (`do not stop merely because one PR was opened`) is clearly aimed at fighting Claude's tendency to do the right thing but pause to hand back control anyway. That language is less necessary for ChatGPT 4.5 (which already pauses more) and doesn't fully fix the problem since ChatGPT 4.5 can interpret "do not stop" as a rule while still finding reasons to stop.

A better framing for SKILL.md may be to describe the intended behavior as an outcome specification ("the full stack should be complete without re-invocation") rather than a rule negation ("do not stop because X, Y, Z"), since different models interpret negated-rule language differently.

---

## What Can Be Improved

### Short-term (process)

1. **Late-review reconcile command** — `bun run deliver --plan <path> reconcile-late-review <ticket-id>` to pick up AI review comments that arrived after the polling window closed without reopening the ticket. Already tracked in `late-review-followups.md`.

2. **Closeout state-source discovery** — `stacked-closeout` should search for the plan state file in candidate worktrees when the invoking cwd doesn't have a coherent state, not fail silently or use stale state.

3. **Explicit NAS validation gate in phase plans** — phases that touch the daemon runtime (like 08 and 09) should have a formal "validate on NAS" entry in the ticket checklist, not just a runbook section. The feedback loop is too valuable to leave to operator initiative.

### Medium-term (SKILL.md)

4. **Outcome-spec language instead of negated-rule language** — reframe stop conditions as "expected completion state" so both continuation-biased models (Opus) and rule-following models (ChatGPT) converge on the same terminal condition.

5. **Model-specific guidance section** — add a short advisory to SKILL.md noting that the continuation bias language is calibrated for Opus-class models; operators using rule-following models should expect to re-invoke after each milestone rather than waiting for a hard blocker.

### Longer-term (tooling)

6. **Polling window that extends on fresh signal** — instead of a fixed cap, the poll-review window should extend when new inline comments arrive during the window. A fresh comment at minute 5 shouldn't be cut off by a minute-6 cap.

7. **Stack visualization** — a `bun run deliver --plan <path> status` command that prints the current per-ticket state (branch, PR#, status, last review outcome) as a table would reduce the overhead of mentally tracking stack position during a long phase run.

---

## Closing Observation

The son-of-anton workflow is not a prompt. It is a delivery model that relies on specific structural properties of the repository — thin ticket slices, explicit handoffs, review-gated advancement — and the model's ability to read those structures as standing permissions rather than waiting for per-step approval.

The phases that worked smoothest were the ones where the plan was the tightest upfront. The review feedback (CodeRabbit finding credential redaction, for example) was additive, not corrective of a broken design. That asymmetry is the point: the plan shapes the implementation space, the review catches the gaps, and the operator approves the stack at slice boundaries rather than after a giant undifferentiated diff.

The model differences matter less than the quality of the plan.
