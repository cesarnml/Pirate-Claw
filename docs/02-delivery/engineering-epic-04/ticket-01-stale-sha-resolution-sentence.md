# EE4.01 — Stale-SHA Resolution Sentence

## Goal

When a PR body is rendered with a stale-SHA notice and the review outcome is `patched`, append a resolution sentence so reviewers know the findings were addressed.

## Current Behavior

`pr-metadata.ts` emits this when `reviewedHeadSha !== currentHeadSha`:

```
- the latest recorded external AI review applies to an older branch head; the prior review history is shown below for debugging.
```

There is no follow-up confirming whether the findings were addressed.

## Target Behavior

When the above condition is true AND `reviewStatus === 'patched'`, append:

```
- patch commits after `<shortenedReviewedHeadSha>` address all findings from that review.
```

(Exact wording TBD during implementation — the key constraint is that the sentence must not claim false certainty when no action commits or thread resolutions are present.)

## Change Surface

- `tools/delivery/pr-metadata.ts` — `buildReviewStatusSection` (or equivalent) near line 642
- Thread `reviewStatus` into the stale-SHA branch if not already present
- Update any `orchestrator.test.ts` snapshots that include the stale-SHA notice in a `patched` outcome

## Acceptance Criteria

- [ ] `bun run verify && bun run test` pass
- [ ] A test case covers: `reviewedHeadSha !== currentHeadSha` + `reviewStatus === 'patched'` → sentence appears
- [ ] A test case covers: `reviewedHeadSha !== currentHeadSha` + `reviewStatus !== 'patched'` → sentence absent
- [ ] No change to the stale-SHA notice text itself

## Notes

- `reviewStatus` may already be in scope at the stale-SHA notice render point — confirm before threading it in
- The sentence should be data-driven: only fires when there are action commits or thread resolutions, not unconditionally
