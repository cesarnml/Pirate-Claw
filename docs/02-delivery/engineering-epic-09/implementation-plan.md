# Engineering Epic 09 — Implementation Plan

Epic doc: [docs/03-engineering/epic-09-review-policy-enforcement-and-doc-only-consolidation.md](../../03-engineering/epic-09-review-policy-enforcement-and-doc-only-consolidation.md)

## Ticket Order

1. `EE9.01 Doc-only detection consolidation`
2. `EE9.02 syncStateWithPlan call-site clarity`
3. `EE9.03 Review policy enforcement and defaults`

## Ticket Files

- `ticket-01-doc-only-detection-consolidation.md`
- `ticket-02-syncstatewithplan-call-site-clarity.md`
- `ticket-03-review-policy-enforcement-and-defaults.md`

## Exit Condition

`skip_doc_only` is wired to real behavior across all three stage handlers.
`required` is honored even for doc-only tickets. Doc-only detection uses a
single `isLocalBranchDocOnly` utility. Defaults are `skip_doc_only` for all
three stages. `syncStateWithPlan` call sites are self-documenting. Son-of-Anton
skill reflects the new behavior.

## Notes

- `EE9.01` is the foundation. `EE9.03`'s `post-verify-self-audit` auto-skip
  depends on `isLocalBranchDocOnly` existing in `platform.ts`. Implement
  `EE9.01` first.
- `EE9.02` is independent of `EE9.01` and `EE9.03`. It touches only `state.ts`
  and carries no behavioral risk.
- `EE9.03` is the largest ticket. It introduces the only type change
  (`ReviewOutcome` gains `'skipped'`), wires policy into three command handlers,
  changes two config defaults, and updates the Son-of-Anton skill. It must not
  be split — the policy wiring across handlers is a single semantic change.
- `EE9.03` gate change for `open-pr`: extends from `=== 'required'` to
  `=== 'required' || === 'skip_doc_only'`. Does not consult `ticket.docOnly`
  at gate time — relies on `codex-preflight` having already auto-advanced
  doc-only tickets before `open-pr` runs.
- The `isPrDocOnly` function in `platform.ts` is deleted in `EE9.01`. Nothing
  else calls it. Do not preserve it as a fallback.
