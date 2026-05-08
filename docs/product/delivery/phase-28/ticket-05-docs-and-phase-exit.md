# P28.05 Docs and Phase Exit

## Goal

Close the Phase 28 documentation loop and write the phase retrospective.

## Scope

**Owner-facing docs:**

- Update `docs/synology-install.md` — add a P28 section noting that first launch requires creating an owner account; include the "complete setup immediately" security note
- Update `docs/mac-runbook.md` — same owner account note for Mac operators

**Security posture:**

- Add or update a security posture section in `docs/synology-install.md` covering:
  - v1 is for LAN / Tailscale access only; not hardened for public internet exposure
  - first-launch owner setup must be completed before the web UI is safe to leave accessible
  - what trusted origins are and how to add a new one (e.g. Tailscale IP)
  - direct-mode acknowledgement and what it means

**Overview docs:**

- Update `docs/overview/roadmap.md` — mark P28 implemented
- Update `docs/overview/start-here.md` — reflect owner auth as the new baseline; note the P28 security boundary

**Retrospective (required):**

- Write `notes/public/phase-28-owner-web-security-retrospective.md` covering:
  - JWT vs. opaque session decision and rationale
  - trust-on-first-visit design and the Tailscale use case
  - direct-mode acknowledgement as a Phase 29 placeholder
  - any assumptions that P29 planning should revisit

**Ticket rationale:**

- Confirm all P28 ticket rationale sections are non-empty and reflect actual implementation choices.

## Out Of Scope

- Any new product features
- P29/P30 planning

## Exit Condition

Owner-facing and overview docs are updated. Security posture is documented. Retrospective is written. All P28 ticket rationale sections are complete. Phase 28 is documentation-closed.

## Rationale

Documentation-close ticket for Phase 28. All owner-facing and overview docs were updated in a single pass to reflect the P28 security baseline: owner account creation on first launch, session-protected web UI, trusted-origin banner, and direct-mode acknowledgement. The security posture section in `synology-install.md` was added here rather than in an earlier ticket to keep the install guide stable until the full feature set was validated on DS918+. The retrospective captures the JWT vs. opaque session decision, trust-on-first-visit design, and the known gaps (CSRF/allowedOrigins, Plex PIN callback) that P29 planning must address.
