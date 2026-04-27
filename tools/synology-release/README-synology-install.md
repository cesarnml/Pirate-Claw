# Pirate Claw Synology Install

This bundle contains the DSM-first install artifacts for Pirate Claw.

## Choose Your DSM Path

- DSM 7.1 with the legacy Docker package: use `install-dsm-7.1-docker.md`.
- DSM 7.2 or newer with Container Manager: use `install-dsm-7.2-container-manager.md`.

The DSM 7.1 path is the Phase 27 validation baseline for DS918+ on DSM 7.1.1-42962 Update 9. The DSM 7.2+ path is included for newer systems and is marked validation pending until an external tester verifies it.

## Bundle Contents

- `images/pirate-claw-image-vX.Y.Z.tar`: Pirate Claw daemon image for DSM Docker GUI import.
- `images/pirate-claw-web-image-vX.Y.Z.tar`: Pirate Claw web image for DSM Docker GUI import.
- `images/transmission-image-vX.Y.Z.tar`: bundled Transmission image for DSM Docker GUI import. After import, DSM may display the image using its upstream registry tag, `lscr.io/linuxserver/transmission:latest`.
- `compose.synology.cm.yml`: Container Manager Project artifact for DSM 7.2+.
- `install-dsm-7.1-docker.md`: DSM 7.1 Docker GUI install guide.
- `install-dsm-7.2-container-manager.md`: DSM 7.2+ Container Manager guide.
- `screenshots/`: placeholders for the validation captures added by the next delivery ticket.

## Operator Contract

The owner path stays inside DSM screens: Package Center, File Station, Docker or Container Manager, Main Menu, and the Pirate Claw browser page. Do not use SSH, terminal commands, hand-edited JSON, hand-edited environment files, or owner-visible secrets for this install path.
