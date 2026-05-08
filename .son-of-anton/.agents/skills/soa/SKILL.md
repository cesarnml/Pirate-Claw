---
name: soa
description: Son-of-Anton canonical entrypoint. Use for /soa plan, /soa decompose, /soa execute, /soa resume, /soa install, /soa update, /soa closeout, and /soa ideate. Manages installation, updates, and the full delivery lifecycle.
---

# Son-of-Anton Skill

Manages son-of-anton installation, updates, and the full delivery lifecycle.

Public slash-command entrypoint: `/soa`.

## Commands

Dispatch on the first word of `$ARGUMENTS`.

---

### `install`

**Trigger:** `/soa install`

Add son-of-anton to the current repo for the first time:

```bash
git subtree add --prefix .son-of-anton https://github.com/cesarnml/son-of-anton.git main --squash
bash .son-of-anton/scripts/sync-skills.sh
```

If `.son-of-anton` already exists, tell the user to use `update` instead.

`sync-skills.sh` wires the Claude Code adapter as `/soa` plus `soa-*` helper
skills. The prefixed helper names are intentional so existing user skills named
`grill-me`, `pr-review`, `enter-worktree`, etc. are not shadowed.

---

### `update`

**Trigger:** `/soa update`

Pull the latest changes from son-of-anton, then re-sync skill symlinks:

```bash
git subtree pull --prefix .son-of-anton https://github.com/cesarnml/son-of-anton.git main --squash
bash .son-of-anton/scripts/sync-skills.sh
```

Report what changed. If already up to date, say so.

The sync step is required after every update. It refreshes `/soa` and removes
stale `soa-*` helper symlinks before relinking the current helper set.

---

### `ideate`

**Trigger:** `/soa ideate [topic]`

Turn a developer feature ideation storm into one or more draft epic/phase plans.

1. Ask the developer open-ended questions to surface goals, constraints, and unknowns. Be relentless — this is the `soa-grill-me` stage for ideas, not plans.
2. Synthesize the conversation into a concise draft epic/phase summary (title, goal, proposed phases or epics, open questions).
3. **Stop and seek developer approval of the summary before writing any files.**
4. Once approved, write the draft to `docs/template/templates/` or the path the developer specifies.

---

### `plan`

**Trigger:** `/soa plan [path-to-plan or inline description]`

**Output: `docs/product/plans/phase-N.md` only — the "what" and "why". No tickets. No implementation details.**

Take an existing rough plan or roadmap section and run an `soa-grill-me` session scoped to product-level decisions: goals, success criteria, scope, explicit deferrals, and dependencies. The session ends when `docs/product/plans/phase-N.md` is written and approved.

1. Read the plan if a file path is given. Otherwise use the inline description.
2. **Invoke the `soa-grill-me` skill** in **Mode 1 (product plan)** — pass the plan content and instruct it to stay at the product level (scope, goals, success criteria, deferrals, risks). Explicitly tell it: no schema design, no API routes, no ticket breakdown.
3. After `soa-grill-me` closes, write `docs/product/plans/phase-N.md` using the product-plan template at `.son-of-anton/docs/template/templates/product-plan.template.md`.
4. **Hard stop.** Ask the developer to approve the product plan. Do not proceed to tickets.

> The next step after approval is `/soa decompose docs/product/plans/phase-N.md`.

---

### `decompose` (alias: `decomp`, `tickets`)

**Trigger:** `/soa decompose [path]` or `/soa decomp` or `/soa tickets`

**Output: `docs/product/delivery/phase-N/implementation-plan.md` + ticket files — the "how". Requires an approved product plan as input.**

Take the approved `docs/product/plans/phase-N.md` and produce a detailed delivery plan with exact ticket decomposition.

1. Read the product plan at the given path (or ask for it). Refuse to proceed if no approved product plan exists — send the developer to `/soa plan` first.
2. **Invoke the `soa-grill-me` skill** in **Mode 2 (delivery decomposition)** — pass the product plan and focus on: schema/migration strategy, API route structure, ticket granularity, PR slice boundaries, dependency order, test strategy, exit conditions per ticket.
3. **Stop and seek developer approval of the ticket list** before writing files.
4. Once approved, write `docs/product/delivery/phase-N/implementation-plan.md` and individual `ticket-NN-*.md` files per the format in `.son-of-anton/docs/template/templates/ticket.template.md`.

---

### `execute`

**Trigger:** `/soa execute <phase-XX|epic-XX>`

Begin orchestrated delivery of the named phase or epic.

Read these files before doing anything else — they are gospel:

- `.son-of-anton/docs/template/overview/start-here.md`
- `.son-of-anton/docs/template/delivery/delivery-orchestrator.md`
- `.son-of-anton/docs/template/delivery/son-of-anton.md`
- `.son-of-anton/orchestrator.config.json`

Then:

1. Locate the `implementation-plan.md` for the named phase/epic.
2. Identify the first unstarted ticket.
3. Execute via the orchestrator path — **do not ad-hoc implement**.
4. Valid stopping points are defined in `delivery-orchestrator.md` and `orchestrator.config.json`. Respect them.
5. At each stopping point, surface the canonical resume prompt so the developer can continue with `/soa resume`.

---

### `resume`

**Trigger:** `/soa resume <phase-XX|epic-XX>`

Resume delivery after a stopping point.

1. Read `.son-of-anton/docs/template/delivery/delivery-orchestrator.md` and `orchestrator.config.json`.
2. Check `state.json` for the last recorded position, or run `git worktree list` to identify active worktrees.
3. Read the handoff notes from the last stopping point.
4. Continue from exactly where delivery left off — do not restart, do not re-plan.
5. Stick to the orchestrator path as configured.

---

### `closeout` (alias: `closeout-stack`)

**Trigger:** `/soa closeout XX`

Squash-merge a completed stacked PR set onto main.

Run the closeout script:

```bash
bun run .son-of-anton/scripts/closeout-stack.ts
```

Pass any argument (stack name or number) through to the script. Report the result. If the script is not found, tell the user to complete the setup steps in the README.
