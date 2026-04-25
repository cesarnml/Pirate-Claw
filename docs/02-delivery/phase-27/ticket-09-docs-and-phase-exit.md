# P27.09 Docs and Phase Exit

## Goal

Close the Phase 27 documentation loop and write the phase retrospective after the validated install flow lands.

## Scope

**Owner-facing docs (no terminal commands):**

- Create or update `docs/synology-install.md` — DSM-first owner install path; links to validated DSM 7.1 flow and DSM 7.2+ pending-validation path; references screenshots from P27.08
- Update README Synology section to point to `docs/synology-install.md`

**Operator docs:**

- Update `docs/synology-runbook.md` — advanced/manual operator notes; clearly marked outside the owner path; may include Docker CLI and shell details

**Overview docs:**

- Update `docs/00-overview/roadmap.md` — mark P27 implemented
- Update `docs/00-overview/start-here.md` — reflect Synology DSM-first as the supported install path

**Retrospective (required):**

- Write `notes/public/phase-27-retrospective.md` covering:
  - What the spike found about `.spk` Docker orchestration
  - What worked and what was harder than expected in SPK authoring
  - Whether the DSM-first owner contract held through delivery
  - Any assumptions that P28/P29 planning should revisit

**Ticket rationale:**

- Confirm all P27 ticket rationale sections are non-empty and reflect actual implementation choices.

## Out Of Scope

- Any new product features.
- P28/P29 planning — the retrospective informs but does not commit to downstream changes.

## Exit Condition

Owner-facing docs are complete with no terminal commands. Runbook is updated. README and overview docs reflect shipped P27. Retrospective is written. All P27 ticket rationale sections are complete. Phase 27 is documentation-closed.

## Rationale

_To be completed after implementation._
