# Delivery Orchestrator

This repo now includes a small repo-local delivery orchestrator for stacked ticket work.

## Stance

The orchestrator is repo tooling, not app runtime code.

That means:

- the engine lives under `tools/`
- the command wrapper lives under `scripts/`
- tests for the engine live with the tooling code, not with app tests

This keeps the product boundary honest. `src/` remains the Pirate Claw application. The delivery tool is a maintainer workflow helper.

## Plan-Driven, Not Phase-Hardcoded

The engine is generic. It does not fundamentally belong to Phase 02.

What is phase-specific is:

- which implementation plan to read
- where local state and review artifacts are stored
- which ticket IDs, titles, and files exist in that plan

So the orchestrator takes a plan path:

- `--plan docs/02-delivery/phase-02/implementation-plan.md`

That is the canonical interface. The tool is primarily AI-facing, so the explicit plan artifact is more important than a phase nickname.

## What It Owns

The orchestrator owns process mechanics:

- reading ticket order from the plan
- durable local state under `.codex/delivery/<plan-key>/`
- per-ticket handoff artifacts under `.codex/delivery/<plan-key>/handoffs/`
- deterministic branch and worktree naming
- bootstrapping fresh Bun ticket work trees before implementation starts
- stacked PR base chaining
- idempotent PR open/update behavior for already-pushed ticket branches
- a 5-minute review wait before fetch
- saving raw `qodo-code-review` output locally
- optional Telegram milestone notifications for long-running delivery runs
- blocking advancement until review has been explicitly recorded
- refreshing the current PR body from recorded ai-cr follow-up notes immediately before advancing to the next ticket

It does **not** own AI-review judgment.

That boundary is intentional. The `qodo-code-review` skill already defines the repo stance for AI review:

- comments are advisory, not gospel
- weak or mis-scoped comments should be pushed back on
- only prudent, concrete fixes should be patched

So the script fetches and stores review output, but humans or agents still use the skill to decide whether a comment matters.

The absence of `qodo-code-review` comments after the configured wait window is not itself a blocker. In that case, record the review as `clean` and continue unless another real ambiguity or prerequisite issue exists.

When ai-cr triage leads to prudent branch changes, the orchestrator updates the PR body as the final step of `advance`. That timing is intentional: the PR description should reflect the exact branch state that is being handed off before the next ticket starts.

## Ticket Context Reset

The orchestrator also owns the repo-side context reset contract for stacked ticket work.

When a ticket starts, the orchestrator writes a handoff artifact under:

- `.codex/delivery/<plan-key>/handoffs/`

That handoff is the narrow context that the next ticket worker should begin from alongside the current repo state and required docs.

The handoff includes:

- the phase plan path
- the current ticket id, title, branch, base branch, and worktree path
- the required docs to re-read before implementation
- prior ticket PR and review metadata when there is a previous ticket
- explicit stop conditions for when the worker should pause instead of widening scope

This does not automatically create a brand-new Codex thread, but it is the current repo mechanism for reducing reasoning carryover between tickets while preserving stacked branch continuity.

## Existing Phase 02 Work

Phase 02 was already processed once through a more brittle route before this tool existed.

To avoid pretending that work never happened, `sync` can infer progress from the repo when the local state file is absent:

- if a ticket branch exists and the next ticket branch also exists, the earlier ticket is inferred as `done`
- if a ticket branch exists and has an open PR but no next branch yet, it is inferred as `in_review`
- if a ticket branch exists without a PR, it is inferred as `in_progress`
- otherwise it remains `pending`

That inference is intentionally conservative. It reconstructs enough state to resume a stacked phase without requiring a fresh restart.

## Commands

Use the generic command:

```bash
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md status
```

Available commands:

- `sync`
- `status`
- `start [ticket-id]`
- `open-pr [ticket-id]`
- `fetch-review [ticket-id]`
- `record-review <ticket-id> <clean|needs_patch|patched> [note]`
- `advance [--no-start-next]`
- `restack [ticket-id]`

## Typical Flow

```bash
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md start
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md open-pr
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md fetch-review
# use the qodo-code-review skill to triage the saved review artifact
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md record-review P2.02 patched "patched the two actionable correctness issues"
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md advance
```

At each ticket boundary, read the generated handoff artifact before continuing implementation.

After `open-pr`, the orchestrator should surface the review wait window and the earliest meaningful review-fetch time. An immediate lack of AI comments is informational only; the decisive check happens after that window elapses.

If a parent ticket was squash-merged onto `main`, run:

```bash
bun run deliver restack
```

from the current child ticket worktree before continuing review. `restack` infers the delivery plan and current ticket from the checked-out branch, fetches `origin`, rebases away the old parent ancestry, and updates the open PR base/body so GitHub review follows the new stack shape. If branch inference is ambiguous, pass `--plan` explicitly.

## Optional Telegram Notifications

The orchestrator can emit best-effort Telegram notifications for milestone events such as:

- ticket started
- PR opened
- review window ready
- review recorded
- ticket completed
- run blocked

Notifications are optional and advisory. They must never block orchestrator progress if delivery to Telegram fails.

Enable them with:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

When those env vars are absent, the notifier stays disabled and the orchestrator behaves normally.

## Review Artifact Location

Fetched review output is written under:

- `.codex/delivery/<plan-key>/reviews/`

Generated handoff artifacts are written under:

- `.codex/delivery/<plan-key>/handoffs/`

State is written under:

- `.codex/delivery/<plan-key>/state.json`

## PR Body Maintenance

PR descriptions are maintained as delivery metadata, not one-shot text.

- `open-pr` creates the initial PR body
- `open-pr` uses a human-readable Conventional-Commit-style title plus the delivery ticket suffix, for example `feat: add torrent lifecycle reconciliation [P3.02]`
- rerunning `open-pr` refreshes the existing PR title/body instead of failing on an already-open branch
- `record-review` stores the triage result and optional note
- `advance` refreshes the PR body from that recorded review state, then marks the ticket done and optionally starts the next one

This matters because the repo squash-merges PRs onto `main`, so the PR body needs to mention prudent ai-cr follow-up work before the stack moves on.
