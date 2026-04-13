# Engineering Epic 09: Review Policy Enforcement and Doc-Only Consolidation

## Overview

EE8 introduced the `reviewPolicy` config object with three stage keys
(`selfAudit`, `codexPreflight`, `externalReview`) and three valid values
(`required`, `skip_doc_only`, `disabled`). Two gaps were identified in the EE8
retrospective:

1. **`skip_doc_only` is a dead config value.** It is parsed and stored but
   never branched on in behavior. The doc-only skips in `codex-preflight` and
   `poll-review` are hardcoded regardless of policy, making `required` and
   `skip_doc_only` behaviorally identical for doc-only tickets.

2. **Doc-only detection has two independent code paths.** `codex-preflight`
   computes doc-only via a local `git diff` inline in the command handler.
   `open-pr` computes it via `isPrDocOnly`, which calls `gh pr diff` — a
   different data source that adds a network dependency and silently returns
   `false` on any failure. The two paths can diverge silently if either caller
   is updated independently.

EE9 closes both gaps. It consolidates doc-only detection into a single utility,
wires `skip_doc_only` into real behavior across all three stage handlers, adds
`'skipped'` to `ReviewOutcome` so doc-only self-audit is observable, and changes
the defaults to `skip_doc_only` for all three stages.

## Context

The EE8 retro noted:

> If starting EE8 again, the doc-only detection path would be designed as a
> single function called from both `codex-preflight` and `open-pr`, not
> duplicated per command.

> The `syncStateWithPlan(undefined, ...)` vs `syncStateWithPlan(existing, ...)`
> distinction is meaningful but invisible at the call site.

EE9 addresses all three retro follow-up items: doc-only consolidation,
`syncStateWithPlan` call-site clarity, and review policy wiring.

## Design Decisions

### Doc-only detection: local git diff only

Both callers switch to `git diff origin/<baseBranch>...HEAD --name-only`. The
`gh pr diff` approach is removed. In Son-of-Anton operation, the agent always
pushes before `open-pr` runs, so the local diff and the GitHub diff are
identical. The local diff is faster, has no network dependency, and cannot fail
silently.

The new utility is `isLocalBranchDocOnly(cwd, baseBranch, runtime): boolean`
in `platform.ts`. `isPrDocOnly` is deleted.

### `ReviewOutcome` gains `'skipped'`

`selfAudit: "skip_doc_only"` auto-records a `skipped` outcome for doc-only
tickets. Recording `'clean'` when no audit happened is a lie in the state file.
`'skipped'` is already precedented in `CodexPreflightOutcome`.

### Policy semantics

| Value           | Behavior                                                          |
| --------------- | ----------------------------------------------------------------- |
| `required`      | Stage must complete. No auto-skip, even for doc-only tickets.     |
| `skip_doc_only` | Stage auto-skips for doc-only tickets. Required for code tickets. |
| `disabled`      | Stage never enforced. Auto-records clean/skipped immediately.     |

### `post-verify-self-audit` auto-skip

When `selfAudit: "skip_doc_only"` and the ticket is doc-only, `post-verify-self-audit`
auto-records `selfAuditOutcome: 'skipped'` without requiring an outcome arg from
the agent. The agent still calls the command explicitly — the skip happens inside
the command, not via an `open-pr` pre-flight. Son-of-Anton skill guidance is
updated to reflect this.

At `post-verify-self-audit` time, `ticket.docOnly` is not yet set (it is written
by `codex-preflight` and `open-pr`, which run later). The command detects
doc-only via `isLocalBranchDocOnly` directly.

### `open-pr` gate for `skip_doc_only`

The gate extends from `=== 'required'` to `=== 'required' || === 'skip_doc_only'`.
It does not consult `ticket.docOnly` at gate time. The Son-of-Anton skill ensures
`codex-preflight` runs before `open-pr`; for doc-only tickets under `skip_doc_only`
policy, `codex-preflight` auto-advances the ticket to `codex_preflight_complete`
before `open-pr` is reached, so the gate never fires for doc-only tickets in
normal operation.

### `poll-review` restructured logic

```
if disabled → record clean immediately (all tickets)
if skip_doc_only && docOnly → record clean immediately
otherwise → real review window
```

### Default change

All three defaults change from `required`/`disabled`/`required` to `skip_doc_only`.
This reflects the intended operational stance: stages run for code tickets,
auto-skip for doc-only tickets, with no operator configuration required.

### `syncStateWithPlan` wrappers

Two thin named wrappers replace the ambiguous `undefined` vs `existing` first
argument at all call sites:

- `syncStateFromScratch(...)` — fresh init, no existing state
- `syncStateFromExisting(existing, ...)` — reconcile with existing persisted state

## Ticket Order

1. `EE9.01` — Doc-only detection consolidation
2. `EE9.02` — `syncStateWithPlan` call-site clarity
3. `EE9.03` — Review policy enforcement and defaults

## Exit Condition

`skip_doc_only` behaves as documented: stages auto-skip for doc-only tickets and
are enforced for code tickets. `required` is honored even for doc-only tickets.
Doc-only detection uses a single utility called from both `codex-preflight` and
`open-pr`. Defaults are `skip_doc_only` for all three stages. `syncStateWithPlan`
call sites are self-documenting. Son-of-Anton guidance reflects the new behavior.
