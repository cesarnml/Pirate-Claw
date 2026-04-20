# P21.04 README: Plex Version Prereq and First-Boot Operator Contract

## Goal

Document the complete zero-file-editing first-boot path for both Mac (local dev/test) and Synology NAS (production), so the operator can reach browser-visible starter mode without SSH, vim, or manual file creation.

## Scope

- Identify the minimum Plex Media Server version required for API support and add it to the README
- **Synology section:**
  - How to check current Plex version in Package Center
  - How to upgrade Plex via Synology Package Center if the installed version is below the minimum
  - Confirmation that no config file editing is required — the system creates the starter config on first boot
  - Expected first-boot sequence: start container → open browser at `http://<nas-ip>:<port>` → see starter mode
- **Mac section:**
  - How to install/upgrade Plex Media Server on Mac (direct download from plex.tv, not Package Center)
  - Minimum version requirement (same floor as Synology)
  - Expected first-boot sequence: `bun run dev` (or equivalent) → open browser → see starter mode
  - Note: Mac launchd supervisor setup for auto-restart is covered in P23
- **Shared:**
  - Operator promise: zero SSH, zero vim, zero hand-edited files required to reach starter mode
  - What starter mode looks like in the browser (one sentence or screenshot reference)
- Remove or update any existing README text that references copying `pirate-claw.config.example.json` or hand-editing config as part of first-boot setup

## Out Of Scope

- Mac launchd / auto-restart setup (P23)
- Synology supervisor contract beyond what is needed to start once (P23)
- Onboarding flow documentation (P22)

## Exit Condition

An operator can follow the README on Mac or Synology, start Pirate Claw, open the browser, and see starter mode — with no file editing at any step. All first-boot references to manual config creation are removed.

## Blocked By

P21.01 — starter config behavior must be confirmed before documenting it

## Rationale

- Covering both Mac and Synology reflects the real operator journey: dev/test on Mac, deploy to Synology. The README should work for both without separate docs.
- Plex version prereq is a README concern, not a code concern — the operator install path through Package Center or plex.tv is a one-time step that doesn't warrant in-app detection for P21.
