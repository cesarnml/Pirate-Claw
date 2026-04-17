---
name: closeout-stack
description: Merge a completed stacked PR phase onto main. Use when the developer approves closeout after a multi-ticket delivery is fully reviewed.
---

# Closeout Stack

Merge a completed stacked delivery phase onto `main` after the developer approves all PRs.

## Primary Path

```bash
git checkout main
bun run closeout-stack --plan <plan-path>
```

Processes each ticket in stack order via `git merge --squash` (3-way, robust against parent patches). For each ticket: fetch + reset local `main` to `origin/main`, squash-merge the ticket branch, commit with PR title, push to `origin/main`, close PR, delete remote branch. Produces one squash commit per ticket on `main`.

### Delivery artifact mirror (`state.json`, `reviews/`, `handoffs/`)

Closeout reads `.agents/delivery/<plan-key>/state.json` from the repo you run the command in. The orchestrator only writes delivery artifacts in the **current working directory** where you ran `deliver` — so across a stacked phase, `reviews/` and `handoffs/` files often land in **different ticket worktrees**, not only the last one.

Before `closeout-stack` (or any command you run from the primary checkout), mirror delivery artifacts into that checkout:

- **`state.json`:** copy from the **ticket worktree where the final ticket was advanced to `done`** (or whichever worktree last wrote state). That file is the single control-plane index; earlier worktrees hold stale partial state.
- **`reviews/` and `handoffs/`:** copy **from every ticket worktree** used during the phase into the primary tree’s `.agents/delivery/<plan-key>/`, **merging** into existing `reviews/` and `handoffs/` directories (per-ticket filenames normally do not collide). Goal: **all** review fetch/triage artifacts and **all** handoff markdown files exist on `main`, not only the set generated in the final worktree.

If you skip this, `closeout-stack` may see wrong PR numbers, and the primary checkout loses local review and handoff evidence that never left an older worktree. See `docs/03-engineering/delivery-orchestrator.md` (State file and primary checkout).

Example (adjust paths and plan key):

```bash
mkdir -p .agents/delivery/<plan-key>/reviews .agents/delivery/<plan-key>/handoffs

# Authoritative stack index — from the worktree that completed the last ticket
cp /path/to/final-ticket-worktree/.agents/delivery/<plan-key>/state.json \
   .agents/delivery/<plan-key>/state.json

# Merge every ticket worktree’s reviews and handoffs back to primary
for wt in /path/to/phase-wt-01 /path/to/phase-wt-02 /path/to/phase-wt-NN; do
  cp -R "$wt/.agents/delivery/<plan-key>/reviews/"* .agents/delivery/<plan-key>/reviews/ 2>/dev/null || true
  cp -R "$wt/.agents/delivery/<plan-key>/handoffs/"* .agents/delivery/<plan-key>/handoffs/ 2>/dev/null || true
done
```

After success, clean up:

```bash
git worktree list
git worktree remove <path>   # for each phase worktree
git remote prune origin
```

## Recovery

If closeout fails mid-flight, do not retry. Instead:

1. Check `git log --oneline origin/main` and GitHub PR state to see what merged.
2. `git checkout main && git reset --hard origin/main`
3. For each remaining ticket:
   ```bash
   git fetch origin <ticket-branch>
   git merge --squash origin/<ticket-branch>
   git commit -m "<PR title>"
   git push origin main
   gh pr close <number> --comment "Squash-merged manually" --delete-branch
   ```
4. Confirm `origin/main` has expected squash commits in ticket order.
5. Sync delivery artifacts to the primary `main` checkout: copy **`state.json`** from the worktree that last advanced the stack; **merge** all **`reviews/`** and **`handoffs/`** files from **every** ticket worktree used in the phase so nothing stays stranded off `main`.
6. Write `notes/public/<plan>-retrospective.md` if not already done.

## Key Rules

- Developer must explicitly approve closeout. Never run autonomously.
- Stop and surface merge conflicts to the developer — do not force-resolve.
- Verify the test suite passes on `main` after closeout.
