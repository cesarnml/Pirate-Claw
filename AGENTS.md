# Repo Rules

- `pr`: if a delivery ticket is clear from branch/docs/diff, use `type: summary [P1.01]`. Otherwise omit the suffix.

## Codex Workflow Defaults

- on a fresh worktree, if `package.json` and `bun.lock` exist and `node_modules` is missing, run `bun install` before deeper repo work
- before any `git push`, run `bun run verify` when that script exists and fix failures locally before retrying the push

## Ticket Completion Checklist

Before calling a delivery ticket complete:

- update or add the ticket rationale note when the ticket introduces or changes behavior
- update `README.md` when user-visible behavior, command surface, or project status changed
- verify the relevant tests or checks for the completed work
