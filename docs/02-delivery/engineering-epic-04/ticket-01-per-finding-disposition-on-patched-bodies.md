# EE4.01 — Per-Finding Disposition on Patched PR Bodies

## Goal

When a PR is rendered with `outcome === 'patched'` and the review SHA is stale, the body should show per-finding disposition rows (same format as when the review SHA matches the current head), not a lossy single-line commit bullet.

## Current Behavior

`pr-metadata.ts` prioritizes `buildActionCommitBullets` over `buildResolvedFindingBullets` when action commits are present:

```typescript
if (actionCommitBullets.length > 0) {
  lines.push('', '### Actions Taken', '', ...actionCommitBullets);
} else if (resolvedFindingBullets.length > 0) {
  lines.push('', '### Resolved Review Findings', '', ...resolvedFindingBullets);
}
```

When the review SHA is stale, `effectiveContext === 'history'` inside `buildResolvedFindingBullets`, which suppresses per-finding detail even when thread resolutions are available:

```typescript
const detail =
  comment.isResolved || comment.isOutdated || effectiveContext === 'history'
    ? undefined   // <-- drops detail in history context
    : ...
```

Result: a reviewer sees only the commit one-liner, not the individual findings and their dispositions.

## Target Behavior

When `reviewStatus === 'patched'` and there are finding comments:

- Emit `### Resolved Review Findings` with per-finding rows
- Each row shows: finding summary + disposition (thread resolved / acted on / not resolved)
- If thread resolution data is available for a finding in history context, show it
- Optionally retain `### Actions Taken` below as supplementary, or drop it if findings cover the same information

PR #84's format (which received good reviewer feedback) is the reference: finding bullets with one-line summaries and disposition suffixes.

## Change Surface

- `tools/delivery/pr-metadata.ts`
  - `buildResolvedFindingBullets`: allow thread resolution detail even when `effectiveContext === 'history'`
  - rendering section: prefer findings over commit bullets when `reviewStatus === 'patched'`
- `tools/delivery/orchestrator.test.ts` — update stale-SHA + patched snapshots

## Acceptance Criteria

- [x] `bun run verify && bun run test` pass
- [x] Test case: `patched` + stale SHA + finding comments → `Resolved Review Findings` section with per-finding rows
- [x] Test case: `patched` + stale SHA + thread resolutions → resolution suffix appears in finding rows
- [x] Test case: `patched` + matching SHA (existing behavior) unchanged
- [x] No regression on `clean`, `needs_patch`, `operator_input_needed` outcomes

## Rationale

`buildResolvedFindingBullets` now derives disposition from thread resolution when present, otherwise `patched` for patched outcomes. When the review head is stale and the outcome is `patched`, `### Resolved Review Findings` is emitted instead of `### Actions Taken` so reviewers see per-finding rows rather than a single commit-line substitute.

## Notes

- `effectiveContext === 'history'` currently nullifies all `detail`. The fix should allow detail when `resolution` is present, regardless of context.
- The history-context finding rows may still lack action commit cross-references (commits are listed separately in the current model). That's acceptable.
- Drop `### Actions Taken` when `patched` + stale-SHA and finding comments are present. The commit SHA already appears in the stale-SHA metadata block as `current branch head`.
