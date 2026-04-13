# EE9.03 — Review Policy Enforcement And Defaults

## Goal

Make `skip_doc_only` a real behavioral policy across all three review stages,
add `'skipped'` to `ReviewOutcome`, switch stage defaults to `skip_doc_only`,
update Son-of-Anton guidance, and cover the new branches with tests.

## Current Behavior

EE8 added the `reviewPolicy` config object with three valid values:

- `required`
- `skip_doc_only`
- `disabled`

But only `disabled` changes behavior consistently today.

Current gaps:

- `selfAudit` has no `skip_doc_only` branch and cannot record that the stage
  was intentionally skipped for a doc-only ticket
- `ReviewOutcome` cannot represent "not run because policy skipped it"
- `poll-review` does not distinguish `required` from `skip_doc_only` for
  doc-only tickets
- `open-pr` gates Codex preflight only when policy is exactly `required`
- defaults still reflect the EE8 rollout posture rather than the intended
  steady-state operator posture
- Son-of-Anton guidance does not describe the auto-skip behavior under
  `skip_doc_only`

## Target Behavior

### Policy semantics

| Value           | Self-audit                       | Codex preflight                  | External review                  |
| --------------- | -------------------------------- | -------------------------------- | -------------------------------- |
| `required`      | always required                  | always required                  | always required                  |
| `skip_doc_only` | auto-skip doc-only; require code | auto-skip doc-only; require code | auto-skip doc-only; require code |
| `disabled`      | never required                   | never required                   | never required                   |

### `ReviewOutcome`

`ReviewOutcome` becomes:

```ts
type ReviewOutcome = 'clean' | 'patched' | 'skipped';
```

`'skipped'` is used when a review stage did not run because policy explicitly
allowed a doc-only skip. It must not be recorded as `'clean'`.

### `post-verify-self-audit`

When `reviewPolicy.selfAudit === 'skip_doc_only'` and the active ticket is
doc-only, `post-verify-self-audit`:

- detects doc-only by calling `isLocalBranchDocOnly(cwd, baseBranch, runtime)`
- records `selfAuditOutcome: 'skipped'`
- records completion time
- advances the ticket as usual
- does not require an outcome arg from the agent

The command remains an explicit state-recorder step in the workflow. The agent
still calls it; the command decides whether to auto-skip.

When policy is `required`, doc-only tickets must still provide a real outcome.

### `poll-review`

Behavior becomes:

```text
if policy === disabled -> immediate clean
if policy === skip_doc_only && ticket.docOnly === true -> immediate clean
otherwise -> wait through the real review window
```

This preserves the existing no-wait behavior for disabled review, adds the
policy-aware doc-only skip, and ensures `required` actually means required.

### `open-pr` Codex preflight gate

The gate blocks when:

- `reviewPolicy.codexPreflight === 'required'`, or
- `reviewPolicy.codexPreflight === 'skip_doc_only'`

It does not branch on `ticket.docOnly` at gate time.

Normal Son-of-Anton flow still works because `codex-preflight` runs before
`open-pr`, and doc-only tickets under `skip_doc_only` auto-advance to
`codex_preflight_complete` before the gate is reached.

### Defaults

Defaults change to:

```json
{
  "reviewPolicy": {
    "selfAudit": "skip_doc_only",
    "codexPreflight": "skip_doc_only",
    "externalReview": "skip_doc_only"
  }
}
```

This is the intended steady-state default posture: enforce review on code
tickets, auto-skip doc-only tickets, require no extra config.

### Docs and workflow guidance

Son-of-Anton guidance is updated to describe:

- explicit `post-verify-self-audit` invocation even when the command will
  auto-record `skipped`
- `codex-preflight` auto-skip behavior under `skip_doc_only`
- the fact that all three stage defaults are now `skip_doc_only`

## Change Surface

- `tools/delivery/orchestrator.ts`
- `tools/delivery/ticket-flow.ts`
- `tools/delivery/state.ts` if status/output rendering needs updates
- `tools/delivery/orchestrator.test.ts`
- `.agents/skills/son-of-anton-ethos/SKILL.md`
- any docs/examples that show review-policy defaults

## Acceptance Criteria

- [ ] `ReviewOutcome` includes `'skipped'`
- [ ] `post-verify-self-audit` auto-records `'skipped'` for doc-only tickets
      only when `selfAudit` policy is `skip_doc_only`
- [ ] `post-verify-self-audit` still requires a real outcome for doc-only
      tickets when `selfAudit` policy is `required`
- [ ] `poll-review` records immediate clean for all tickets when policy is
      `disabled`
- [ ] `poll-review` records immediate clean for doc-only tickets when policy is
      `skip_doc_only`
- [ ] `poll-review` uses the real review window for doc-only tickets when
      policy is `required`
- [ ] `open-pr` Codex preflight gate applies for both `required` and
      `skip_doc_only`
- [ ] doc-only tickets under `skip_doc_only` still pass normal Son-of-Anton
      flow because `codex-preflight` auto-advances them before `open-pr`
- [ ] default `reviewPolicy` values are `skip_doc_only` for all three stages
- [ ] Son-of-Anton guidance matches the shipped behavior exactly

## Tests

Add or update tests for at least:

- `post-verify-self-audit` auto-skips with `'skipped'` on doc-only ticket when
  `selfAudit` policy is `skip_doc_only`
- `post-verify-self-audit` does not auto-skip the same doc-only ticket when
  `selfAudit` policy is `required`
- `poll-review` immediate-clean behavior when policy is `disabled`
- `poll-review` immediate-clean behavior when policy is `skip_doc_only` and
  `ticket.docOnly === true`
- `poll-review` real review path when policy is `required` and
  `ticket.docOnly === true`
- `open-pr` rejected from `post_verify_self_audit_complete` when
  `codexPreflight` policy is `skip_doc_only`
- defaults test updated to expect `skip_doc_only` for all three stages
- any status/output rendering that now needs to display `'skipped'`

## Rationale

EE8 introduced a policy vocabulary that was only partially real. That makes the
config misleading: `skip_doc_only` reads like behavior but behaves like dead
metadata. EE9 closes that gap and aligns the implementation with the operator
contract the config already implies.

Using `'skipped'` in `ReviewOutcome` is necessary because "doc-only and policy
said skip" is observably different from "review ran and was clean." Persisting
that distinction prevents the state file from claiming work happened when it
did not.

## Notes

- This ticket depends on `EE9.01` because self-audit auto-skip must call
  `isLocalBranchDocOnly` before `ticket.docOnly` is available.
- Keep the `open-pr` gate simple: gate on policy and status only. Do not add a
  second doc-only branch inside `open-pr`.
- This ticket intentionally bundles policy wiring, defaults, docs, and tests as
  one semantic slice. Splitting them would increase mismatch risk.
