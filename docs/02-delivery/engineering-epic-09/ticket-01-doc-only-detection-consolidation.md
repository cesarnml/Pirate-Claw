# EE9.01 — Doc-Only Detection Consolidation

## Goal

Replace the two independent doc-only detection paths with a single utility,
`isLocalBranchDocOnly`, called from both `codex-preflight` and `open-pr`.
Delete `isPrDocOnly`.

## Current Behavior

Doc-only detection exists in two places using different data sources:

- **`codex-preflight` case** (`orchestrator.ts`): inline `git diff origin/<baseBranch>...HEAD --name-only`. Returns doc-only if all changed files end in `.md`. Correct but inlined — not reusable.
- **`open-pr` path** (`orchestrator.ts` → `platform.ts#isPrDocOnly`): calls `gh pr diff <number> --name-only`. Uses the GitHub API rather than local git. Silent `false` on any error (network failure, missing auth, GitHub rate limit). Behaviorally equivalent under Son-of-Anton operation, but a different code path that can diverge.

If either caller is updated independently (e.g., the `.md` extension check
changes in one but not the other), they silently disagree.

## Target Behavior

A single utility in `platform.ts`:

```ts
export function isLocalBranchDocOnly(
  cwd: string,
  baseBranch: string,
  runtime: Runtime,
): boolean;
```

- Runs `git diff origin/<baseBranch>...HEAD --name-only`
- Returns `true` iff the diff is non-empty and every changed file ends in `.md`
- Returns `false` on any process failure (same safe-fail behavior as `isPrDocOnly`)

Both callers use this utility:

- `codex-preflight` case replaces its inline diff logic with a call to `isLocalBranchDocOnly`
- `open-pr` path replaces `isPlatformPrDocOnly` with `isLocalBranchDocOnly` (passing `reviewTicket.baseBranch` instead of `reviewTicket.prNumber`)

`isPrDocOnly` is deleted from `platform.ts`. The import alias `isPlatformPrDocOnly`
in `orchestrator.ts` is removed.

## Change Surface

- `tools/delivery/platform.ts` (add `isLocalBranchDocOnly`, delete `isPrDocOnly`)
- `tools/delivery/orchestrator.ts` (update import, replace inline diff + `isPlatformPrDocOnly` call)

## Acceptance Criteria

- [ ] `isLocalBranchDocOnly(cwd, baseBranch, runtime)` exists in `platform.ts`
- [ ] Returns `true` iff diff is non-empty and all files end in `.md`
- [ ] Returns `false` on process failure
- [ ] `codex-preflight` command handler calls `isLocalBranchDocOnly` instead of inline diff
- [ ] `open-pr` path calls `isLocalBranchDocOnly` instead of `isPlatformPrDocOnly`
- [ ] `isPrDocOnly` is deleted from `platform.ts`
- [ ] No import of `isPrDocOnly` or `isPlatformPrDocOnly` remains in `orchestrator.ts`
- [ ] Existing behavior of both callers is unchanged

## Tests

No new unit tests. `isLocalBranchDocOnly` is platform I/O — it requires a real
git repo with an `origin` remote, which the existing test structure does not mock
at this level. This is the same accepted tradeoff documented for `isPrDocOnly` in
the EE5 retrospective.

Regression: run the full test suite to confirm no existing tests break.

## Rationale

Son-of-Anton always pushes before `open-pr` runs. The local `git diff` and `gh pr
diff` produce identical file lists in normal operation. The local diff is faster,
has no network dependency, and cannot silently return `false` due to auth failures.
Using the local diff for both callers eliminates the divergence risk with no
behavioral change.

## Notes

- `EE9.03` depends on this ticket. `post-verify-self-audit` auto-skip (when
  `selfAudit: "skip_doc_only"`) calls `isLocalBranchDocOnly` at
  `post-verify-self-audit` time — before `ticket.docOnly` is set. The utility
  must exist in `platform.ts` before `EE9.03` is implemented.
- This ticket is a behavior change for `open-pr`: switches from `gh pr diff` to
  `git diff`. The behavior change is correct and intentional.
- The `docOnly` flag on `TicketState` is not touched in this ticket. It remains
  set by `open-pr` and `codex-preflight` as before.
