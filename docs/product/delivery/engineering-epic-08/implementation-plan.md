# Engineering Epic 08 — Implementation Plan

Epic doc: [docs/engineering/epic-08-codex-preflight-review-gate.md](../../03-engineering/epic-08-codex-preflight-review-gate.md)

## Ticket Order

1. `EE8.01 Self-audit observability and review-policy config`
2. `EE8.02 Codex preflight command, status, and gate`
3. `EE8.03 Docs and workflow guidance`

## Ticket Files

- `ticket-01-self-audit-observability-and-review-policy-config.md`
- `ticket-02-codex-preflight-command-status-and-gate.md`
- `ticket-03-docs-and-workflow-guidance.md`

## Exit Condition

The delivery orchestrator records a `clean` or `patched` outcome for self-audit,
supports an explicit `reviewPolicy` config object, enforces a Codex preflight
gate before `open-pr` for code tickets when policy is `required`, and ships
matching docs and Son-of-Anton guidance.

## Notes

- `EE8.01` is purely additive: new field, new config surface, no behavioral gate
  changes. `reviewPolicy` values for `selfAudit` and `externalReview` are parsed
  and rendered but not wired to behavior in this epic.
- `EE8.02` is the only ticket that changes gate behavior. `codexPreflight`
  defaults to `disabled` in config until the gate has been proven reliable in
  practice.
- `EE8.03` is a required docs-only closing slice. It must update the
  `orchestrator.config.json` example to show the full `reviewPolicy` object with
  the `disabled` default noted.
- The `codex-preflight` command is a state recorder — the agent runs the Codex
  skill, then calls this command to record the outcome. The CLI does not invoke
  Codex directly.
- `CodexPreflightOutcome` is its own type (`'clean' | 'patched' | 'skipped'`)
  and must not extend or modify `ReviewOutcome`.
