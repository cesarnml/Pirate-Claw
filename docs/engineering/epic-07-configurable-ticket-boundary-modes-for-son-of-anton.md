# Engineering Epic 07: Configurable Ticket-Boundary Modes For Son-of-Anton

## Overview

Addresses the workflow tradeoff exposed by EE5 and EE6.

Before EE6, Son-of-Anton effectively ran in **cook mode**: after `advance`, the
agent continued directly into the next ticket. EE5 attempted to add a compaction
step to that flow, but the directive was advisory-only and the agent ignored it
in practice.

EE6 corrected that by turning the ticket boundary into a hard stop. That solved
the "advisory compaction is ignored" problem, but it also changed the workflow
into a fully **gated mode**: the agent no longer continued autonomously across
the approved ticket stack.

EE7 makes that boundary behavior explicit and operator-selectable. Son-of-Anton
should support three boundary modes:

- `cook` — continue directly into the next ticket with no reset step
- `gated` — stop at the ticket boundary and require an operator-driven context
  reset before resuming
- `glide` — attempt proactive self-reset and auto-continue; if the host
  agent/runtime cannot actually do that, fall back to `gated`

This keeps the original high-value Son-of-Anton behavior available, preserves
the EE6 hard-boundary path for aggressive token minimization, and leaves room
for future agent runtimes that can actually self-reset without operator
involvement.

## Rationale

The repo now has two proven workflow shapes and one desired-but-blocked shape:

1. **Cook is real.** Prior to EE6, the orchestrator effectively supported
   uninterrupted phase execution across ticket boundaries. That is the strongest
   expression of Son-of-Anton's "let the agent cook" value.

2. **Gated is real.** EE6 intentionally split `advance` from `start` so the
   ticket boundary became a stop point. This works reliably today and is the
   best fit when the operator wants a true session reset and minimal
   carry-forward token cost.

3. **Glide is aspirational.** The orchestrator can emit a self-reset directive,
   but repo-local tooling cannot force an agent host to perform `/compact` or
   `/clear` on demand. That limitation lives in the agent/runtime, not the
   orchestrator design. EE7 should preserve glide as a first-class policy even
   if it degrades in current hosts.

The core mistake to avoid is treating one of these modes as universally
correct. They optimize for different things:

- `cook` optimizes for autonomy and uninterrupted momentum
- `gated` optimizes for strict context hygiene and token minimization
- `glide` optimizes for both, but depends on host capability

EE7 therefore moves this from implicit behavior to explicit policy.

## Scope

### 1. Add explicit ticket-boundary policy

Add a boundary mode to orchestrator configuration and allow a per-run override.

Supported modes:

- `cook`
- `gated`
- `glide`

Config surface:

- `orchestrator.config.json` gains a repo-default boundary mode
- CLI allows a per-run override so specific phases or experiments can choose a
  different mode without changing the repo default

Repo default for EE7:

- `cook`

Rationale for default:
Son-of-Anton's defining value is letting the agent carry an approved ticket
stack forward without repeated operator re-entry. If token cost is the only
concern, `gated` is better; but as a workflow ethos, Son-of-Anton should
default to cooking.

### 2. Define exact boundary behavior for each mode

#### `cook`

`advance` behavior:

- marks the current ticket `done`
- refreshes delivery state and PR metadata exactly as today
- immediately initializes the next pending ticket
- creates the next ticket worktree/branch/handoff
- prints the next handoff path and normal continuation status
- does not emit any reset requirement

This is the intentional restoration of pre-EE6 continuation behavior.

#### `gated`

`advance` behavior:

- marks the current ticket `done`
- does not create the next handoff or worktree
- emits a short operator-facing reset note
- emits a single agent-facing resume prompt for the next session
- stops

For `gated`, the operator-facing note should recommend reset, not only
compaction:

- prefer `/clear` for minimum token usage
- use `/compact` only when the operator intentionally wants compressed
  carry-forward context

Canonical agent-facing resume prompt:

`Immediately execute \`bun run deliver --plan <plan> start\`, read the generated handoff artifact as the source of truth for context, and implement <next-ticket-id>.`

This prompt is the actual handoff product of `gated` mode. It is designed to be
pasted directly into the next agent session so the resumed agent does not waste
tokens re-orienting itself.

#### `glide`

`advance` behavior:

- attempts a proactive self-reset and continuation path
- if the host agent/runtime can reliably support self-reset, it continues
  automatically into the next ticket
- if that support is absent, unclear, or untrusted, it falls back to `gated`

Fallback for unsupported `glide`:

- `gated`

This fallback must be explicit in command output. The orchestrator should never
silently behave like `cook` when glide is unsupported.

### 3. Keep handoff creation aligned with mode semantics

EE6's main structural correction must remain true:

- in `gated`, `advance` must not create the next handoff
- `start` remains the command that creates the next ticket handoff in gated flow

Mode-specific handoff ownership:

- `cook`: `advance` may create the next handoff as part of auto-continuation
- `gated`: only `start` creates the next handoff
- `glide`: only create the next handoff automatically if the runtime truly
  supports the self-reset-and-continue path; otherwise degrade to gated and
  leave handoff creation to `start`

This is important because handoff creation is itself a behavioral nudge. If
`gated` creates the next handoff during `advance`, it biases the operator and
agent toward continuation instead of reset.

### 4. Make the active boundary mode visible

The selected boundary mode should be visible and auditable.

Required output/state behavior:

- `status` shows the effective boundary mode for the run
- `advance` output states which boundary mode was applied
- if `glide` falls back, output clearly states that glide was requested but
  `gated` behavior was used
- the generated resume prompt in `gated` includes the resolved plan path and
  next ticket ID

EE7 should not introduce ambiguous "best effort" behavior with no surface area.
If mode selection matters, it must be visible in state and command output.

### 5. Update Son-of-Anton docs and skill guidance

Update the engineering docs and repo-local skill guidance so the workflow
doctrine matches the new policy model.

Required documentation changes:

- Son-of-Anton no longer assumes a single ticket-boundary behavior
- `cook` is documented as the default uninterrupted continuation path
- `gated` is documented as the hard-reset path optimized for token minimization
- `glide` is documented as a host-capability-dependent future-facing mode
- all examples in `delivery-orchestrator.md` and Son-of-Anton guidance are
  mode-aware
- `gated` examples must use the canonical resume prompt above

## Acceptance Criteria

- `orchestrator.config.json` supports a repo-default boundary mode with values
  `cook`, `gated`, or `glide`.
- CLI supports a per-run boundary-mode override that supersedes repo default.
- Repo default is `cook`.
- In `cook`, `advance` immediately continues into the next pending ticket and
  creates the next handoff/worktree automatically.
- In `gated`, `advance` stops at the boundary, does not create the next
  handoff/worktree, and emits:
  - a short operator reset note
  - the canonical agent-facing resume prompt
- In `gated`, `start` remains the command that creates the next ticket handoff.
- In `glide`, unsupported or untrusted host/runtime capability causes explicit
  fallback to `gated`.
- `status` and `advance` output reflect the effective boundary mode.
- Delivery docs and Son-of-Anton guidance match the implemented mode semantics
  exactly.

## Tests

Cover at least:

- config default resolution for `cook`, `gated`, and `glide`
- CLI override over config default
- `advance` behavior in each mode
- `gated` does not create handoff/worktree on `advance`
- `cook` does create next handoff/worktree on `advance`
- `glide` fallback to `gated` when self-reset capability is unavailable
- generated `gated` resume prompt includes exact plan path and next ticket ID
- `status` shows effective mode

## Assumptions

- Son-of-Anton's core value is autonomous continuation through an approved
  stack, so `cook` is the repo default even though it is not the cheapest mode
  for tokens.
- `gated` is the strongest token-minimization path and should recommend
  `/clear` before `/compact`.
- `glide` cannot be guaranteed by repo-local tooling alone because self-reset is
  a host-agent/runtime capability, not a Bun CLI capability.
- EE7 changes only delivery-tooling behavior and docs. It does not redesign
  ticket planning, review polling cadence, or handoff content structure.
