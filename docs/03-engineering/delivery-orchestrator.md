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

The orchestrator core now reads `orchestrator.config.json` at the repo root so
branch, plan-root, runtime-internal, bootstrap defaults, and repo review policy
are not hardcoded:

```json
{
  "defaultBranch": "main",
  "planRoot": "docs",
  "runtime": "bun",
  "packageManager": "bun",
  "reviewPolicy": {
    "selfAudit": "required",
    "codexPreflight": "required",
    "externalReview": "required"
  }
}
```

All fields are optional. When the file is absent, the orchestrator infers sensible defaults:

- `defaultBranch`: `"main"`
- `planRoot`: `"docs"` (plans live at `{planRoot}/02-delivery/<phase>/implementation-plan.md`)
- `runtime`: `"bun"` (`"bun"` uses `Bun.spawnSync`, `"node"` uses `child_process.spawnSync` inside the orchestrator implementation)
- `packageManager`: inferred from lockfile (`bun.lock` → `"bun"`, `pnpm-lock.yaml` → `"pnpm"`, `yarn.lock` → `"yarn"`, `package-lock.json` → `"npm"`, fallback `"npm"`) for worktree bootstrap behavior
- `reviewPolicy.selfAudit`: `"required"`
- `reviewPolicy.codexPreflight`: `"required"`
- `reviewPolicy.externalReview`: `"required"`

Review-policy stages use explicit values rather than booleans so delivery state
and status output can distinguish a required gate, a doc-only skip, and a
repo-disabled stage. Supported values are:

- `required`
- `skip_doc_only`
- `disabled`

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
- copying a local `.env` into fresh ticket worktrees when the invoking worktree has one
- bootstrapping fresh ticket worktrees using lockfile-aware package-manager defaults before implementation starts
- stacked PR base chaining
- idempotent PR open/update behavior for already-pushed ticket branches
- a 6/12-minute AI-review polling loop after PR open (two checkpoints: 6 minutes and 12 minutes)
- invoking the repo-local `ai-code-review` fetcher and persisting structured JSON plus rendered text artifacts when AI review is detected
- optional Telegram milestone notifications for long-running delivery runs
- blocking advancement until review is explicitly recorded or auto-recorded as `clean` after the final polling check
- refreshing the current PR body from recorded follow-up notes immediately before advancing to the next ticket
- resolving native GitHub inline review threads for patched AI-review findings when the saved artifact exposes a resolvable thread identity
- sharing ticket-linked and standalone post-PR review handling through common lifecycle helpers for detected-review processing, clean/timeout recording, metadata refresh, and final persistence

The orchestrator does **not** own AI-review detection heuristics or triage judgment.

That boundary is intentional. The repo-local `ai-code-review` skill under `.agents/skills/ai-code-review/` already defines the repo stance for AI review:

- comments are advisory, not gospel
- weak or mis-scoped comments should be pushed back on
- only prudent, concrete fixes should be patched

So the orchestrator only consumes the skill hook contracts:

- fetcher:
  - `detected=false`: keep polling, or auto-record `clean` on the final check
  - `detected=true`: save structured and rendered artifacts, then call the triager hook
  - preserves supported-vendor identity, reviewed head SHA, native thread identity when available, and inline-comment resolution/outdated metadata in the saved `json` artifact
- triager:
  - returns `clean`, `needs_patch`, or `patched`
  - returns the final note plus concise action and non-action summaries
  - may be overridden with `AI_CODE_REVIEW_TRIAGER` without changing orchestrator code

In this repo, supported external AI-review vendors are currently:

- `coderabbit`
- `qodo`
- `greptile`
- `sonarqube`

Other vendors are out of scope unless the repo-local `ai-code-review` skill is deliberately expanded.

For `sonarqube`, the repo-local fetcher reads GitHub check-run annotations rather than native PR review threads and intentionally keeps only failed-check annotations in the normalized artifact. Lower-severity warning annotations remain available in SonarQube itself but do not enter the orchestrator triage loop by default.

The absence of `ai-code-review` comments after the final 12-minute polling check is not itself a blocker. In that case, the orchestrator records the review as `clean`, updates the PR metadata, and continues unless another real ambiguity or prerequisite issue exists.

Doc-only PRs (where the diff touches only `.md` files) skip the review window entirely. External AI agents review code; the developer reads docs. When `open-pr` detects a doc-only diff, it sets a `doc_only` flag in state and `poll-review` auto-records `clean` immediately without waiting.

When the triager hook resolves to `clean` or `patched`, `poll-review` records that result immediately. When it resolves to `needs_patch`, the ticket moves into an intermediate `needs_patch` state with the saved artifacts and triage note. From there the follow-up must conclude as either `patched` or `operator_input_needed`. PR body updates remain best-effort in either case.

At this point in the repo, `poll-review`, `record-review`, and standalone `ai-review` are intentionally thin mode-specific shells around the same post-PR lifecycle helpers. Ticket-linked flow still owns stacked state transitions and standalone flow still owns PR discovery plus author-body preservation, but the semantic review handling between those edges is shared.

### Late review reconcile (`done` tickets)

`poll-review` only targets tickets in **`in_review`**. After a ticket is **`done`**, use **`reconcile-late-review <ticket-id>`** when external AI review comments arrived late and you want to re-fetch, re-run the repo triager, persist updated artifacts under the plan reviews directory, refresh delivery state (while keeping the ticket **`done`**), and refresh the PR body (best-effort).

Run it from a worktree where `.agents/delivery/<plan-key>/state.json` for that plan is authoritative (this repo does not discover state across worktrees for you). The ticket must still have a stored **`prNumber`**. The command uses a short single-interval poll so the first check runs immediately; re-run if vendors are still in flight.

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

**No read-ahead during the review window.** The agent does nothing while waiting on external AI review. The wait is free (LLM idle during subprocess sleep). Read-ahead during the window burns context that is dead weight when the agent compacts at the next ticket boundary. Be sabaai sabaai.

**Context compaction at every ticket boundary.** `advance` marks the current ticket done and emits `compaction_required=true` plus a directive to call `/compact`. It does **not** start the next ticket. After compacting, call `start` (zero-arg) to initialize the next ticket's worktree, branch, and handoff — then read the handoff path from the `start` output. The handoff artifact plus the `modified_sections` field gives the resuming context everything it needs; nothing else from prior ticket history is load-bearing.

**Handoff artifact `modified_sections`.** The handoff now includes a `## Modified Sections` block extracted from the ticket's `## Scope` section. Read only the file sections listed there — do not re-read full files. This keeps per-ticket context bounded as implementation files grow across the phase.

That policy applies only to ticket-linked delivery PRs. Standalone manual `ai-review` runs for non-ticket PRs do not have a next-ticket boundary, so there is no analogous look-ahead rule there.

## Existing Phase 02 Work

Phase 02 was already processed once through a more brittle route before this tool existed.

To avoid pretending that work never happened, `sync` can infer progress from the repo when the local state file is absent:

- if a ticket branch exists and the next ticket branch also exists, the earlier ticket is inferred as `done`
- if a ticket branch exists and has an open PR but no next branch yet, it is inferred as `in_review`
- if a ticket branch exists without a PR, it is inferred as `in_progress`
- otherwise it remains `pending`

That inference is intentionally conservative. It reconstructs enough state to resume a stacked phase without requiring a fresh restart.

## Post-verify self-audit (ticket stacks)

After **build mode** (implementation and automated verification, for example `bun run verify:quiet` and any scoped tests the ticket implies), the agent switches to **self-audit mode**: a deliberate pass over the diff and ticket acceptance before publishing the branch for external AI code review. Stay in the same implementation session—this is a mode switch, not a handoff.

The `post-verify-self-audit` command **records** that self-audit mode completed (ticket status and timestamp in local delivery state). It does **not** run checks or read the diff; the agent performs verification in build mode and the diff review in self-audit mode, then invokes this command.

**Before `post-verify-self-audit`, confirm at least:**

- The diff matches the ticket and handoff; no unrelated scope crept in.
- Automated verification for this change is green.
- Higher-risk areas changed in the diff (data shape, migrations, auth, API contracts) got a second read in self-audit mode.
- The delivery ticket doc has an updated **Rationale** when behavior or trade-offs changed (repo policy).

Then run `post-verify-self-audit`, then `open-pr`. The deprecated alias `internal-review` still works and prints a notice.

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
- `post-verify-self-audit [ticket-id]` (alias: `internal-review`, deprecated)
- `open-pr [ticket-id]`
- `poll-review [ticket-id]`
- `reconcile-late-review <ticket-id>`
- `record-review <ticket-id> <clean|patched|operator_input_needed> [note]`
- `advance`
- `restack [ticket-id]`

Separate post-delivery closeout command:

- `bun run closeout-stack --plan <plan-path>`

## Typical Flow

```bash
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md start
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md post-verify-self-audit
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md open-pr
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md poll-review
# if the triager hook leaves the ticket in needs_patch, follow up and then record the final outcome
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md record-review P2.02 patched "patched the two actionable correctness issues"
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md advance
# /compact  ← compact conversation context here before starting the next ticket
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md start
```

After the developer has reviewed the full stacked PR chain and is ready to merge it, use:

```bash
bun run closeout-stack --plan docs/02-delivery/phase-02/implementation-plan.md
```

`closeout-stack` is intentionally separate from `deliver`. It handles stacked PR merge choreography rather than ticket implementation state: for each reviewed slice in ticket order, it runs `git merge --squash` locally (a 3-way merge, robust against parent-branch patches), commits with the PR title, pushes to `main`, closes the PR, and deletes the remote branch. This produces one squash commit per ticket on `main` without rebasing child branches.

For a non-ticket PR, run the manual standalone path:

```bash
bun run deliver ai-review
# or: bun run deliver ai-review --pr 32
```

At each ticket boundary, read the generated handoff artifact before continuing implementation.

After implementation and verification in build mode, use `bun run verify:quiet` rather than `bun run verify` to suppress passing output and show only failures. Complete **self-audit mode** (see above), then record it with `post-verify-self-audit` before opening a substantial ticket-linked PR. After `open-pr`, the orchestrator surfaces the ai-review polling cadence and check timestamps. `poll-review` checks at 6 and 12 minutes after PR open; doc-only PRs (diff touches only `.md` files) skip the window and auto-record `clean`. At the 6-minute check, the orchestrator advances immediately if all detected external review agents have finished their run (including agents that report clean). Otherwise it waits for the 12-minute final check. Do nothing during the review window — no file reads, no ticket prep. The wait is free. `poll-review` writes `json` and `txt` artifacts and runs the triager hook. When findings are detected, `poll-review` output includes a condensed findings block — `[vendor] path:line — title` per actionable finding — so the implementing agent can triage and patch without reading the full `.txt` artifact. `poll-review` otherwise auto-records `clean` at the final check. After `advance`, call `/compact`, then call `start` to initialize the next ticket.

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

### State file and primary checkout (multi-worktree)

The orchestrator writes `state.json` **only in the repo directory where you run `deliver`** (the current working directory). If you use a **ticket worktree** for day-to-day delivery and a **separate `main` clone** for `closeout-stack` or other commands, the `main` checkout’s `state.json` does **not** update automatically.

**Recommendation:** After each successful `advance` (ticket moves to `done`), copy the worktree’s `state.json` to the same relative path in your **primary / `main` checkout** so that copy always reflects the latest stack (PR numbers, branch names, completed tickets). That keeps `closeout-stack` and any tooling you run from `main` aligned with reality.

Example (adjust paths to your layout):

```bash
cp /path/to/ticket-worktree/.agents/delivery/<plan-key>/state.json \
   /path/to/main-clone/.agents/delivery/<plan-key>/state.json
```

**Stance:** Treat the **active delivery worktree** as authoritative while you work; treat the **primary `main` copy** as the **mirror** you refresh after each advance. Until the orchestrator gains an explicit “mirror state to path” option, this manual copy is the reliable fix for stale `state.json` on `main` and avoids guessing wrong PRs during closeout.

## PR Body Maintenance

PR descriptions are maintained as delivery metadata, not one-shot text.

- `open-pr` creates the initial PR body
- `open-pr` uses a human-readable Conventional-Commit-style title plus the delivery ticket suffix, for example `feat: add torrent lifecycle reconciliation [P3.02]`
- rerunning `open-pr` refreshes the existing PR title/body instead of failing on an already-open branch
- `record-review` stores the triage result and optional note
- `record-review ... patched` also makes a best-effort attempt to resolve mapped native GitHub inline review threads for patched findings
- `poll-review` auto-records `clean` when no `ai-code-review` feedback is detected by the final check and refreshes the PR body immediately
- PR-body AI-review notes now distinguish current-head review from stale-history review when the reviewed SHA no longer matches the branch head
- ticket-linked and standalone PR refreshes now share the same reviewer-facing external-review section builder, metadata-refresh adapter, and command-layer persistence helpers while preserving their intentionally different outer PR-body shapes
- `advance` refreshes the PR body from that recorded review state, marks the ticket done, emits `compaction_required=true`, and stops — it does not start the next ticket
- `start` (zero-arg) finds the next pending ticket, creates its worktree and branch, writes its handoff, and prints the handoff path; explicit `start <ticket-id>` form is unchanged

This matters because the repo squash-merges PRs onto `main`, so the PR body needs to mention prudent ai-cr follow-up work before the stack moves on.
