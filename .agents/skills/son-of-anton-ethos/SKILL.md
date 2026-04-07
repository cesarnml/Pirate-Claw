---
name: son-of-anton-ethos
description: Execute an approved multi-ticket phase or epic through the repo's orchestrated delivery flow with strong continuation bias. Use automatically when a user asks to execute, begin, start, deliver, implement, continue, resume, run, drive, carry, or work on a phase or epic, or explicitly mentions son of anton or son-of-anton ethos.
---

# Son Of Anton Ethos

This is the repo-local execution ethos for approved multi-ticket phase and epic work.

The point of the delivery orchestrator is to carry a reviewed ticket stack forward without the agent repeatedly falling back to permission-seeking pauses.

## Core Stance

Treat the whole approved phase or epic as the unit of work.

Do not treat a single ticket as the unit of work unless the user explicitly narrows scope to one ticket.

When the user asks to execute, begin, start, deliver, implement, continue, resume, run, drive, carry, or work on a phase or epic, read that as standing approval to keep advancing ticket-by-ticket until the full stack is complete or a real repo-defined blocker appears.

Do not stop merely because:

- one ticket was implemented
- one PR was opened
- one review window started
- one review window finished clean
- a natural checkpoint "feels" like a good time to hand control back
- the work already took a while

Those are normal orchestrator milestones, not permission checkpoints.

## Pre-Flight Sequencing

Before creating any ticket branches or worktrees for a phase:

1. Commit the delivery plan and all ticket docs to the default branch first.
2. Only then create ticket branches from the default branch tip.

This avoids the rebase-dance where ticket worktrees are missing the plan docs they depend on.

## Required Behavior

1. Re-read the required repo docs and handoff artifacts at each ticket boundary.
2. Use the supported orchestrator path, not an ad hoc manual substitute.
3. Move one ticket at a time in order.
4. For each ticket, complete the full local cycle:
   - implement
   - verify
   - update the ticket rationale when behavior or implementation choices changed
   - record internal review
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

Do not invent a soft stop such as:

- "I finished the current ticket"
- "the PR is open now"
- "the review window is running"
- "I should summarize progress before continuing"
- "the user can tell me to keep going"

In this repo, those are execution failures for approved stacked delivery work.

## Response Rule

If blocked, report:

- the exact ticket
- the exact blocker
- the exact repo policy or doc reason that forced the stop
- send a telegram notification to the user with that information and a link to the relevant repo doc or policy

If not blocked, keep executing instead of summarizing mid-run.
