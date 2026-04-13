---
name: son-of-anton-ethos
description: Execute approved multi-ticket phase/epic work or standalone (non-ticketed) PR delivery through the repo orchestrator with strong continuation bias. Use automatically when a user asks to execute, begin, start, deliver, implement, continue, resume, run, drive, carry, or work on a phase, epic, or standalone PR, or explicitly mentions son of anton or son-of-anton ethos.
---

# Son Of Anton Ethos

Execution ethos for approved multi-ticket phase/epic work and standalone (non-ticketed) PRs via the delivery orchestrator. The orchestrator carries a reviewed ticket stack forward without repeated permission-seeking pauses.

## Standalone (non-ticketed) PRs

1. **Entrypoint.** Use `bun run deliver`. Read `docs/03-engineering/delivery-orchestrator.md` for command surface — not ad hoc substitutes.
2. **When to use.** Smaller bounded changes ship as standalone PRs without a new phase/epic. Use `bun run deliver ai-review [--pr <number>]` — not the ticketed stacked flow (`--plan …`, `poll-review`, `advance`, etc.).
3. **Before external review.** Complete implement → verify (`bun run verify` + scoped tests) in build mode, then self-audit mode (re-read diff, second-pass risky areas). For ticket stacks run `post-verify-self-audit` CLI. If the active ticket workflow includes Codex preflight, complete that gate before `open-pr`. Standalone PRs have no self-audit CLI equivalent, but the same mode switch applies.
4. **Running `ai-review`.** Uses real wall-clock polling. Surface that before starting; do not hide the time cost.
5. **Commits.** Follow AGENTS Pre-Commit (Prettier for touched files; spellcheck when docs or user-facing copy changed).
6. **Product-scope gates** apply to new phase/epic work — not to standalone PRs already allowed outside a new phase.

For ticket stacks, the sections below are authoritative. For standalone PRs, use [AI Review Polling](#ai-review-polling) with `deliver ai-review` instead of `poll-review`, and respect [Stop Conditions](#stop-conditions).

## Core Stance

Treat the whole approved phase or epic as the unit of work — not a single ticket unless the user explicitly narrows scope.

When the user asks to execute, begin, start, deliver, implement, continue, resume, run, drive, carry, or work on a phase, that is standing approval to advance ticket-by-ticket without re-invocation between tickets.

**Expected completion state:** every ticket reaches `done` and the developer receives a final summary.

These are normal milestones, not permission checkpoints: one ticket implemented, one PR opened, one review window finished, a natural checkpoint, elapsed time. The workflow is not complete until the full stack is done or a repo-valid stop condition applies.

## Pre-Flight Sequencing

Commit the delivery plan and all ticket docs to the default branch before creating any ticket branches or worktrees. Ticket worktrees depend on those docs at creation time.

## Required Behavior

1. Re-read required repo docs and handoff artifacts at each ticket boundary.
2. Use the supported orchestrator path, not ad hoc manual substitutes.
3. Move one ticket at a time in order.
4. For each ticket: implement → verify → update ticket rationale → open/refresh PR → run AI-review polling → patch prudent findings → advance.
5. During the external review wait, do nothing. When `advance` emits `compaction_required=true`, call `/compact`, then call `start` to initialize the next ticket.
6. Do not write ahead across ticket boundaries.
7. After `advance` + compact + `start`, keep going without asking for permission unless a real blocker exists.

## AI Review Polling

Be sabai-sabai during the review window. Token usage is minimal while sleeping; the developer reviews earlier stacked PRs during this time.

When results land:

- **Inline review threads** are the signal for CodeRabbit and Greptile. Their summary PR comments are orchestration noise.
- **Qodo** posts a single actionable PR comment with all findings — treat it as actionable when present.
- **SonarQube** posts a Quality Gate summary PR comment; check-run annotations are secondary signal.
- The orchestrator's `reviewComments` in state is the source of truth for triage. Do not re-read the full `.txt` artifact unless you need prose context not in the condensed findings block.

### Review Outcome Recording

Record `clean` only when no actionable feedback found. Record `patched` when actionable feedback was prudently fixed. Do not downgrade `patched` to `clean` because later polling is quiet.

### Docs-Only PRs

Skip the external review window. Record `clean` immediately and advance.

## Stop Conditions

Stop only for: unsafe work, missing prerequisites not resolvable from repo context, ambiguous review triage genuinely needing developer judgment, broken delivery state that cannot be prudently repaired, an explicit documented control point, or explicit user interruption.

If none of those are true, continue.

## Anti-Pattern

Do not use these as stopping points for approved stacked delivery:

- returning control after one ticket with "I finished the current ticket"
- treating an open PR as completion
- treating a running or clean review as completion
- pausing to ask whether to continue when no stop condition exists
- offering a mid-run progress summary and waiting for acknowledgment

## Response Rule

If blocked, report: the exact ticket, the exact blocker, the exact repo policy reason that forced the stop. Send a Telegram notification with that info and a link to the relevant doc.

If not blocked, keep executing.

## On Phase or Epic Completion

Write the retrospective to `notes/public/<plan-path>-retrospective.md` using `.agents/skills/write-retrospective/SKILL.md` for section structure and placement conventions.
