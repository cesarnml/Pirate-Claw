---
name: son-of-anton-ethos
description: Execute approved multi-ticket phase/epic work or standalone (non-ticketed) PR delivery through the repo orchestrator with strong continuation bias. Use automatically when a user asks to execute, begin, start, deliver, implement, continue, resume, run, drive, carry, or work on a phase, epic, or standalone PR, or explicitly mentions son of anton or son-of-anton ethos.
---

# Son Of Anton Ethos

Son of Anton drives approved work to completion. How ticket boundaries are handled is governed by `ticketBoundaryMode` in `orchestrator.config.json`. The orchestrator does not seek repeated permission between tickets — but it honors the boundary contract precisely as configured.

---

## Standalone PRs

1. **Entrypoint.** Use `bun run deliver`. Read `docs/03-engineering/delivery-orchestrator.md` for command surface — not ad hoc substitutes.
2. **When to use.** Smaller bounded changes ship as standalone PRs without a new phase/epic. Use `bun run deliver ai-review [--pr <number>]` — not the ticketed stacked flow (`--plan …`, `poll-review`, `advance`, etc.).
3. **Review discipline.** Complete implement → verify (`bun run verify` + scoped tests) → named self-audit (re-read diff, second-pass risky areas). Standalone PRs do not use the ticket-only `post-verify-self-audit` or `codex-preflight` recorders because the flow is stateless, but the review behaviors still apply.
   - Self-audit is required for every standalone PR.
   - For non-trivial code changes, run `codex:rescue` informally before `ai-review`; doc-only or genuinely trivial changes may skip it.
   - If the change needs recorded self-audit / Codex gates to feel safe, it likely should not stay a standalone PR.
4. **Running `ai-review`.** Uses real wall-clock polling. Surface that before starting; do not hide the time cost.
5. **Commits.** Follow AGENTS Pre-Commit (Prettier for touched files; spellcheck when docs or user-facing copy changed).
6. **Product-scope gates** apply to new phase/epic work — not to standalone PRs already allowed outside a new phase.

---

## Phase / Epic Delivery

### Core Stance

Treat the whole approved phase or epic as the unit of work — not a single ticket unless the user explicitly narrows scope.

When the user asks to execute, begin, start, deliver, implement, continue, resume, run, drive, carry, or work on a phase, that is standing approval to advance ticket-by-ticket without re-invocation between tickets.

**Expected completion state:** every ticket reaches `done` and the developer receives a final summary.

These are normal milestones, not permission checkpoints: one ticket implemented, one PR opened, one review window finished, a natural checkpoint, elapsed time. The workflow is not complete until the full stack is done or a repo-valid stop condition applies.

### Pre-Flight Sequencing

Commit the delivery plan and all ticket docs to the default branch before creating any ticket branches or worktrees. Ticket worktrees depend on those docs at creation time.

### Required Behavior

1. Re-read required repo docs and handoff artifacts at each ticket boundary.
2. Use the supported orchestrator path, not ad hoc manual substitutes.
3. Move one ticket at a time in order.
4. For each ticket:
   1. Implement
   2. Verify — `bun run verify` + scoped tests
   3. Update ticket rationale for behavior or tradeoff changes
   4. Self-audit — `post-verify-self-audit [clean|patched]`
      - Under `selfAudit: "skip_doc_only"`: doc-only tickets auto-record `skipped`
      - Under `selfAudit: "required"`: doc-only tickets still need an explicit `clean` or `patched`
   5. Codex preflight — if `codexPreflight` is not `"disabled"` (see [Codex Preflight](#codex-preflight))
   6. Open / refresh PR — `open-pr`
   7. Run AI-review polling — `poll-review` (see [External Review](#external-review))
   8. Patch prudent findings
   9. Record review — `record-review`
   10. Advance — `advance`
5. During the external review window, stay idle.
6. Do not write ahead across ticket boundaries.
7. After `advance`, follow the active boundary mode and keep going without asking for permission unless a real blocker exists.

### Ticket Boundary Modes

Treat `ticketBoundaryMode` in `orchestrator.config.json` as the contract for ticket-boundary behavior.

- `cook`: default Son-of-Anton path. `advance` immediately starts the next ticket. Read the generated handoff and continue.
- `gated`: `advance` stops, tells the operator to reset context, and prints the canonical resume prompt for the next agent session. Prefer `/clear`; use `/compact` only when compressed carry-forward context is intentional.
- `glide`: reserved/unimplemented — currently falls back to `gated` in repo-local code. Do not assume self-reset capability.

Canonical `gated` resume prompt:

`Immediately execute \`bun run deliver --plan <plan> start\`, read the generated handoff artifact as the source of truth for context, and implement <next-ticket-id>.`

### Codex Preflight

**Role split:**

- **Claude** executes and patches (build mode and self-audit).
- **Codex** reviews internally via the `codex:rescue` skill — a second AI opinion before the PR is published.
- **External AI vendors** (CodeRabbit, Qodo, Greptile, SonarQube) review post-publication via `poll-review`.

**When `codexPreflight` is `"required"`:**

1. Run the `codex:rescue` skill.
2. Apply prudent findings.
3. Record: `bun run deliver --plan <plan> codex-preflight [clean|patched]`

The CLI is a state recorder only — never invoke Codex from within the CLI.

**When `codexPreflight` is `"skip_doc_only"`** (repo default): code tickets still require the Codex step before `open-pr`; doc-only tickets auto-record `skipped`.

**When `codexPreflight` is `"disabled"`**: skip the step entirely.

If `codex-plugin-cc` is unavailable, set `codexPreflight: "disabled"` in `orchestrator.config.json` to bypass the gate.

---

## External Review

Applies to both standalone PRs (`ai-review`) and ticket stacks (`poll-review`). The review signals and triage rules are the same; only the CLI command differs.

### Signals

- **Inline review threads** are the signal for CodeRabbit and Greptile. Their summary PR comments are orchestration noise — ignore them.
- **Qodo** posts a single actionable PR comment with all findings — treat it as actionable when present.
- **SonarQube** posts a Quality Gate summary PR comment; check-run annotations are secondary signal.

For ticket stacks, the orchestrator's `reviewComments` in state is the source of truth for triage. Do not re-read the full `.txt` artifact unless you need prose context not in the condensed findings block.

### Outcome Recording

Record `clean` only when no actionable feedback found. Record `patched` when actionable feedback was prudently fixed. Do not downgrade `patched` to `clean` because later polling is quiet.

### Docs-Only PRs

With the repo default `skip_doc_only` policy, doc-only tickets skip the external review window and record `clean` immediately. When a stage is `required`, doc-only tickets wait/run like code tickets.

---

## Stop Conditions

Stop only for: unsafe work, missing prerequisites not resolvable from repo context, ambiguous review triage genuinely needing developer judgment, broken delivery state that cannot be prudently repaired, an explicit documented control point, or explicit user interruption.

If none of those are true, continue.

## Anti-Pattern

Do not use these as stopping points for approved stacked delivery:

- returning control after one ticket with "I finished the current ticket"
- treating an open PR as completion
- treating a running or clean review as completion
- pausing to ask whether to continue when no stop condition exists
- offering a mid-run progress summary and waiting for acknowledgment

## Response Rule

If blocked, report: the exact ticket, the exact blocker, the exact repo policy reason that forced the stop. Send a Telegram notification with that info and a link to the relevant doc.

If not blocked, keep executing.

## On Phase or Epic Completion

Write the retrospective to `notes/public/<plan-path>-retrospective.md` using `.agents/skills/write-retrospective/SKILL.md` for section structure and placement conventions.
