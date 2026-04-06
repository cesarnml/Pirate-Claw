# Repo Rules

- For phase work, first read `docs/00-overview/start-here.md` and `docs/03-engineering/delivery-orchestrator.md`, then surface the orchestrator path before coding.
- For new product feature-set expansion, phase shaping, or epic decomposition work, start in Plan Mode and use `grill-me` before accepting a plan or ticket breakdown. In this repo, son-of-anton treats developer engagement in ideation, decomposition approval, and final delivered-slice approval as required control points rather than optional ceremony.
- The delivery orchestrator reads `orchestrator.config.json` at the repo root for default branch, plan root, runtime internals, and package-manager-aware bootstrap defaults. See `docs/03-engineering/delivery-orchestrator.md` for field details and scope.
- Prefer `bun run deliver --plan ...` over ad hoc implementation. In this repo, `bun run deliver` remains the supported operator entrypoint even though the orchestrator internals are more configurable.
- For orchestrated ticket work, the handoff under `.agents/delivery/<plan-key>/handoffs/` is required input alongside the plan and ticket docs.
- If the user asks to implement, start, begin, run, or resume a phase or epic, treat that as a full orchestrated delivery request and keep advancing ticket-by-ticket until blocked or the user narrows scope; do not reduce it to a single ticket just because of the verb used.
- Do not start implementing a new product phase/epic until the developer has reviewed and approved the delivery decomposition into thin, reviewable tickets.
- If asked to implement a new product phase/epic without a Plan Mode pass plus approved ticket decomposition, do not begin implementation. Explain the missing control point, point to the required planning docs, and stop. This is a soft refusal rule for product-scope expansion, not a ban on small docs-only or tooling-only follow-ups that do not expand the product surface.
- Not every product-surface change needs a new phase/epic. Smaller bounded implementation changes may still proceed as standalone PR work. When they do, use the orchestrator's standalone `ai-review` path instead of the ticketed stacked flow.
- `begin phase` / `implement phase` means run the stacked-ticket workflow until blocked, not just the first ticket.
- Phase flow: implement, verify, push/open PR, run the configured `ai-code-review` polling window, patch prudent findings if any appear, refresh PR state, then advance.
- No `ai-code-review` feedback by the final polling check is not a blocker. Record `clean` only when no actionable feedback was found during the review window. If actionable feedback was found and prudently fixed, preserve `patched` as the final outcome; do not downgrade `patched` to `clean` just because later polling is quiet.
- During external waits, read-ahead into the next ticket, handoff, and adjacent seams is encouraged. Do not write ahead until the current ticket is cleared.
- Stop only for unsafe work, missing prerequisites, ambiguous review triage, orchestrator blockage, or explicit user interruption.
- Final merge or advance of delivered stacked PR slices remains a developer approval step.
- After developer approval of a completed stacked phase, close it with `bun run stacked-closeout --plan <plan-path>` rather than manual squash-merge/rebase/retarget steps.

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
