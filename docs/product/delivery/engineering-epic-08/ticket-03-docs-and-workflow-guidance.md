# EE8.03 — Docs And Workflow Guidance

## Goal

Bring delivery docs and Son-of-Anton guidance into exact alignment with the
shipped EE8 behavior.

## Current Behavior

After EE8.01 and EE8.02 ship:

- `delivery-orchestrator.md` still describes the pre-EE8 ticket flow with no
  Codex preflight stage
- Son-of-Anton skill guidance has no mention of `codex-preflight` or
  `selfAuditOutcome`
- The `orchestrator.config.json` example in docs does not show `reviewPolicy`
- No doc explains that `codexPreflight` defaults to `disabled` or how to enable it

## Target Behavior

Docs describe the shipped EE8 behavior exactly:

- Ticket flow for code tickets includes the Codex preflight stage between
  self-audit and `open-pr`
- Doc-only tickets are documented as auto-skipping Codex preflight
- `post-verify-self-audit` is documented as accepting an optional `clean|patched`
  arg, defaulting to `clean`
- `orchestrator.config.json` example shows the full `reviewPolicy` object with
  all three stages and their defaults:

  ```json
  {
    "reviewPolicy": {
      "selfAudit": "required",
      "codexPreflight": "disabled",
      "externalReview": "required"
    }
  }
  ```

- Docs note that `codexPreflight` defaults to `disabled` and explain how to
  enable it (`"required"`) after a successful trial run
- Son-of-Anton guidance documents the agent's role: run the Codex skill, then
  call `bun run deliver codex-preflight [clean|patched]` to record the outcome
- The role split is explicit:
  - Claude executes and patches
  - Codex reviews internally via the `codex:codex-rescue` skill
  - External AI vendors review post-publication
- Error message for unavailable `codex-plugin-cc` is documented with the config
  escape hatch

## Change Surface

- `docs/engineering/delivery-orchestrator.md`
- `.agents/skills/son-of-anton-ethos/SKILL.md`
- `docs/engineering/epic-08-codex-preflight-review-gate.md` only if the
  assumptions section needs correction after implementation

## Acceptance Criteria

- [ ] `delivery-orchestrator.md` shows the updated code ticket flow including
      Codex preflight stage
- [ ] doc-only ticket flow is documented as auto-skipping Codex preflight
- [ ] `post-verify-self-audit` usage documented with optional outcome arg
- [ ] `orchestrator.config.json` example includes full `reviewPolicy` object with
      correct defaults
- [ ] `codexPreflight: "disabled"` default is explained with instructions for
      enabling
- [ ] Son-of-Anton guidance includes `codex-preflight` command in the ticket
      execution flow
- [ ] role split (Claude executes, Codex reviews, external vendors post-PR) is
      explicit in guidance
- [ ] no stale pre-EE8 ticket flow description remains in updated docs

## Rationale

Stale workflow docs after a gate change are an immediate operator hazard. The
next Son-of-Anton run reads these docs as the source of truth. If the Codex
preflight step is absent or the config example is missing `reviewPolicy`, the
agent will skip the step or misconfigure the gate. This ticket closes that gap.

## Notes

- Docs-only slice. No code changes.
- The `orchestrator.config.json` example is the most critical update — it is
  what operators copy when bootstrapping a new plan.
- If the epic doc assumptions section in `epic-08-codex-preflight-review-gate.md`
  turned out to be wrong after implementation, correct it here. Do not leave
  false assumptions in a shipped epic doc.
