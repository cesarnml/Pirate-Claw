# EE9.02 — `syncStateWithPlan` Call-Site Clarity

## Goal

Replace the ambiguous `syncStateWithPlan(undefined, ...)` and
`syncStateWithPlan(existing, ...)` call pattern with two thin named wrappers
that make initialization intent obvious at the call site.

## Current Behavior

`state.ts` exposes a single helper:

```ts
syncStateWithPlan(existingState, plan, now);
```

Its first argument is overloaded:

- `undefined` means initialize a new state file from scratch
- an existing state object means reconcile persisted state with the plan

Both usages are valid, but the distinction is invisible at the call site.
Reviewers have to remember the helper contract rather than reading the intent
directly from the name.

## Target Behavior

`state.ts` exposes two named wrappers:

```ts
syncStateFromScratch(plan, now);
syncStateFromExisting(existingState, plan, now);
```

Both wrappers delegate to the existing internal reconciliation logic. No
behavior changes. The only goal is to make fresh-init vs existing-state flows
self-documenting.

`syncStateWithPlan` may remain as an internal implementation detail, but it
must no longer be called directly from other modules.

## Change Surface

- `tools/delivery/state.ts`
- any module that currently imports or calls `syncStateWithPlan`

## Acceptance Criteria

- [ ] `syncStateFromScratch(plan, now)` exists
- [ ] `syncStateFromExisting(existingState, plan, now)` exists
- [ ] both wrappers preserve the exact current state-sync behavior
- [ ] no external call site passes `undefined` to `syncStateWithPlan`
- [ ] no external call site imports `syncStateWithPlan` directly
- [ ] naming makes the init-vs-reconcile distinction obvious without reading
      helper internals

## Tests

No new behavioral tests are required if the existing state-sync test coverage
still passes unchanged. This ticket is a naming and call-site clarity refactor,
not a semantic change.

Regression: run the relevant existing orchestrator/state test suite and confirm
no output or state-shape expectations change.

## Rationale

The EE8 retrospective correctly identified this as a readability debt. A call
like `syncStateWithPlan(undefined, plan, now)` is compact but hides intent in a
sentinel argument. Thin wrappers keep the implementation centralized while
making the two modes explicit to reviewers and future maintainers.

## Notes

- Keep this ticket behavior-neutral. Do not combine it with review-policy
  wiring or other EE9 semantic changes.
- This is intentionally the smallest slice in EE9 and should remain low risk.
