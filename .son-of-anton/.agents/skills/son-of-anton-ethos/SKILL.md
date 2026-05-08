---
name: soa-son-of-anton-ethos
description: Execute approved multi-ticket phase/epic work or standalone (non-ticketed) PR delivery through the repo orchestrator with strong continuation bias. Use automatically when a user asks to execute, begin, start, deliver, implement, continue, resume, run, drive, carry, or work on a phase, epic, or standalone PR, or explicitly mentions son of anton or son-of-anton ethos.
---

# Son Of Anton Ethos

**Before executing a single command:** Read `docs/template/delivery/delivery-orchestrator.md` in full. Every orchestrator action — for both ticket stacks (`start`, `post-verify`, `subagent-review`, `open-pr`, `poll-review`, `record-review`, `advance`) and standalone PRs (`ai-review`) — is defined there with exact sequencing and policy. That document is the authoritative command surface. Your own reasoning about what the flow "probably" is does not override it.

Son of Anton drives approved work to completion. How ticket boundaries are handled is governed by `ticketBoundaryMode` in `orchestrator.config.json`. The orchestrator does not seek repeated permission between tickets — but it honors the boundary contract precisely as configured.

---

## Standalone PRs

1. **Entrypoint.** Use `bun run deliver`.
2. **When to use.** Smaller bounded changes ship as standalone PRs without a new phase/epic. Use `bun run deliver ai-review [--pr <number>]` — not the ticketed stacked flow (`--plan …`, `poll-review`, `advance`, etc.).
3. **Review discipline.** Complete implement → fast verification (`bun run verify:quiet` + scoped tests as needed) → final publication gate (`bun run ci:quiet` for non-doc code changes) → named self-audit (re-read diff, second-pass risky areas). Standalone PRs do not use the ticket-only `post-verify` or `subagent-review` recorders because the flow is stateless, so these remain expected preflight behaviors rather than orchestrator-enforced gates.
   - Self-audit is required for every standalone PR.
   - For non-trivial code changes, invoke `codex:codex-rescue` via the Agent tool (subagent_type: "codex:codex-rescue") before `ai-review`; doc-only or genuinely trivial changes may skip it.
   - Standalone `ai-review` is the only orchestrator-visible review gate on this path.
   - If the change needs recorded self-audit / Codex gates to feel safe, it likely should not stay a standalone PR unless the repo first adds lightweight standalone review state.
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

1. Re-read required repo docs at each ticket boundary. For ticket `01`, use the implementation plan, the ticket doc, and current repo state as the initial handoff context; for later tickets, re-read the handoff artifact materialized into the started ticket worktree as the source of truth.
2. Use the supported orchestrator path, not ad hoc manual substitutes.
3. Move one ticket at a time in order.
4. For each ticket:
   1. Implement
   2. Build / verify — use the repo's fast verify command for the inner loop, then the full CI command before `open-pr` on code tickets
   3. Update ticket rationale for behavior or tradeoff changes
   4. Self-audit — `post-verify [clean|patched]`
      - Under `subagentReview: "skip_doc_only"`: doc-only tickets auto-record `skipped`
      - Under `subagentReview: "required"`: doc-only tickets still need an explicit `clean` or `patched`
   5. Subagent review — if `subagentReview` is not `"disabled"` (see [Subagent Review](#subagent-review))
   6. Open / refresh PR — `open-pr`
   7. Run AI-review polling — `poll-review` (see [External Review](#external-review))
   8. Patch prudent findings
   9. Record review — `record-review` (**skip** when `poll-review` already auto-recorded `clean` or `skipped`; only needed when `poll-review` leaves ticket in `needs_patch` state)
   10. Advance — `advance`
5. During the external review window, stay idle.
6. Do not write ahead across ticket boundaries.
7. After `advance`, follow the active boundary mode and keep going without asking for permission unless a real blocker exists.

### Ticket Boundary Modes

Treat `ticketBoundaryMode` in `orchestrator.config.json` as the contract for ticket-boundary behavior.

- `cook`: default Son-of-Anton path. `advance` immediately starts the next ticket. Read the handoff materialized into the started worktree and continue.
- `gated`: `advance` stops, tells the operator to reset context, and prints the canonical resume prompt for the next agent session. Prefer `/clear`; use `/compact` only when compressed carry-forward context is intentional.
- `glide`: reserved/unimplemented — currently falls back to `gated` in repo-local code. Do not assume self-reset capability.

Canonical `gated` resume prompt:

`Immediately execute \`bun run deliver --plan <plan> start\`, read the locally materialized handoff artifact in the started worktree as the source of truth for context, and implement <next-ticket-id>.`

**After `advance` in `gated` mode, you must echo the resume prompt as the final human-visible output — not buried in CLI output, not paraphrased.** Format it exactly like this, substituting the real plan path and next ticket id:

```
P<N>.<NN> is done. PR: <url>

Reset context (/clear), then resume with:

/soa resume phase-<NN>
```

### Subagent Review

**Role split:**

- **Primary agent** executes and patches (build mode and post-verify).
- **Review subagent** (configured via `reviewSubagentOverride`, e.g. `"codex:codex-rescue"`) reviews and patches its own findings autonomously — a second AI pass before the PR is published. The primary agent does not triage subagent output; the subagent acts on what it finds.
- **External AI vendors** (e.g. CodeRabbit, Qodo) review post-publication via `poll-review`.

**When `subagentReview` is `"required"`:**

1. Invoke the review subagent via the Agent tool using the `reviewSubagentOverride` value (e.g. `subagent_type: "codex:codex-rescue"`). The subagent will patch what it finds autonomously.
2. **Stay idle. No read-ahead.** Wait for the subagent to complete before doing anything else — same discipline as the external review window.
3. Record: `bun run deliver --plan <plan> subagent-review [clean|patched]`

The CLI is a state recorder only — never invoke the subagent from within the CLI.

**Subagent scope contract:** The review subagent reviews and patches implementation code only. Ticket doc files under `docs/product/delivery/` — including `## Rationale` sections written during implementation — are part of the ticket deliverable and must not be reverted by the subagent. Brief the subagent to skip ticket doc files when invoking it.

**When `subagentReview` is `"skip_doc_only"`** (repo default): code tickets still require the subagent step before `open-pr`; doc-only tickets auto-record `skipped`.

**When `subagentReview` is `"disabled"`**: skip the step entirely.

If the configured subagent is unavailable, set `subagentReview: "disabled"` in `orchestrator.config.json` to bypass the gate.

---

## External Review

Applies to both standalone PRs (`ai-review`) and ticket stacks (`poll-review`). The review signals and triage rules are the same; only the CLI command differs.

### Signals

- **Inline review threads** are the signal for CodeRabbit and Greptile. Their summary PR comments are orchestration noise — ignore them.
- **Qodo** posts a single actionable PR comment with all findings — treat it as actionable when present.
- **SonarQube** posts a Quality Gate summary PR comment; check-run annotations are secondary signal.

For ticket stacks, the orchestrator persists vendor evidence in `reviews/<ticket>.fetch.json` and repo-local judgment in `reviews/<ticket>.triage.json`. `state.json` is only an index into those artifacts, not the source of truth for comment payloads.

### Outcome Recording

Record `clean` only when no actionable feedback found. Record `patched` when actionable feedback was prudently fixed. Do not downgrade `patched` to `clean` because later polling is quiet.

### Docs-Only PRs

With the repo default `skip_doc_only` policy, doc-only tickets skip the external review window and record `skipped` immediately. When a stage is `required`, doc-only tickets wait/run like code tickets.

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

Write the retrospective to `notes/public/<plan-path>-retrospective.md` using the `soa-write-retrospective` skill at `.agents/skills/write-retrospective/SKILL.md` for section structure and placement conventions.
