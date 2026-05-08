# EE8.01 — Self-Audit Observability And Review-Policy Config

## Goal

Add a `clean`/`patched` outcome to `post-verify-self-audit` and introduce the
`reviewPolicy` config object to `orchestrator.config.json`. No behavioral gate
changes in this ticket.

## Current Behavior

- `post-verify-self-audit` records only a completion timestamp
  (`postVerifySelfAuditCompletedAt`). There is no signal for whether self-audit
  changed code or not.
- `orchestrator.config.json` has no `reviewPolicy` field. Review stage behavior
  is hardcoded with no operator-visible policy surface.
- `status` output shows self-audit as "completed at \<timestamp\>" with no
  outcome qualifier.

## Target Behavior

### `post-verify-self-audit` outcome

- Command accepts an optional outcome arg: `clean` or `patched`
- When omitted, outcome defaults to `clean` (backward compatible)
- `TicketState` gains `selfAuditOutcome?: 'clean' | 'patched'`
- `status` renders self-audit as "completed at \<timestamp\> (clean)" or
  "completed at \<timestamp\> (patched)"

### `reviewPolicy` config

- `orchestrator.config.json` accepts a `reviewPolicy` object with three optional
  stage keys: `selfAudit`, `codexPreflight`, `externalReview`
- Valid stage values: `required`, `skip_doc_only`, `disabled`
- Invalid stage values are rejected with a clear error at config load time
- Resolved config exposes `reviewPolicy` with per-stage defaults when keys are
  absent:
  - `selfAudit`: `required`
  - `codexPreflight`: `disabled`
  - `externalReview`: `required`
- `status` renders the effective `reviewPolicy` for the run

### Behavioral constraint

`reviewPolicy` values for `selfAudit` and `externalReview` are parsed, resolved,
and rendered but **not wired to any gate logic** in this ticket. The config
surface exists; behavior is unchanged.

## Change Surface

- `tools/delivery/config.ts`
- `tools/delivery/orchestrator.ts` (`TicketState`, `TicketStatus` rendering)
- `tools/delivery/ticket-flow.ts` (`recordPostVerifySelfAudit`)
- `tools/delivery/test/orchestrator.test.ts`

## Acceptance Criteria

- [ ] `post-verify-self-audit` accepts an optional `clean|patched` arg
- [ ] omitting the arg defaults to `clean`
- [ ] `TicketState` includes `selfAuditOutcome?: 'clean' | 'patched'`
- [ ] `status` renders self-audit outcome alongside completion timestamp
- [ ] `orchestrator.config.json` accepts a `reviewPolicy` object
- [ ] invalid stage values are rejected with a clear config error
- [ ] resolved config exposes `reviewPolicy` with correct per-stage defaults
- [ ] `status` renders the effective `reviewPolicy` for the run
- [ ] existing `post-verify-self-audit` callers that omit the arg keep working
- [ ] no existing gate behavior changes

## Tests

Cover at least:

- `post-verify-self-audit` with `clean` arg records `selfAuditOutcome: 'clean'`
- `post-verify-self-audit` with `patched` arg records `selfAuditOutcome: 'patched'`
- `post-verify-self-audit` with no arg records `selfAuditOutcome: 'clean'`
- `reviewPolicy` config parsing for all three stages and all valid values
- invalid stage value rejected at config load
- missing `reviewPolicy` key resolves to per-stage defaults
- `status` renders self-audit outcome and effective `reviewPolicy`

## Rationale

Self-audit observability is the foundation EE8 is built on. Without a `clean` or
`patched` signal, the gate has no measurable output. Introducing `reviewPolicy`
config in the same ticket keeps the schema additions together, while the
behavioral constraint ensures this ticket carries no gate risk.

## Notes

- `ReviewOutcome = 'clean' | 'patched'` already exists in `orchestrator.ts`.
  `selfAuditOutcome` should use this type — it is not extended or modified here.
- Do not wire `reviewPolicy` stage values to gate logic in this ticket. That
  belongs in `EE8.02` for `codexPreflight` only.
- Keep config parsing consistent with the existing pattern in `config.ts`.
