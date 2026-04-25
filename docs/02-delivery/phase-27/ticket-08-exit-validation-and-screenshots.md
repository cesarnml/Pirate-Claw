# P27.08 Exit Validation and Screenshots

## Goal

Validate the complete DSM-first install flow on the real DS918+ baseline and capture all required screenshots. This ticket gates phase close.

## Scope

Codex + Computer Use against `https://100.108.117.42:5001/` executes and documents the full validated owner install path:

**Install flow:**

- Allow third-party packages in DSM security settings (if required)
- Package Center → Manual Install → `pirate-claw.spk`
- Third-party package confirmation dialog (if present)
- Package installs and appears in Package Center
- DSM Main Menu Pirate Claw icon appears
- DSM Docker package shows `pirate-claw-web`, `pirate-claw-daemon`, `transmission` containers running

**First-run flow:**

- Open `http://<nas-ip>:8888` in browser
- Install health panel shows and all checks pass
- Config onboarding steps become accessible

**Required screenshots (hard acceptance criteria):**

- DSM Security settings — third-party package allow step (if required)
- Package Center manual install dialog
- Third-party package confirmation (if present)
- Package Center showing Pirate Claw installed
- DSM Main Menu with Pirate Claw icon visible
- DSM Docker package showing all three containers running
- Browser at `:8888` showing install health panel passing
- Browser at `:8888` showing config onboarding steps accessible

Screenshots are committed to `docs/02-delivery/phase-27/screenshots/dsm-7.1-docker/` and referenced in the release bundle install guide.

**Reinstall validation:**

- Run Package Center install again on the existing install root
- Confirm existing config and data are not wiped
- Confirm stack restarts cleanly

## Out Of Scope

- DSM 7.2+ Container Manager validation (pending external tester).
- Owner auth flow (P28).

## Exit Condition

All required DSM 7.1 screenshots are captured and committed. The full install flow completes on the real DS918+ without SSH, terminal commands, manual JSON edits, or manual Docker container assembly. Reinstall is safe.

## Rationale

_To be completed after validation run._
