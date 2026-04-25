# P27.07 Release Bundle Assembly

## Goal

Define and produce the Synology release bundle zip structure, containing all install artifacts needed by a DSM-first owner.

## Scope

- Define and document the release bundle structure:
  ```
  pirate-claw-synology-vX.Y.Z.zip
    pirate-claw.spk
    compose.synology.cm.yml
    README-synology-install.md
    install-dsm-7.1-docker.md
    install-dsm-7.2-container-manager.md
    screenshots/
      dsm-7.1-docker/      ← populated by P27.08
      dsm-7.2-container-manager/  ← marked pending external validation
  ```
- Author or update:
  - `README-synology-install.md` — one-page entry point linking to the two install guides
  - `install-dsm-7.1-docker.md` — step-by-step DSM 7.1 validated install path; no terminal commands; screenshot placeholders for P27.08
  - `install-dsm-7.2-container-manager.md` — DSM 7.2+ Container Manager import path; explicitly marked "validation pending external tester"
- `compose.synology.cm.yml` carries an explicit validation-pending notice at the top of the file.
- Add a build script or Makefile target that assembles the zip from the built `.spk` and authored artifacts.
- Bundle does not contain any secret values, token placeholders, or hand-fill instructions.

## Out Of Scope

- Screenshot capture (P27.08).
- `docs/synology-install.md` and main repo docs (P27.09).

## Exit Condition

The release bundle zip can be assembled from a single script invocation. Bundle contents match the defined structure. Install guide docs are complete except for screenshot files, which are placeholders to be filled by P27.08.

## Rationale

_To be completed after implementation._
