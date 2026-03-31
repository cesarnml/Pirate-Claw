# Phase 02 Orchestrator

This repo now includes a small phase-delivery orchestrator for stacked Phase 02 work.

## Why It Exists

The product code can be implemented ticket by ticket, but the delivery process around that work is repetitive and easy to get wrong:

- finding the next unfinished ticket
- creating the right branch and worktree
- targeting each PR at the previous ticket branch instead of `main`
- waiting long enough for `qodo-code-review` feedback to land
- refusing to advance until the current review loop is actually complete

The orchestrator keeps that process state in one durable local file instead of leaving it implicit in chat history.

## Scope

The orchestrator owns process mechanics:

- next-ticket discovery from the committed Phase 02 implementation plan
- durable local state in `.codex/phase02/state.json`
- worktree creation and branch naming
- stacked PR base chaining
- a 5-minute wait before review fetch
- saving raw `qodo-code-review` output into `.codex/phase02/reviews/`
- blocking advancement until review has been explicitly recorded

The orchestrator does **not** own AI-review judgment.

That boundary is intentional. The existing `qodo-code-review` skill already defines the repo's ai-cr stance:

- AI comments are advisory, not gospel
- low-signal or mis-scoped comments should be pushed back on
- only prudent, concrete fixes should be applied

So the script fetches review output, but it does not decide what to patch. A human or agent should use the skill to triage the fetched output, then record the result.

## Commands

Run the orchestrator with:

```bash
bun run phase02 <command>
```

Available commands:

- `sync`
  Refresh local state from `docs/02-delivery/phase-02/implementation-plan.md`.
- `status`
  Show the current tracked state for each Phase 02 ticket.
- `start [ticket-id]`
  Create the next worktree and branch, or resume the named ticket.
- `open-pr [ticket-id]`
  Push the current branch and open a stacked PR against the previous ticket branch.
- `fetch-review [ticket-id]`
  Wait up to 5 minutes from PR creation, then fetch `qodo-code-review` output into a local artifact.
- `record-review <ticket-id> <clean|needs_patch|patched> [note]`
  Record the triage result after using the review skill.
- `advance [--no-start-next]`
  Mark the reviewed ticket done, then optionally start the next pending ticket.

## Review Hook

`fetch-review` looks for a fetch helper in this order:

1. `QODO_REVIEW_FETCHER`
2. `$CODEX_HOME/skills/qodo-pr-review/scripts/fetch_qodo_pr_comments.sh`
3. `~/.codex/skills/qodo-pr-review/scripts/fetch_qodo_pr_comments.sh`

The fetched output is written to:

- `.codex/phase02/reviews/<ticket-id>-qodo.txt`

That artifact is meant to be read and triaged through the skill-driven review workflow, not blindly acted on by the script.

## Typical Flow

```bash
bun run phase02 start
bun run phase02 open-pr
bun run phase02 fetch-review
# use the qodo-code-review skill to triage the saved review artifact
bun run phase02 record-review P2.02 patched "patched the two actionable correctness issues"
bun run phase02 advance
```

## Design Notes

- The state file is local and ignored because it is runtime coordination state, not product source.
- The ticket list is regenerated from the committed plan so the process remains anchored to repo docs.
- The orchestrator is intentionally narrow. It is not a project management system.
