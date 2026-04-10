# Engineering Epic 05: Orchestrator Context Minimization & Review Protocol

## Overview

Addresses the high context cost and review protocol gaps identified in the Phase 14
retrospective. Delivered as a single standalone PR following the orchestrator's
standalone `ai-review` path — not a stacked ticket sequence.

## Rationale

Phase 14 burned ~84% of the 5-hour context limit across 6 tickets in a single
continuous session. The binding constraint was not ticket complexity but accumulated
context from noisy orchestrator output, full file re-reads, and the absence of a
hard reset at ticket boundaries. This epic makes the structural fixes.

See [`notes/public/phase-14-retrospective.md`](../../notes/public/phase-14-retrospective.md)
for the full analysis.

---

## Scope (single PR, delivered together)

### 1. `verify:quiet` script

Add a `verify:quiet` alias to the root `package.json` that suppresses all passing
output and emits only failures. Implementation: pipe verify through a filter that
drops lines unless they match `error|warn|\[warn\]|FAIL|exit code`. The orchestrator
and delivery guidance updated to call `verify:quiet` during agent-driven ticket
implementation; the full `verify` remains available for developer use.

### 2. Handoff artifact: `modified_sections` field

The file re-read problem lives in the agent, not the orchestrator. The orchestrator
doesn't read source files; the agent reads them in full at ticket start because the
handoff says "read required docs" without scoping what to read. The fix is in the
handoff artifact format: add a `modified_sections` field per ticket that lists
`{file, startLine, endLine}` ranges (or named section anchors) for files that will
be modified. The agent reads targeted slices instead of full files. Update
`ticket-flow.ts` to populate `modified_sections` from the ticket's scope, and update
the handoff template and delivery guidance to document the field.

### 3a. Suppress orchestrator poll stdout per check

The orchestrator prints the full ticket stack state on every poll interval. By the
final ticket of a phase, a single poll check emits all prior tickets' metadata. Fix:
`poll-review` output emits only the current ticket's state block and the check result
line, not the full stack. Prior ticket state is still in `state.json` on disk.

### 3b. Condense session-side review artifact extract

The full `.txt` review artifact is read into session context for triage. The artifact
on disk should stay verbose for the developer. What the session needs is a compact
extract: finding titles, severity, and file reference only — no full prose. Update
the review triage step to emit a condensed extract to session context and keep the
full artifact at rest on disk only.

### 4. Poll-review timing: 6/12 protocol + doc-only skip + no read-ahead

**Timing:** Replace the current 2-minute cadence (up to 10 minutes + optional 12th
minute) with a two-checkpoint model: check at 6 minutes, check at 12 minutes.
Rationale: ~50% of reviews complete by 6 minutes, ~90% by 12 minutes. The 3-minute
check rarely has signal on real code PRs; the 9-minute check adds nothing over the
12-minute final. Fewer checks means less subprocess output to process.

**Early advance at 6 minutes:** The agent advances past the review window at the
6-minute check only if it can confirm that all configured external review agents have
posted findings. If any agent has not yet posted, it waits for the 12-minute check.
This prevents premature advancement when fast reviews are complete but slow ones are
not.

**Doc-only PRs skip the review window entirely.** If the PR diff touches only
documentation files (`.md`, no `.ts`, `.svelte`, `.json`, or source changes), skip
the poll-review window. External AI agents review code; the developer reads docs.
Running CodeRabbit and SonarQube on a markdown-only PR adds latency for zero signal.
Implement a diff check in `open-pr` that sets a `doc_only: true` flag in state;
`poll-review` skips the window when this flag is set and records `clean` immediately.

**No read-ahead during the review window.** The agent does nothing during the wait.
No file reads, no ticket prep, no planning. The wait is free (LLM idle during
subprocess sleep); read-ahead burns context that is dead weight if session compaction
(ticket 5) is adopted. Be sabaai sabaai.

### 5. Session compaction directive at ticket advance (option 2)

At each `advance`, the orchestrator emits an explicit compaction directive before
the next ticket starts. Option 2 only: in-session `/compact` (or equivalent context
compression primitive), not a fresh session per ticket. Rationale: option 1 (fresh
session per ticket) requires the developer to manually restart every 10-15 minutes,
which breaks the "cook for an hour unsupervised" premise of son-of-anton. Option 2
keeps the long autonomous run while pruning accumulated noise.

The orchestrator emits the directive; individual model implementations are responsible
for honoring it. Some agents (e.g. Codex) may not compact when directed. That is a
model-specific limitation, not a workflow design flaw. The directive is still correct
to emit.

Concretely: `advance` prints a compact block — "CONTEXT COMPACTION REQUIRED before
starting [next ticket]. Call /compact or equivalent now. Then read handoff at
[path]." — before the handoff path. The handoff artifact plus the `modified_sections`
field (ticket 2) gives the resuming context everything it needs; nothing else from
prior ticket history is load-bearing.

---

## Acceptance criteria

- `verify:quiet` exists and emits only failures; orchestrator delivery guidance
  references it.
- Handoff artifacts include `modified_sections`; handoff template and guidance
  document the field.
- `poll-review` prints current-ticket state only per check, not full stack.
- Session-side review extract is condensed to finding titles + severity + file.
- Poll cadence is 6/12 minutes; doc-only PRs skip the window; no read-ahead
  directive is explicit in orchestrator guidance.
- `advance` emits a compaction directive before the next ticket handoff.
- All changes reflected in `docs/03-engineering/delivery-orchestrator.md`.

## Delivery

Single standalone PR. Use `bun run deliver ai-review` for the external review gate.
Not a stacked ticket sequence.

## References

- [`notes/public/phase-14-retrospective.md`](../../notes/public/phase-14-retrospective.md)
- [`docs/03-engineering/delivery-orchestrator.md`](./delivery-orchestrator.md)
- [`docs/02-delivery/phase-implementation-guidance.md`](../02-delivery/phase-implementation-guidance.md)

---

_Created: 2026-04-10. Refined after grill-me: 2026-04-10._
