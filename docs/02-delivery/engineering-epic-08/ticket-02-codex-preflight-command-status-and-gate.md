# EE8.02 — Codex Preflight Command, Status, And Gate

## Goal

Add the `codex-preflight` state-recorder command, a new `codex_preflight_complete`
ticket status, and enforce the Codex preflight gate in `open-pr` when policy is
`required`.

## Current Behavior

- There is no Codex preflight stage in the ticket flow.
- `open-pr` gates only on `post_verify_self_audit_complete` status.
- No `codex_preflight_complete` status exists.

## Target Behavior

### New `CodexPreflightOutcome` type

```ts
type CodexPreflightOutcome = 'clean' | 'patched' | 'skipped';
```

This is a distinct type. It must not extend or modify `ReviewOutcome`.

`TicketState` gains:

- `codexPreflightOutcome?: CodexPreflightOutcome`
- `codexPreflightCompletedAt?: string`

### New `codex_preflight_complete` status

Inserted between `post_verify_self_audit_complete` and `in_review` in the status
machine. `statusRank` assigns it rank 3 (shifting `in_review` and later statuses
up by one).

### `codex-preflight` command

The command is a state recorder. The agent runs the Codex review step via the
`codex:rescue` skill, then calls this command to record the outcome. The CLI does
not invoke Codex directly.

**Code ticket flow:**

```
bun run deliver codex-preflight [clean|patched]
```

- Requires the active ticket to be at `post_verify_self_audit_complete` status
- Records `codexPreflightOutcome` and `codexPreflightCompletedAt`
- Transitions ticket status to `codex_preflight_complete`

**Doc-only ticket flow:**

- Command detects `TicketState.docOnly === true`
- Records `codexPreflightOutcome: 'skipped'` and `codexPreflightCompletedAt`
- Transitions ticket status to `codex_preflight_complete`
- No outcome arg required or accepted
- Prints a clear operator message: "Doc-only ticket — Codex preflight auto-skipped."

### `open-pr` gate

When `reviewPolicy.codexPreflight` is `required`:

- `open-pr` rejects code tickets that are not at `codex_preflight_complete` status
- Error message:

  > `Ticket <id> requires Codex preflight before opening a PR. Run` `` `bun run deliver codex-preflight [clean|patched]` `` `after completing the Codex review step. If codex-plugin-cc is unavailable, set codexPreflight to "disabled" in orchestrator.config.json to bypass.`

When `reviewPolicy.codexPreflight` is `disabled`:

- `open-pr` does not require `codex_preflight_complete` status
- Tickets at `post_verify_self_audit_complete` may proceed to `open-pr` directly

### Default policy

`codexPreflight` defaults to `disabled` (established in `EE8.01`). The gate
is not enforced until the operator explicitly sets `codexPreflight: "required"`
in `orchestrator.config.json`.

### `status` rendering

- Shows `codexPreflightOutcome` and `codexPreflightCompletedAt` when present
- Distinguishes `skipped` (doc-only) from `clean` or `patched`

## Change Surface

- `tools/delivery/orchestrator.ts` (`TicketStatus`, `TicketState`, `CodexPreflightOutcome`)
- `tools/delivery/ticket-flow.ts` (`recordCodexPreflight`, `openPullRequest` gate)
- `tools/delivery/state.ts` (`statusRank`, state sync)
- `tools/delivery/cli.ts` (register `codex-preflight` command)
- `tools/delivery/orchestrator.test.ts`

## Acceptance Criteria

- [ ] `CodexPreflightOutcome = 'clean' | 'patched' | 'skipped'` is a distinct type
- [ ] `TicketState` includes `codexPreflightOutcome` and `codexPreflightCompletedAt`
- [ ] `codex_preflight_complete` status exists between `post_verify_self_audit_complete`
      and `in_review` in `statusRank`
- [ ] `codex-preflight [clean|patched]` transitions a code ticket to
      `codex_preflight_complete` and records outcome and timestamp
- [ ] `codex-preflight` on a doc-only ticket records `skipped`, transitions
      status, and prints the auto-skip message — no outcome arg required
- [ ] `open-pr` rejects code tickets not at `codex_preflight_complete` when
      policy is `required`, with the exact error message naming `codex-plugin-cc`
      and the config escape hatch
- [ ] `open-pr` does not require `codex_preflight_complete` when policy is
      `disabled`
- [ ] `status` renders Codex preflight outcome and timestamp when present
- [ ] no regression on existing `post-verify-self-audit` or `open-pr` behavior

## Tests

Cover at least:

- `codex-preflight clean` on a code ticket records outcome and transitions status
- `codex-preflight patched` on a code ticket records outcome and transitions status
- `codex-preflight` on a doc-only ticket records `skipped` and transitions status
- `codex-preflight` rejected when ticket is not at `post_verify_self_audit_complete`
- `open-pr` rejected for code ticket at `post_verify_self_audit_complete` when
  policy is `required`
- `open-pr` accepted for code ticket at `post_verify_self_audit_complete` when
  policy is `disabled`
- `open-pr` accepted for ticket at `codex_preflight_complete` when policy is
  `required`
- `open-pr` error message text includes `codex-plugin-cc` and config escape hatch
- `status` renders `codexPreflightOutcome` correctly for all three values
- `statusRank` ordering: `post_verify_self_audit_complete` < `codex_preflight_complete`
  < `in_review`

## Rationale

The `codex-preflight` command follows the same state-recorder pattern as
`post-verify-self-audit`: the agent does the work via the Codex skill, then calls
the command to record the outcome. This avoids a hard runtime dependency on
`codex-plugin-cc` being scriptable from Bun and matches the existing convention.

The gate defaults to `disabled` so EE8's own tickets ship without requiring
Codex preflight on a gate that has never been exercised. The operator flips it to
`required` in `orchestrator.config.json` after a successful trial run.

## Notes

- Do not invoke Codex from within the CLI. The command is a state recorder only.
- Doc-only detection uses `TicketState.docOnly` — no diff inspection needed.
- `skipped` outcome on doc-only tickets promotes to `codex_preflight_complete`
  so `open-pr` gate logic stays uniform: always check status, never make a
  secondary doc-only judgment at `open-pr` time.
- Keep `CodexPreflightOutcome` separate from `ReviewOutcome`. Do not extend the
  existing type.
