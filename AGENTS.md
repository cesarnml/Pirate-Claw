# Repo Rules

- For phase work, first read `docs/00-overview/start-here.md` and `docs/03-engineering/delivery-orchestrator.md`, then surface the orchestrator path before coding.
- The delivery orchestrator reads `orchestrator.config.json` at the repo root for default branch, plan root, runtime internals, and package-manager-aware bootstrap defaults. See `docs/03-engineering/delivery-orchestrator.md` for field details and scope.
- Prefer `bun run deliver --plan ...` over ad hoc implementation. In this repo, `bun run deliver` remains the supported operator entrypoint even though the orchestrator internals are more configurable.
- For orchestrated ticket work, the handoff under `.agents/delivery/<plan-key>/handoffs/` is required input alongside the plan and ticket docs.
- `begin phase` / `implement phase` means run the stacked-ticket workflow until blocked, not just the first ticket.
- Phase flow: implement, verify, push/open PR, run the configured `ai-code-review` polling window, patch prudent findings if any appear, refresh PR state, then advance.
- No `ai-code-review` feedback by the final polling check is not a blocker; record `clean` and continue unless real ambiguity or actionable feedback exists.
- During external waits, read-ahead into the next ticket, handoff, and adjacent seams is encouraged. Do not write ahead until the current ticket is cleared.
- Stop only for unsafe work, missing prerequisites, ambiguous review triage, orchestrator blockage, or explicit user interruption.

- `pr`: if a delivery ticket is clear from branch/docs/diff, use a human-readable Conventional-Commit-style subject plus the active ticket suffix, for example `[P3.02]`. Otherwise omit the suffix.
- Any PR creation or PR-body drafting should follow the same `pr` conventions even when the user did not literally type `pr`.

## Ticket Completion Checklist

Before calling a delivery ticket complete:

- update or add the ticket rationale note when the ticket introduces or changes behavior
- update `README.md` when user-visible behavior, command surface, or project status changed
- update `docs/00-overview/start-here.md` and `docs/00-overview/roadmap.md` when a phase/ticket changes delivered scope, current commands, or deferrals
- verify the relevant tests or checks for the completed work
