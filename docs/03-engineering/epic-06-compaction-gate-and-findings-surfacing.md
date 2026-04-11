# Engineering Epic 06: Compaction Gate and Findings Surfacing

## Overview

Addresses the two EE5 shortcomings identified in the Phase 15 execution retrospective.
Delivered as a single standalone PR following the orchestrator's standalone `ai-review`
path — not a stacked ticket sequence.

## Rationale

Phase 15 got through 6/7 tickets before hitting the 5-hour context ceiling — same count
as Phase 14 despite higher per-ticket complexity. EE5 held the ceiling but did not raise
it. Two structural gaps remained:

1. **Compaction directive was advisory-only.** `advance` emitted the directive and the
   handoff path in the same output. The model read both and continued without compacting.
   Zero out of six directive instances resulted in actual compaction during Phase 15.

2. **Review artifact condensation was incomplete.** EE5 condensed `poll-review` output
   via `formatCurrentTicketStatus`, but after triage the model still read the full `.txt`
   artifact (several KB of CodeRabbit prose, HTML, suggested diffs, fingerprinting
   metadata) to learn what the specific findings were. The triage output told the model
   _that_ findings exist; nothing told it _what_ they said.

See [`notes/public/p15-ee5-effectiveness-evaluation.md`](../../notes/public/p15-ee5-effectiveness-evaluation.md)
for the full analysis.

---

## Scope (single PR, delivered together)

### 1. Compaction gate — split `advance` into two commands

**Problem:** `advance` currently auto-starts the next ticket (creates worktree, branch,
writes handoff) and prints the handoff path alongside the compaction directive. The model
has everything it needs to continue in one output — the directive is ignored.

**Fix:** Flip the `advance` default. `advance` now only records the current ticket as
`done` and emits the compaction directive. It does not call `startTicket`. The next ticket
stays `pending` in state. The model must explicitly call `bun run deliver -- start` after
compacting to initialize the worktree, branch, and handoff.

**Concrete changes:**

- `advance` default behavior: remove the auto-start-next call. The `--no-start-next` flag
  is removed (now the unconditional default). `startNext: boolean` parameter to
  `advanceToNextTicket` / `advanceToNextTicketImpl` is removed.
- `advance` output emits `compaction_required=true` as a machine-readable field (parseable
  by future hooks or tooling) alongside the human-readable directive. It does NOT print
  the handoff path.
- `start` command gains zero-arg support: when called with no ticket ID, it finds the next
  `pending` ticket and starts it (creates worktree, bootstraps, writes handoff, prints
  handoff path). Existing behavior (explicit ticket ID) is unchanged.
- `pending` status is unchanged. No new status value is introduced.
- `delivery-orchestrator.md` updated to reflect the new two-command flow.

**New delivery loop at ticket boundaries:**

```
bun run deliver -- advance           # records done, emits compaction_required=true
# /compact (model compacts here)
bun run deliver -- start             # initializes next ticket, prints handoff path
```

### 2. Condensed findings block in `formatCurrentTicketStatus`

**Problem:** After `poll-review` triage, `formatCurrentTicketStatus` shows
`review_action_summary=Flagged N finding comment(s) for follow-up.` The model knows
findings exist but not what they say, so it reads the full `.txt` artifact to triage
them. That file is several KB of prose, suggested diffs, and HTML metadata.

**Fix:** `formatCurrentTicketStatus` emits a condensed findings block when the ticket has
actionable `reviewComments` (already persisted to state during `poll-review`). Actionable
means: `kind === 'finding'`, `is_outdated !== true`, `is_resolved !== true`.

**Finding title extraction:** Use the first `**...**` bold match in `comment.body` (regex:
`/\*\*([^*]+)\*\*/`). CodeRabbit consistently puts the finding title in the first bold
phrase. Fallback: truncate `body` to 120 characters. Never include suggested diff text.

**Output shape** (appended after existing `review_action_summary` line when findings
exist):

```
findings (2):
  [coderabbit] web/src/routes/candidates/unmatched/+page.svelte:58 — Add an explicit label for the search field. [minor]
  [coderabbit] web/src/routes/candidates/unmatched/unmatched.test.ts:63 — Tighten the "no match" assertion to verify zero data rows. [nitpick]
```

**Scope boundary:** Findings with `is_outdated: true` or `is_resolved: true` are
suppressed (same filter the triage script applies). The `.txt` artifact remains on disk
for developer inspection. The model should not need to read it for standard patch cycles.

---

## Acceptance criteria

- `bun run deliver -- advance` does not create a worktree or write a handoff. Prints
  `compaction_required=true` and "run: bun run deliver -- start" directive. Does not print
  the handoff path.
- `bun run deliver -- start` (zero-arg) finds the next pending ticket, initializes it, and
  prints the handoff path. Explicit ticket-ID form is unchanged.
- `--no-start-next` flag is removed from `advance`.
- `formatCurrentTicketStatus` emits a `findings (N):` block when actionable
  `reviewComments` exist on the ticket. Each line: `[vendor] path:line — title [severity]`.
- Findings marked `is_outdated` or `is_resolved` are excluded from the block.
- All existing tests pass. New tests cover: zero-arg `start`, `advance` no-op on start,
  `compaction_required=true` in advance output, findings block format, findings
  suppression for outdated/resolved comments.
- `delivery-orchestrator.md` reflects the new two-command boundary flow.

---

## Delivery

Single standalone PR. Use `bun run deliver ai-review` for the external review gate.
Not a stacked ticket sequence.

## References

- [`notes/public/p15-ee5-effectiveness-evaluation.md`](../../notes/public/p15-ee5-effectiveness-evaluation.md)
- [`notes/public/ee5-retrospective.md`](../../notes/public/ee5-retrospective.md)
- [`docs/03-engineering/epic-05-orchestrator-context-minimization.md`](./epic-05-orchestrator-context-minimization.md)
- [`docs/03-engineering/delivery-orchestrator.md`](./delivery-orchestrator.md)

---

_Created: 2026-04-12. Grill-me decisions locked same day._
