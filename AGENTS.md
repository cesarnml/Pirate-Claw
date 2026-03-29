# Repository Instructions

These instructions override broader personal defaults for this repository.

## Merge Titles

For squash merges, use:

- `type: summary [P1.01]`

More generally, when a PR is clearly tied to a delivery ticket, append the ticket id in square brackets at the end of the squash merge title, for example:

- `feat: add CLI config loading [P1.01]`
- `fix: handle config flag errors [P1.01]`

## `pr`

When generating PR content for outstanding changes:

- If the branch, docs, or diff clearly indicate a delivery ticket, include the ticket id suffix in the Conventional-Commit-style PR title.
- Use the format `type: summary [P1.01]`.
- If the ticket is not clear from local context, omit the suffix rather than guessing.
