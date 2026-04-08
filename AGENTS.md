# Repo Rules

- If the user says `triage`, use `.agents/skills/ai-code-review/SKILL.md`.
- For phase work, first read `docs/00-overview/start-here.md` and `docs/03-engineering/delivery-orchestrator.md`, then surface the orchestrator path before coding.
- Use `.agents/skills/son-of-anton-ethos/SKILL.md` automatically when a user asks to execute, begin, start, deliver, implement, continue, resume, run, drive, carry, or work on an approved multi-ticket phase or epic, or uses equivalent wording that clearly means end-to-end orchestrated execution. Also use it when the user explicitly mentions `son of anton`, `son-of-anton`, `son of anton ethos`, or `son-of-anton ethos`. Do not wait for the skill to be named explicitly.
- For new product feature-set expansion, phase shaping, or epic decomposition work, run an explicit planning pass and use `grill-me` before accepting a plan or ticket breakdown. In this repo, son-of-anton treats developer engagement in ideation, decomposition approval, and final delivered-slice approval as required control points rather than optional ceremony. Plan Mode is optional workflow support, not a repo policy requirement.
- The delivery orchestrator reads `orchestrator.config.json` at the repo root for default branch, plan root, runtime internals, and package-manager-aware bootstrap defaults. See `docs/03-engineering/delivery-orchestrator.md` for field details and scope.
- Prefer `bun run deliver --plan ...` over ad hoc implementation. In this repo, `bun run deliver` remains the supported operator entrypoint even though the orchestrator internals are more configurable.
- For orchestrated ticket work, the handoff under `.agents/delivery/<plan-key>/handoffs/` is required input alongside the plan and ticket docs.
- A request to implement, start, begin, run, or resume a phase or epic is a full orchestrated delivery request. Run the stacked flow ticket-by-ticket until the phase is complete or a repo-valid blocker appears. The verb alone does not narrow scope to a single ticket.
- New product phase/epic implementation starts only after the developer has reviewed and approved the delivery decomposition into thin, reviewable tickets.
- New product-scope expansion requires a planning pass and developer-approved ticket decomposition before implementation begins. When those are missing, surface the gap, point to the required planning docs, and wait. Docs-only, cleanup-only, and tooling-only changes that do not expand the product surface skip this requirement.
- Smaller bounded product changes can proceed as standalone PRs without a new phase/epic. Use the orchestrator's standalone `ai-review` path for those rather than the ticketed stacked flow.
- 'begin phase' and 'implement phase' mean run the full stacked-ticket workflow to completion, not just the first ticket.
- Phase flow: implement, verify, push/open PR, run the configured `ai-code-review` polling window, patch prudent findings if any appear, refresh PR state, then advance.
- No `ai-code-review` feedback by the final polling check is not a blocker. Record `clean` only when no actionable feedback was found during the review window. If actionable feedback was found and prudently fixed, preserve `patched` as the final outcome; do not downgrade `patched` to `clean` just because later polling is quiet.
- During external waits, read-ahead into the next ticket, handoff, and adjacent seams is encouraged. Do not write ahead until the current ticket is cleared.
- The only valid reasons to stop orchestrated delivery work are: unsafe operations, missing prerequisites the repo context cannot resolve, ambiguous review triage that needs developer judgment, orchestrator blockage, or explicit user scope change.
- Final merge or advance of delivered stacked PR slices remains a developer approval step.
- After developer approval of a completed stacked phase, close it with `bun run closeout-stack --plan <plan-path>` rather than manual merge/cherry-pick steps.

- `pr`: if a delivery ticket is clear from branch/docs/diff, use a human-readable Conventional-Commit-style subject plus the active ticket suffix, for example `[P3.02]`. Otherwise omit the suffix.
- Any PR creation or PR-body drafting should follow the same `pr` conventions even when the user did not literally type `pr`.

## Pre-Commit

Before an AI agent creates a commit:

- if it changed files covered by Prettier, run `bun run format` or `bun run format:check` and fix any failures before committing
- if it changed docs, Markdown, config examples, PR text, or other user-facing copy, run `bun run spellcheck` and fix any failures before committing

## Ticket Completion Checklist

Before calling a delivery ticket complete:

- update the delivery ticket doc itself with a `## Rationale` section when the ticket introduces or changes behavior; do not treat PR bodies, review notes, or chat as the source of truth for rationale
- append later non-redundant review, validation, or implementation findings to that same `## Rationale` section instead of creating a parallel rationale artifact
- check whether `README.md` needs an update when user-visible behavior, command surface, or project status changed
- check whether `docs/00-overview/start-here.md` needs an update when a phase or ticket changes delivered scope, current commands, delivered status, or deferrals
- check whether `docs/00-overview/roadmap.md` needs an update when a phase or ticket changes delivered scope, delivered status, active phase state, working notes, or deferrals
- check whether `docs/README.md` needs an update when a new phase plan, delivery doc, or durable doc path was added
- verify the relevant tests or checks for the completed work
