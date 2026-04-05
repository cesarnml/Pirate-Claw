# Delivery Orchestrator

This repo now includes a small repo-local delivery orchestrator for stacked ticket work.

## Stance

The orchestrator is repo tooling, not app runtime code.

That means:

- the engine lives under `tools/`
- the command wrapper lives under `scripts/`
- tests for the engine live with the tooling code, not with app tests

This keeps the product boundary honest. `src/` remains the Pirate Claw application. The delivery tool is a maintainer workflow helper.

## Configurable Core

The orchestrator core now reads `orchestrator.config.json` at the repo root so branch, plan-root, runtime-internal, and bootstrap defaults are not hardcoded:

```json
{
  "defaultBranch": "main",
  "planRoot": "docs",
  "runtime": "bun",
  "packageManager": "bun"
}
```

All fields are optional. When the file is absent, the orchestrator infers sensible defaults:

- `defaultBranch`: `"main"`
- `planRoot`: `"docs"` (plans live at `{planRoot}/02-delivery/<phase>/implementation-plan.md`)
- `runtime`: `"bun"` (`"bun"` uses `Bun.spawnSync`, `"node"` uses `child_process.spawnSync` inside the orchestrator implementation)
- `packageManager`: inferred from lockfile (`bun.lock` → `"bun"`, `pnpm-lock.yaml` → `"pnpm"`, `yarn.lock` → `"yarn"`, `package-lock.json` → `"npm"`, fallback `"npm"`) for worktree bootstrap behavior

The internal convention below `planRoot` is fixed: `{planRoot}/02-delivery/<phase>/implementation-plan.md`. Only the top-level directory name is configurable.

In Pirate Claw itself, the supported operator entrypoint remains `bun run deliver --plan ...`. This change makes the orchestrator core less repo-specific, but it does not turn this repository into a fully validated multi-runtime CLI package.

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
- durable local state under `.agents/delivery/<plan-key>/`
- per-ticket handoff artifacts under `.agents/delivery/<plan-key>/handoffs/`
- deterministic branch and worktree naming
- copying a local `.env` into fresh ticket work trees when the invoking worktree has one
- bootstrapping fresh ticket work trees using lockfile-aware package-manager defaults before implementation starts
- stacked PR base chaining
- idempotent PR open/update behavior for already-pushed ticket branches
- a 2/4/6/8-minute ai-review polling loop after PR open
- invoking the repo-local `ai-code-review` fetcher and persisting structured `json` plus rendered `txt` artifacts when AI review is detected
- optional Telegram milestone notifications for long-running delivery runs
- blocking advancement until review has been explicitly recorded or auto-recorded as `clean` after the final polling check
- refreshing the current PR body from recorded ai-cr follow-up notes immediately before advancing to the next ticket
- resolving native GitHub inline review threads for patched AI-review findings when the saved review artifact exposes a resolvable thread identity

It does **not** own AI-review detection heuristics or triage judgment.

That boundary is intentional. The repo-local `ai-code-review` skill under `.agents/skills/ai-code-review/` already defines the repo stance for AI review:

- comments are advisory, not gospel
- weak or mis-scoped comments should be pushed back on
- only prudent, concrete fixes should be patched

So the orchestrator only consumes the skill hook contracts:

- fetcher:
  - `detected=false`: keep polling, or auto-record `clean` on the final check
  - `detected=true`: save structured and rendered artifacts, then call the triager hook
  - preserves vendor identity, reviewed head SHA, native thread identity when available, and inline-comment resolution/outdated metadata in the saved `json` artifact
- triager:
  - returns `clean`, `needs_patch`, or `patched`
  - returns the final note plus concise action and non-action summaries
  - may be overridden with `AI_CODE_REVIEW_TRIAGER` without changing orchestrator code

The absence of `ai-code-review` comments after the final 8-minute polling check is not itself a blocker. In that case, the orchestrator records the review as `clean`, updates the PR metadata, and continues unless another real ambiguity or prerequisite issue exists.

When the triager hook resolves to `clean` or `patched`, `poll-review` records that result immediately. When it resolves to `needs_patch`, the ticket moves into an intermediate `needs_patch` state with the saved artifacts and triage note. From there the follow-up must conclude as either `patched` or `operator_input_needed`. PR body updates remain best-effort in either case.

## Ticket Context Reset

The orchestrator also owns the repo-side context reset contract for stacked ticket work.

When a ticket starts, the orchestrator writes a handoff artifact under:

- `.agents/delivery/<plan-key>/handoffs/`

That handoff is the narrow context that the next ticket worker should begin from alongside the current repo state and required docs.

The handoff includes:

- the phase plan path
- the current ticket id, title, branch, base branch, and worktree path
- the required docs to re-read before implementation
- prior ticket PR and review metadata when there is a previous ticket
- explicit stop conditions for when the worker should pause instead of widening scope

This does not automatically create a brand-new agent session, but it is the current repo mechanism for reducing reasoning carryover between tickets while preserving stacked branch continuity.

During external waits such as AI-review windows, the worker may read ahead into the next ticket, handoff, and adjacent seams to prepare the next slice. That read-ahead must not turn into write-ahead; implementation for the next ticket still starts only after the current ticket is cleared.

That policy applies only to ticket-linked delivery PRs. Standalone manual `ai-review` runs for non-ticket PRs do not have a next-ticket boundary, so there is no analogous look-ahead rule there.

## Existing Phase 02 Work

Phase 02 was already processed once through a more brittle route before this tool existed.

To avoid pretending that work never happened, `sync` can infer progress from the repo when the local state file is absent:

- if a ticket branch exists and the next ticket branch also exists, the earlier ticket is inferred as `done`
- if a ticket branch exists and has an open PR but no next branch yet, it is inferred as `in_review`
- if a ticket branch exists without a PR, it is inferred as `in_progress`
- otherwise it remains `pending`

That inference is intentionally conservative. It reconstructs enough state to resume a stacked phase without requiring a fresh restart.

## Commands

Use the supported repo command:

```bash
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md status
```

Available commands:

- `sync`
- `status`
- `repair-state`
- `ai-review [--pr <number>]`
- `start [ticket-id]`
- `internal-review [ticket-id]`
- `open-pr [ticket-id]`
- `poll-review [ticket-id]`
- `record-review <ticket-id> <clean|patched|operator_input_needed> [note]`
- `advance [--no-start-next]`
- `restack [ticket-id]`

## Typical Flow

```bash
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md start
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md internal-review
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md open-pr
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md poll-review
# if the triager hook leaves the ticket in needs_patch, follow up and then record the final outcome
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md record-review P2.02 patched "patched the two actionable correctness issues"
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md advance
```

For a non-ticket PR, run the manual standalone path:

```bash
bun run deliver ai-review
# or: bun run deliver ai-review --pr 32
```

At each ticket boundary, read the generated handoff artifact before continuing implementation.

After implementation and verification, record the internal polish pass with `internal-review` before opening a substantial ticket-linked PR. After `open-pr`, the orchestrator should surface the ai-review polling cadence and check timestamps. `poll-review` checks at 2, 4, 6, and 8 minutes after PR open, waits for all detected review agents to become triage-ready, performs one final bounded check when review is still clearly in flight, writes `json` and `txt` artifacts, runs the triager hook, and otherwise auto-records `clean` at the final applicable check.

If a parent ticket was squash-merged onto `main`, run:

```bash
bun run deliver restack
```

from the current child ticket worktree before continuing review. `restack` infers the delivery plan and current ticket from the checked-out branch, fetches `origin`, rebases away the old parent ancestry, and updates the open PR base/body so GitHub review follows the new stack shape. If branch inference is ambiguous, pass `--plan` explicitly.

If local state drifts from repo reality, use `repair-state` to snapshot the stale state file, rebuild clean state from current repo facts, and print the repaired fields before resuming delivery.

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

- `.agents/delivery/<plan-key>/reviews/`

Generated handoff artifacts are written under:

- `.agents/delivery/<plan-key>/handoffs/`

State is written under:

- `.agents/delivery/<plan-key>/state.json`

## PR Body Maintenance

PR descriptions are maintained as delivery metadata, not one-shot text.

- `open-pr` creates the initial PR body
- `open-pr` uses a human-readable Conventional-Commit-style title plus the delivery ticket suffix, for example `feat: add torrent lifecycle reconciliation [P3.02]`
- rerunning `open-pr` refreshes the existing PR title/body instead of failing on an already-open branch
- `record-review` stores the triage result and optional note
- `record-review ... patched` also makes a best-effort attempt to resolve mapped native GitHub inline review threads for patched findings
- `poll-review` auto-records `clean` when no `ai-code-review` feedback is detected by the final check and refreshes the PR body immediately
- PR-body AI-review notes now distinguish current-head review from stale-history review when the reviewed SHA no longer matches the branch head
- `advance` refreshes the PR body from that recorded review state, then marks the ticket done and optionally starts the next one

This matters because the repo squash-merges PRs onto `main`, so the PR body needs to mention prudent ai-cr follow-up work before the stack moves on.
