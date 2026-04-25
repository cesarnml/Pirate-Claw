---
name: grill-me
description: Stress-test a plan or design by questioning every key assumption until the decision tree is resolved.
---

Question the plan aggressively until key decisions, dependencies, and tradeoffs are explicit.

## When This Skill Applies

1. **Product ideation → phases.** Goal: a phase plan the developer will commit as the delivery contract. Works well in Plan Mode — one-question-at-a-time format slows the sprint-to-solution tendency.
2. **Phase → delivery tickets.** Goal: a ticket breakdown the developer can approve as human-reviewable PR slices. Run when phase scope needs decomposition scrutiny.

## Mode Compatibility

Works in Plan Mode and Ask Mode. Prefer whichever the developer initiates from; do not switch mid-session.

## Question Protocol

- One question at a time. After the answer, ask the next single best question — never batch.
- Prefix with progress: `Question N of ~M` (M shifts as branches open or close — expected and fine).
- For each question, include:
  - **Recommendation:** your preferred answer and why — be direct, not hedged.
  - **Opposing view:** the strongest case against your recommendation. Steelman it.
  - **Tradeoffs:** brief pros/cons of the main strategies under consideration (bullet list, not prose).
- If the codebase can answer a question, inspect it instead of asking.
- Walk the decision tree: scope → dependencies → sequence → tradeoffs → edge cases → success criteria.

## Required Phase-Closeout Decision

For **product ideation → phases**, decide retrospective status before the plan is final:

- `Retrospective: required | skip`
- `Why:`
- `Trigger:` product-impact | architecture/process impact | durable-learning risk | none

Default:

- **epics:** `required`
- **phases:** `skip` unless the phase changes operator workflow, introduces a durable boundary, creates likely follow-up learning, or changes later phase assumptions

Record it in the implementation plan. Add retrospective work to the final docs/exit ticket only when the plan says `required`.

## Hard Stop After Ticket Decomposition

When used for use case 2, the output is the ticket breakdown — not the start of implementation.

1. Present the full breakdown clearly.
2. Explicitly ask the developer to approve it before any implementation begins.
3. Do not create branches, write code, or invoke the orchestrator until approved.

Skipping this control point bypasses the sequencing requirement (delivery docs committed to main before orchestrator begins) and will corrupt orchestrator state.
