# Engineering Epic 08: Codex Preflight Review Gate

## Overview

Adds an internal Codex review gate to Son-of-Anton before a ticket-linked PR is
published for external AI review.

Today the ticket flow is:

- implement
- verify
- self-audit
- `open-pr`
- external AI review (`coderabbit`, `greptile`, `qodo`, `sonarqube`)

That leaves two gaps:

1. **Claude self-audit has weak observability.** The current
   `post-verify-self-audit` step records a timestamp, but it does not prove
   whether self-audit changed code or improved the branch at all.
2. **There is no internal independent review pass before publication.** The
   first real adversarial review comes only after the PR is already open to the
   external AI-review vendors.

EE8 adds a pre-PR Codex review stage using `codex-plugin-cc` as an internal
reviewer. Claude remains the executing agent. Codex acts as the internal review
gate before the branch is published.

EE8 also defines the repo-level review policy surface in
`orchestrator.config.json`. Review stages should not be modeled as loose
boolean toggles. The orchestrator should use explicit stage policy values so
required gates, doc-only skips, and disabled stages remain auditable.

## Rationale

The goal is not to create review recursion for its own sake. The goal is to
make internal review observable and raise branch quality before the PR is
published.

This is worth doing only if the workflow stages are sharply separated:

- **implementation** produces the main ticket behavior
- **Claude self-audit** performs an internal second pass and must become
  observable as `clean` or `patched`
- **Codex preflight** acts as an independent internal reviewer before `open-pr`
- **external AI review** remains the post-publication review gate

The key design stance is:

- Codex is an internal reviewer, not a second implementation agent
- Claude remains responsible for patching findings and authoring any resulting
  commit
- the Codex preflight stage is a real gate, not best-effort ceremony

Review-stage configuration follows the same stance. A plain `true` or `false`
is too weak because it hides whether a stage is mandatory, skipped only for
doc-only diffs, or fully disabled by repo policy. EE8 should therefore define a
review-policy object with explicit per-stage semantics instead of three booleans
such as `selfAudit`, `codexPreflight`, and `externalReview`.

If self-audit remains unobservable after EE8, it should be removed in a later
epic. EE8 therefore treats observability as part of the feature, not a side
detail.

## Scope

### 1. Make Claude self-audit observable

Keep `post-verify-self-audit`, but extend its meaning beyond a timestamp-only
transition.

Required outcomes for self-audit:

- `clean` — self-audit changed no code
- `patched` — self-audit changed code and produced a dedicated self-audit commit

Required behavior:

- a self-audit patch must land in its own commit before the workflow advances
- if self-audit changed nothing, no extra commit is created
- delivery state records the self-audit outcome in addition to the completion
  timestamp

This gives the workflow a measurable signal for whether self-audit is doing any
real work.

Repo policy for EE8:

- `reviewPolicy.selfAudit` defaults to `required`
- doc-only tickets auto-skip self-audit gating logic only where the existing
  workflow already treats doc-only branches as non-code review surfaces

### 2. Add a Codex preflight stage before `open-pr`

Insert a new explicit Codex review stage after self-audit and before `open-pr`
for ticket-linked code changes.

Revised ticket flow:

- implement
- verify
- self-audit
- Codex preflight review
- `open-pr`
- external AI review

The Codex stage uses `codex-plugin-cc` as an internal preflight review gate.
This stage is for code tickets only. Doc-only PRs skip it, matching the repo's
existing stance for external AI review.

Repo policy for EE8:

- `reviewPolicy.codexPreflight` defaults to `required`
- doc-only tickets auto-skip this stage even when the policy is `required`

### 3. Keep Codex as reviewer, keep Claude as patch owner

When Codex surfaces actionable findings:

- Claude applies the patch
- Claude creates the dedicated Codex patch commit
- the workflow then proceeds to `open-pr`

Codex does not become a second implementation agent in the ticket loop. The
plugin is used to provide the review signal; the active Son-of-Anton worker
retains execution ownership.

This keeps commit authorship and workflow responsibility legible.

### 4. Add explicit orchestrator command support

Do not rely on slash-command discipline alone. The Codex preflight step must be
represented in the repo-local delivery tooling.

EE8 should add explicit `deliver` command support for the Codex preflight stage
so that:

- the step is required by workflow, not memory
- state transitions are visible and testable
- `open-pr` can reject code tickets that have not completed Codex preflight

The command surface should model Codex preflight as a distinct stage, not fold
it invisibly into `post-verify-self-audit`.

The config surface should also model review policy explicitly:

```json
{
  "reviewPolicy": {
    "selfAudit": "required",
    "codexPreflight": "required",
    "externalReview": "required"
  }
}
```

Allowed stage values:

- `required` - gate applies to eligible code tickets
- `skip_doc_only` - same as `required`, but spelled explicitly for stages where
  doc-only auto-skip is policy-significant in config/state rendering
- `disabled` - stage is turned off by repo policy

For EE8, `selfAudit` and `codexPreflight` should not default to `disabled`.
Those are the feature, not optional ceremony. `externalReview` may be
repo-configurable because vendor latency and appetite are legitimately repo
policy concerns.

### 5. Define gate outcomes tightly

Codex preflight must resolve to one of two acceptable outcomes before `open-pr`
for code tickets:

- `clean`
- `patched`

If actionable findings exist, the branch must be patched before the PR is
opened. EE8 should not add an open-ended internal loop. One review-triage-patch
cycle is the intended shape.

This stage is a gate, not a soft recommendation.

`open-pr` should enforce the effective stage policy, not just the existence of a
step name in local state. A code ticket cannot publish while any stage whose
effective policy is `required` remains incomplete.

### 6. Make commit history and state carry the observability signal

Before `open-pr`, the expected commit shape for a code ticket becomes:

1. implementation commit
2. optional self-audit commit
3. optional Codex patch commit

Rules:

- self-audit commit exists only when self-audit changed code
- Codex patch commit exists only when Codex findings were acted on
- no narrative note artifact is required; the commit diff is the evidence

Delivery state should still record the self-audit and Codex-preflight outcomes
so later phases can measure whether those stages are producing value.

State should also record the effective review policy for the run so later
inspection can distinguish:

- a required stage that completed `clean`
- a required stage that completed `patched`
- a stage skipped because the ticket was doc-only
- a stage disabled by repo policy

### 7. Update docs and workflow guidance

Update `delivery-orchestrator.md` and Son-of-Anton workflow guidance so the new
internal gate is explicit.

Required documentation changes:

- ticket-linked code PR flow includes Codex preflight before `open-pr`
- doc-only tickets skip Codex preflight
- self-audit is described as `clean` or `patched`, not only "completed"
- `open-pr` requirements mention both self-audit completion and Codex preflight
  completion for code tickets
- `orchestrator.config.json` documents `reviewPolicy` with explicit stage values
  instead of boolean toggles
- the role split is clear:
  - Claude executes
  - Codex reviews internally
  - external AI vendors review post-publication

## Acceptance Criteria

- ticket-linked code flow includes a distinct Codex preflight stage between
  self-audit and `open-pr`
- doc-only tickets skip the Codex preflight stage
- `post-verify-self-audit` records a self-audit outcome of `clean` or `patched`
  in state
- self-audit code changes require a dedicated self-audit commit
- Codex findings that are acted on require a dedicated Codex patch commit
- `orchestrator.config.json` supports a `reviewPolicy` object with explicit
  stage values instead of per-stage booleans
- repo default review policy is:
  - `selfAudit: required`
  - `codexPreflight: required`
  - `externalReview: required`
- `open-pr` refuses to publish a code ticket that has not completed Codex
  preflight with `clean` or `patched`, and also refuses when self-audit is
  required but incomplete
- Codex preflight is represented by explicit orchestrator command support, not
  documentation-only discipline
- docs and Son-of-Anton guidance match the new flow exactly

## Tests

Cover at least:

- self-audit state recording for `clean` and `patched`
- `open-pr` rejection when self-audit is incomplete
- Codex preflight state recording for `clean` and `patched`
- `open-pr` rejection when Codex preflight is incomplete for code tickets
- doc-only ticket path skipping Codex preflight
- config parsing for `reviewPolicy` explicit stage values
- default review-policy resolution when `reviewPolicy` is absent
- state/status rendering that distinguishes `disabled` from doc-only `skipped`
- commit-shape enforcement for self-audit and Codex patch cases
- status output surfacing self-audit and Codex-preflight outcomes
- PR metadata or status rendering reflecting the new internal gate stages where
  applicable

## Assumptions

- `codex-plugin-cc` is available as a supported extra step in the Son-of-Anton
  environment for Claude Code.
- Codex preflight is a single bounded review-triage-patch cycle, not an
  open-ended internal review loop.
- Claude remains the patch owner even when Codex supplies the review findings.
- Review policy belongs at repo level in `orchestrator.config.json`, but stage
  semantics must remain explicit and reviewable rather than collapsing to loose
  booleans.
- If later measurement shows Claude self-audit rarely or never produces value,
  that step should be removed in a follow-up epic rather than preserved as
  workflow ritual.
