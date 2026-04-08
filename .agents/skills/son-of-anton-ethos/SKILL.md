---
name: son-of-anton-ethos
description: Execute approved multi-ticket phase/epic work or standalone (non-ticketed) PR delivery through the repo orchestrator with strong continuation bias. Use automatically when a user asks to execute, begin, start, deliver, implement, continue, resume, run, drive, carry, or work on a phase, epic, or standalone PR, or explicitly mentions son of anton or son-of-anton ethos.
---

# Son Of Anton Ethos

This is the repo-local execution ethos for **approved multi-ticket phase and epic work** and for **standalone (non-ticketed) PRs** that use the delivery orchestrator without a ticket stack.

The point of the delivery orchestrator is to carry a reviewed ticket stack forward without the agent repeatedly falling back to permission-seeking pauses. For standalone PRs, the same discipline applies to finishing verify, review sequencing, and orchestrator-driven external review—without pretending a single phase plan exists when it does not.

## Standalone (non-ticketed) PRs

Policy lifted from [`AGENTS.md`](../../../AGENTS.md) and [`docs/03-engineering/delivery-orchestrator.md`](../../../docs/03-engineering/delivery-orchestrator.md):

1. **Entrypoint and config.** Prefer `bun run deliver` as the operator entrypoint. Read repo-root `orchestrator.config.json` when relevant and `docs/03-engineering/delivery-orchestrator.md` for command surface and behavior—not ad hoc substitutes for what the orchestrator already implements.
2. **When to use this path.** Smaller bounded product changes may ship as **standalone PRs without a new phase/epic**. For those, use the orchestrator's **standalone `ai-review` path**—`bun run deliver ai-review [--pr <number>]`—**not** the ticketed stacked flow (`--plan …`, `poll-review`, `advance`, `closeout-stack`, etc.).
3. **Before external AI-agent review.** Complete implement → verify (e.g. `bun run verify` and scoped tests) in **build mode**, then switch to **self-audit mode**: re-read the diff against the ticket and second-pass risky areas before publishing the PR. For **ticket stacks**, run `bun run deliver --plan … post-verify-self-audit` after self-audit mode; standalone PRs have **no** `post-verify-self-audit` CLI, but the same mode switch applies—do not skip straight to `ai-review` without self-audit and without stating what was verified.
4. **Running `ai-review`.** The standalone command uses **real wall-clock** polling intervals. Surface that before starting a long run; do not background it silently or treat “invoke” as permission to hide time cost from the developer.
5. **Commits.** Follow AGENTS **Pre-Commit** (Prettier for touched files; spellcheck when docs or user-facing copy changed).
6. **Product-scope gates** in AGENTS (planning pass, approved decomposition, handoffs) apply to **new product phase/epic** work—not to standalone PRs that AGENTS already allows outside a new phase. Do not expand scope into a faux epic without developer direction.

For ticket stacks, the sections below remain authoritative. For standalone PRs, use **[AI Review Polling](#ai-review-polling)** with `deliver ai-review` instead of `poll-review`, and respect **[Stop Conditions](#stop-conditions)**.

## Core Stance

Treat the whole approved phase or epic as the unit of work.

Do not treat a single ticket as the unit of work unless the user explicitly narrows scope to one ticket.

When the user asks to execute, begin, start, deliver, implement, continue, resume, run, drive, carry, or work on a phase or epic, read that as standing approval to keep advancing ticket-by-ticket.

**Expected completion state:** every ticket in the phase stack has reached `done` and the developer has received a final summary — all without requiring re-invocation between tickets.

The following are normal orchestrator milestones, not permission checkpoints or completion signals. Reaching any of them is not a reason to pause or return control:

- one ticket implemented
- one PR opened
- one review window started or finished clean
- a natural checkpoint that feels complete
- elapsed time

The workflow is not complete until the full phase stack is done or a repo-valid stop condition applies.

## Pre-Flight Sequencing

Before creating any ticket branches or worktrees for a phase:

1. Commit the delivery plan and all ticket docs to the default branch first.
2. Only then create ticket branches from the default branch tip.

This avoids a sequencing problem where ticket worktrees are missing the plan docs they depend on.

## Required Behavior

1. Re-read the required repo docs and handoff artifacts at each ticket boundary.
2. Use the supported orchestrator path, not an ad hoc manual substitute.
3. Move one ticket at a time in order.
4. For each ticket, complete the full local cycle:
   - implement
   - verify
   - update the ticket rationale when behavior or implementation choices changed
   - switch from build mode to self-audit mode, then `post-verify-self-audit` (records delivery state)
   - open or refresh the PR
   - run the orchestrator's AI-review polling flow (see [AI Review Polling](#ai-review-polling) below)
   - patch prudent review findings when required
   - refresh PR state
   - advance to the next ticket
5. During external waits, read ahead into the next ticket and nearby seams if helpful.
6. Do not write ahead across ticket boundaries.
7. Keep going after `advance` without asking for permission again unless a real blocker exists.

## AI Review Polling

During the `poll-review` window, be sabai-sabai. The developer uses this time to review earlier stacked PRs. Token usage is minimal while sleeping between polls.

When results land, actually read them:

- **Inline review comments** are the signal. CodeRabbit and Greptile post their actionable findings as inline code-level review threads (`pulls/{number}/comments` API), not as PR-level issue comments.
- **Summary PR comments** (issue_comment channel) from CodeRabbit and Greptile are orchestration noise — they announce that a review started or post a walkthrough. Do not treat them as the review itself.
- **Qodo** posts a single actionable PR comment that summarizes all findings. It is the easiest vendor output for an agent to parse, but its free tier is limited. Treat Qodo comments as actionable when present.
- **SonarQube** posts a Quality Gate summary as a PR comment and may annotate via GitHub Checks. The PR comment is the primary signal.
- After the polling window, cross-reference the fetcher's structured output against the raw inline comments API (`pulls/{number}/comments`). Do not treat the fetcher's `findingsCount` or `detected` flag as the sole source of truth — the fetcher's detection can lag behind actual comment delivery.

### Review Outcome Recording

Record `clean` only when no actionable feedback was found during the review window. If actionable feedback was found and prudently fixed, record `patched`. Do not downgrade `patched` to `clean` just because later polling is quiet.

### Docs-Only PRs

Skip the external AI review polling window for docs-only PRs (no code changes). Static analysis and security scanning have nothing to find in markdown edits. Consistency and correctness findings on docs (like phase-status text drift) should be caught during implementation, not outsourced to a review bot. Record `clean` immediately and advance.

## Stop Conditions

Stop only for the narrowest repo-valid reasons:

- unsafe work
- missing prerequisites that cannot be resolved from repo context
- ambiguous review triage that genuinely needs developer judgment
- orchestrator blockage or broken delivery state that cannot be prudently repaired
- an explicit documented developer control point
- explicit user interruption or scope change

If none of those are true, continue.

## Anti-Pattern

These are execution failures for approved stacked delivery work. Do not use them as stopping points:

- returning control after one ticket with a summary like "I finished the current ticket"
- treating an open PR as completion
- treating a running or clean review window as completion
- pausing to ask whether to continue when no stop condition exists
- offering a progress summary mid-run and waiting for acknowledgment

If you find yourself about to do any of the above and no repo-valid stop condition is present, that is a signal to continue, not to pause.

## Response Rule

If blocked, report:

- the exact ticket
- the exact blocker
- the exact repo policy or doc reason that forced the stop
- send a telegram notification to the user with that information and a link to the relevant repo doc or policy

If not blocked, keep executing instead of summarizing mid-run.
