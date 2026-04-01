# Repo Rules

- If the user asks to begin a phase, implement a phase, start a ticket, or continue planned delivery work, first read `docs/00-overview/start-here.md` and `docs/03-engineering/delivery-orchestrator.md`, then surface the repo delivery/orchestration path before coding.
- For planned phase work in this repo, prefer the delivery orchestrator as the default workflow entrypoint rather than bypassing it with ad hoc implementation.
- For orchestrated ticket work, treat the generated handoff artifact under `.codex/delivery/<plan-key>/handoffs/` as required input alongside the plan and ticket docs before implementing.
- If the user says `begin phase`, `implement phase`, or equivalent, interpret that as a request to run the full orchestrated stacked-ticket workflow for that phase until blocked, not as a request to stop after the first completed ticket.
- For phase delivery, do not stop at a completed ticket if the orchestrator can continue. Implement the ticket, verify it, push/open the PR, wait for the configured `qodo-code-review` window, patch prudent review findings if any appear, refresh the PR state, then advance to the next ticket branch/worktree.
- The lack of `qodo-code-review` feedback after the configured wait window is not a blocker by itself. Record the review as `clean` and continue unless real ambiguity or actionable feedback exists.
- Stop only when the current ticket cannot be completed safely, a prerequisite is missing, review triage is ambiguous enough to require user input, the orchestrator cannot advance cleanly, or the user explicitly interrupts the phase run.

- `pr`: if a delivery ticket is clear from branch/docs/diff, use a human-readable Conventional-Commit-style subject plus the active delivery ticket suffix, for example `[P3.02]`. Otherwise omit the suffix.
- Any PR creation or PR-body drafting should follow the same `pr` shortcut conventions even when the user did not literally type `pr`.

## Ticket Completion Checklist

Before calling a delivery ticket complete:

- update or add the ticket rationale note when the ticket introduces or changes behavior
- update `README.md` when user-visible behavior, command surface, or project status changed
- verify the relevant tests or checks for the completed work
