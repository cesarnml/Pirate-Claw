# Start Here

This is the entry point for Son of Anton delivery work. Read this before touching any code.

## Immediate next action

Check your repo's roadmap for the current active phase and its status. The handoff file for the active ticket is at `.agents/delivery/<plan-key>/handoffs/<ticket-id>.md` — that is the required input for resuming in-progress work.

## Four developer control points

Son of Anton enforces four gates per phase. Nothing moves forward without explicit developer approval at each:

1. **Product plan approval** — `/soa plan` + `soa-grill-me` produces `docs/product/plans/phase-N-[slug].md` (the why and what). No decomposition starts until the developer approves this artifact.
2. **Ticket approval** — `/soa decompose` + `soa-grill-me` produces `implementation-plan.md` + ticket files (the how). No branches are created until the developer approves the ticket stack.
3. **Ticket-by-ticket review** — in `gated` mode, the orchestrator stops after each `advance` and prints a canonical resume prompt. Developer reviews the PR and explicitly resumes.
4. **Phase closeout** — stacked PRs are never auto-merged. `bun run closeout-stack --plan <path>` requires explicit developer invocation.

## Starting a new phase

```
Stage 1 — Why and What (/soa plan):
1. /soa plan [description or path]  →  soa-grill-me on product scope
2. Developer approves product plan
3. Commit docs/product/plans/phase-N-[slug].md to main

Stage 2 — How (/soa decompose):
4. /soa decompose [plan path]  →  soa-grill-me on ticket decomposition
5. Developer approves ticket stack
6. Commit implementation-plan.md + all ticket-NN-*.md files to main

Execute:
7. bun run deliver --plan <plan-path> start
```

Both the product plan and implementation docs must be committed to `main` **before** the orchestrator creates any branches.

## Resuming in-progress work

```bash
bun run deliver --plan <plan-path> status        # shows active ticket, current status, and one next command
bun run deliver --plan <plan-path> start         # resume from current ticket
```

Always read the handoff doc at `.agents/delivery/<plan-key>/handoffs/<ticket-id>.md` first.

## Standalone (non-ticketed) PRs

Small bounded changes that don't warrant a full phase (bug fixes, doc updates, cleanup):

```bash
bun run deliver ai-review [--pr <number>]
```

Self-audit is required. `codex-preflight` is optional but recommended for non-trivial changes.

## Key files

| File                                                      | Purpose                                                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `orchestrator.config.json`                                | Runtime config (boundary mode, review policy, package manager)                      |
| `docs/template/delivery/delivery-orchestrator.md`         | Full command reference, including stable workflow-contract and optional-DI guidance |
| `docs/template/delivery/son-of-anton.md`                  | Doctrine: why this workflow exists                                                  |
| `docs/template/delivery/tdd-workflow.md`                  | Red-green-refactor contract for ticket implementation                               |
| `docs/template/delivery/issue-tracking.md`                | Issue sizing and Fibonacci point conventions                                        |
| `docs/template/delivery/phase-implementation-guidance.md` | Implementation plan format contract                                                 |
| `.agents/skills/son-of-anton-ethos/SKILL.md`              | `soa-son-of-anton-ethos` behavioral contract for orchestrated delivery              |
