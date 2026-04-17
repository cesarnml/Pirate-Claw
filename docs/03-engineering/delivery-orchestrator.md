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
branch, plan-root, runtime-internal, bootstrap defaults, ticket-boundary
behavior, and review policy are not hardcoded:

```json
{
  "defaultBranch": "main",
  "planRoot": "docs",
  "runtime": "bun",
  "packageManager": "bun",
  "ticketBoundaryMode": "cook",
  "reviewPolicy": {
    "selfAudit": "skip_doc_only",
    "codexPreflight": "skip_doc_only",
    "externalReview": "skip_doc_only"
  }
}
```

All fields are optional. When the file is absent, the orchestrator infers sensible defaults:

- `defaultBranch`: `"main"`
- `planRoot`: `"docs"` (plans live at `{planRoot}/02-delivery/<phase>/implementation-plan.md`)
- `runtime`: `"bun"` (`"bun"` uses `Bun.spawnSync`, `"node"` uses `child_process.spawnSync` inside the orchestrator implementation)
- `packageManager`: inferred from lockfile (`bun.lock` → `"bun"`, `pnpm-lock.yaml` → `"pnpm"`, `yarn.lock` → `"yarn"`, `package-lock.json` → `"npm"`, fallback `"npm"`) for worktree bootstrap behavior
- `ticketBoundaryMode`: `"cook"`
- `reviewPolicy.selfAudit`: `"skip_doc_only"`
- `reviewPolicy.codexPreflight`: `"skip_doc_only"`
- `reviewPolicy.externalReview`: `"skip_doc_only"`

Valid `reviewPolicy` stage values are:

- `"required"` — the stage must complete before the workflow can proceed.
- `"skip_doc_only"` — the stage is required for code PRs but automatically skipped for doc-only PRs (PRs whose changed files are all `.md`).
- `"disabled"` — the stage is never run, regardless of PR content.

Invalid values and unknown keys are rejected at config load with a clear error.

Supported `ticketBoundaryMode` values are:

- `cook`
- `gated`
- `glide`

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
- invoking the repo-local `ai-code-review` fetcher and persisting split review artifacts when AI review is detected
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
  - `detected=true`: save `reviews/<ticket>.fetch.json`, then call the triager hook and persist `reviews/<ticket>.triage.json`
  - preserves supported-vendor identity, reviewed head SHA, native thread identity when available, and inline-comment resolution/outdated metadata in the saved fetch artifact
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

For `sonarqube`, the repo-local fetcher reads GitHub check-run annotations rather than native PR review threads and intentionally keeps only failed-check annotations in the normalized fetch artifact. Lower-severity warning annotations remain available in SonarQube itself but do not enter the orchestrator triage loop by default.

The absence of `ai-code-review` comments after the final 12-minute polling check is not itself a blocker. In that case, the orchestrator records the review as `clean`, updates the PR metadata, and continues unless another real ambiguity or prerequisite issue exists.

Doc-only PRs (where the diff touches only `.md` files) skip the review window only when `reviewPolicy.externalReview` is `"skip_doc_only"` (or the stage is fully `"disabled"` for all PRs). External AI agents review code; the developer reads docs. When `open-pr` detects a doc-only diff, it sets a `doc_only` flag in state, and `poll-review` uses the configured policy to decide whether to auto-record `skipped` immediately or wait through the normal review window.

When the triager hook resolves to `clean` or `patched`, `poll-review` records that result immediately. When it resolves to `needs_patch`, the ticket moves into an intermediate `needs_patch` state with the saved fetch/triage artifacts and triage note. From there the follow-up must conclude as either `patched` or `operator_input_needed`. PR body updates remain best-effort in either case.

Review artifact persistence now follows a hard split:

- `reviews/<ticket>.fetch.json` is the only persisted source of normalized vendor review evidence
- `reviews/<ticket>.triage.json` is the only persisted source of repo-local review judgment and triage side effects
- `state.json` stores only compact index/control-plane review fields such as artifact paths, `reviewOutcome`, `reviewRecordedAt`, and optionally `reviewHeadSha`
- no rendered `.txt` review artifact is persisted
- a stable `fetch.json` without `triage.json` is an incomplete internal state and should be surfaced as such rather than treated as a completed review

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

**No read-ahead during the review window.** The agent does nothing while waiting on external AI review. The wait is free (LLM idle during subprocess sleep). Read-ahead during the window burns context that is dead weight at the next ticket boundary. Be sabaai sabaai.

## Ticket Boundary Modes

EE7 makes the ticket-boundary policy explicit.

- `cook`: repo default. `advance` marks the current ticket `done` and
  immediately starts the next pending ticket by reusing the shared `start`
  mechanics. The next worktree, branch, and handoff are created automatically.
- `gated`: `advance` marks the current ticket `done`, stops, and prints reset
  guidance plus a ready-to-paste resume prompt for the next agent session.
  `advance` does **not** create the next handoff or worktree; `start` remains
  the command that initializes the next ticket.
- `glide`: selectable but not fully supported in repo-local code. The
  orchestrator surfaces `glide` as an explicit mode, but today it falls back to
  `gated` because host-driven self-reset is outside the CLI's control.

For `gated`, the canonical resume prompt is:

```text
Immediately execute `bun run deliver --plan <plan> start`, read the generated handoff artifact as the source of truth for context, and implement <next-ticket-id>.
```

Operator reset guidance in `gated` and `glide` fallback:

- prefer `/clear` for minimum token use
- use `/compact` only when intentionally preserving compressed carry-forward
  context

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

The `post-verify-self-audit` command **records** that self-audit mode completed (ticket status, outcome, and timestamp in local delivery state). It does **not** run checks or read the diff; the agent performs verification in build mode and the diff review in self-audit mode, then invokes this command.

The command accepts an optional outcome argument. When the outcome is `patched`,
record one or more patch-commit SHAs so the PR body can link the exact
self-audit follow-up commits:

```bash
bun run deliver --plan <plan> post-verify-self-audit          # defaults to "clean"
bun run deliver --plan <plan> post-verify-self-audit clean    # no changes during self-audit
bun run deliver --plan <plan> post-verify-self-audit patched <sha...>  # self-audit found and fixed issues
```

When omitted, outcome defaults to `clean`. The `status` command renders the outcome alongside the completion timestamp. A recorded self-audit patch commit must use a subject suffix of `[self-audit]`.

**Before `post-verify-self-audit`, confirm at least:**

- The diff matches the ticket and handoff; no unrelated scope crept in.
- Automated verification for this change is green.
- Higher-risk areas changed in the diff (data shape, migrations, auth, API contracts) got a second read in self-audit mode.
- The delivery ticket doc has an updated **Rationale** when behavior or trade-offs changed (repo policy).

Then run `post-verify-self-audit`, then (if Codex preflight is enabled) `codex-preflight`, then `open-pr`. The deprecated alias `internal-review` still works and prints a notice.

## Codex preflight (ticket stacks)

When `reviewPolicy.codexPreflight` is `"required"`, the agent must record a Codex preflight outcome before `open-pr` is allowed for code tickets.

**Role split:**

- **Claude** executes and patches during build and self-audit mode.
- **Codex** reviews the implementation internally via the `codex:rescue` skill — a second AI opinion before the PR is published.
- **External AI vendors** (CodeRabbit, Qodo, Greptile, SonarQube) review post-publication during `poll-review`.

**Running Codex preflight:**

1. Run the Codex review step by invoking the `codex:rescue` skill.
2. Apply any prudent findings.
3. Record the outcome. When the outcome is `patched`, include one or more patch-commit SHAs so the PR body can link the exact Codex follow-up commits:

```bash
bun run deliver --plan <plan> codex-preflight clean    # Codex found nothing worth patching
bun run deliver --plan <plan> codex-preflight patched <sha...>  # Codex findings were applied
```

The CLI is a state recorder only — it does not invoke Codex. The agent runs the Codex skill, then calls this command. A recorded Codex patch commit must use a subject suffix of `[codexPreflight]`.

**Doc-only tickets** auto-skip Codex preflight only when `reviewPolicy.codexPreflight` is `"skip_doc_only"`. The orchestrator detects doc-only by inspecting the local git diff at `codex-preflight` time (all changed files are `.md`) and records `skipped` without requiring an outcome arg. A clear message is printed: "Doc-only ticket — Codex preflight auto-skipped."

When `reviewPolicy.codexPreflight` is `"disabled"`, `open-pr` does not require `codex_preflight_complete` status and tickets at `post_verify_self_audit_complete` may proceed directly to `open-pr`.

If `codex-plugin-cc` is unavailable, set `codexPreflight: "disabled"` in `orchestrator.config.json` to bypass the gate.

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
- `post-verify-self-audit [ticket-id] [clean|patched] [patch-commit-sha ...]` (alias: `internal-review`, deprecated)
- `codex-preflight [clean|patched] [patch-commit-sha ...]`
- `open-pr [ticket-id]`
- `poll-review [ticket-id]`
- `reconcile-late-review <ticket-id>`
- `record-review <ticket-id> <clean|patched|operator_input_needed> [note]`
- `advance`
- `restack [ticket-id]`

Separate post-delivery closeout command:

- `bun run closeout-stack --plan <plan-path>`

## Typical Flow

Default `cook` flow (with repo-default `skip_doc_only` review policy):

```bash
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md start
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md post-verify-self-audit [clean|patched] [patch-commit-sha ...]
# for code tickets, run codex:rescue skill, apply prudent findings, then record:
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md codex-preflight [clean|patched] [patch-commit-sha ...]
# for doc-only tickets under skip_doc_only, codex-preflight auto-records skipped
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md open-pr
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md poll-review
# if the triager hook leaves the ticket in needs_patch, follow up and then record the final outcome
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md record-review P2.02 patched "patched the two actionable correctness issues"
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md advance
```

With `codexPreflight: "required"` in `orchestrator.config.json`, add the Codex preflight step after self-audit:

```bash
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md start
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md post-verify-self-audit [clean|patched] [patch-commit-sha ...]
# run codex:rescue skill, apply prudent findings, then record:
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md codex-preflight [clean|patched] [patch-commit-sha ...]
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md open-pr
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md poll-review
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md advance
```

`gated` flow:

```bash
bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md advance
# reset context now; prefer /clear and use /compact only when compressed carry-forward is intentional
# next agent session prompt:
# Immediately execute `bun run deliver --plan docs/02-delivery/phase-02/implementation-plan.md start`, read the generated handoff artifact as the source of truth for context, and implement P2.03.
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

For standalone PRs, the internal review contract is behavior-first, not state-recorded:

- implement
- verify
- self-audit the diff and risky areas
- for non-trivial code changes, run `codex:rescue` informally before `ai-review`
- run standalone `ai-review` as the orchestrator-visible external review gate

In standalone mode, `selfAudit` and `codexPreflight` are expected preflight discipline, not orchestrator gates. The orchestrator can tell the agent to do them, but without standalone state it cannot verify, audit, or block on them. Only standalone `ai-review` is an orchestrator-visible gate today.

The ticket-only commands `post-verify-self-audit`, `codex-preflight`, `open-pr`, `poll-review`, `record-review`, and `advance` do not apply to standalone PRs because there is no ticket state to update. That architectural constraint does not remove the underlying review discipline; it does mean the self-audit and optional Codex pass remain guided discretion in standalone mode rather than durable workflow state.

If standalone delivery ever needs true self-audit or Codex gate semantics, add a lightweight standalone state artifact first. Do not present soft preflight discipline as a hard gate without durable evidence.

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

The orchestrator writes `state.json` **only in the repo directory where you run `deliver`** (the current working directory). If you use **one ticket worktree per ticket** and a **separate `main` clone** for `closeout-stack` or other commands, the `main` checkout’s delivery tree does **not** update automatically.

Fetched review artifacts under `reviews/` and generated handoff artifacts under `handoffs/` are written under the **same** path relative to the worktree where each command ran. Across a stacked phase, that means files are often **spread across multiple ticket worktrees** — the final worktree is **not** guaranteed to contain every `reviews/<ticket>-*.json` or `handoffs/<ticket>-handoff.md` produced earlier.

**Recommendation:**

- After each successful `advance`, refresh the **primary / `main` checkout** so tooling run from `main` stays aligned with reality.
- Copy **`state.json`** from the worktree where that advance just ran (only that file carries the authoritative stack index: PR numbers, branch names, ticket statuses).
- **Merge** **`reviews/`** and **`handoffs/`** from that same worktree into the primary checkout (per-ticket filenames normally do not collide). Periodically — and **always before `closeout-stack`** if you did not mirror after every ticket — walk **every** ticket worktree for the plan and copy any missing `reviews/*` and `handoffs/*` into primary so **all** local review and handoff evidence lives under the primary `.agents/delivery/<plan-key>/`, not stranded in an older worktree.

Example (adjust paths and plan key; `final-wt` is the worktree that completed the last ticket):

```bash
mkdir -p /path/to/main-clone/.agents/delivery/<plan-key>/reviews \
         /path/to/main-clone/.agents/delivery/<plan-key>/handoffs

cp /path/to/final-wt/.agents/delivery/<plan-key>/state.json \
   /path/to/main-clone/.agents/delivery/<plan-key>/state.json

for wt in /path/to/phase-wt-01 /path/to/phase-wt-02 /path/to/phase-wt-NN; do
  cp -R "$wt/.agents/delivery/<plan-key>/reviews/"* \
        /path/to/main-clone/.agents/delivery/<plan-key>/reviews/ 2>/dev/null || true
  cp -R "$wt/.agents/delivery/<plan-key>/handoffs/"* \
        /path/to/main-clone/.agents/delivery/<plan-key>/handoffs/ 2>/dev/null || true
done
```

**Stance:** Treat each **ticket worktree** as authoritative for the commands you run inside it; treat the **primary `main` copy** as the **aggregate mirror** — especially for `reviews/` and `handoffs/`, which must be **reconciled across all worktrees**, not only copied from the latest one. Until the orchestrator gains an explicit “mirror delivery artifacts to path” option, this manual merge is the reliable fix for stale or incomplete delivery state on `main`.

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
- `advance` refreshes the PR body from recorded review state, marks the ticket done, then applies the configured `ticketBoundaryMode`
- in `cook`, `advance` auto-starts the next pending ticket and prints the next handoff path
- in `gated`, `advance` stops and prints reset guidance plus the canonical resume prompt; `start` still owns next-ticket handoff creation
- in `glide`, `advance` currently falls back explicitly to `gated`
- `start` (zero-arg) finds the next pending ticket, creates its worktree and branch, writes its handoff, and prints the handoff path; explicit `start <ticket-id>` form is unchanged

This matters because the repo squash-merges PRs onto `main`, so the PR body needs to mention prudent ai-cr follow-up work before the stack moves on.
