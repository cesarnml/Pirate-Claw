# Repo Rules

- If the user asks to begin a phase, implement a phase, start a ticket, or continue planned delivery work, first read `docs/00-overview/start-here.md` and `docs/03-engineering/delivery-orchestrator.md`, then surface the repo delivery/orchestration path before coding.
- For planned phase work in this repo, prefer the delivery orchestrator as the default workflow entrypoint rather than bypassing it with ad hoc implementation.
- When working from a phase plan, stop at the current ticket boundary unless the user explicitly asks to continue to the next ticket.

- `pr`: if a delivery ticket is clear from branch/docs/diff, use `type: summary [P1.01]`. Otherwise omit the suffix.

## Ticket Completion Checklist

Before calling a delivery ticket complete:

- update or add the ticket rationale note when the ticket introduces or changes behavior
- update `README.md` when user-visible behavior, command surface, or project status changed
- verify the relevant tests or checks for the completed work
