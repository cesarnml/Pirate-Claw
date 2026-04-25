# Pirate Claw Synology SPK

Production Phase 27 package source for the DSM 7.1 Package Center path.

Build:

```bash
tools/synology-spk/build-spk.sh
```

The generated package is written to `.pirate-claw/synology-spk/pirate-claw.spk`, which is intentionally ignored by git.

P27.01 proved that DSM 7.1 Package Center hooks did not provide a GUI-observable Docker orchestration path on the DS918+ baseline. This package therefore follows the fallback contract:

- install as a lower-privilege third-party package
- create `/volume1/pirate-claw` and the expected subdirectories on a best-effort create-if-absent basis
- copy `compose.synology.yml` into the install root when package hooks can write there
- register a DSM Main Menu launcher
- provide DSM GUI-only first-run guidance for Docker image/import/volume steps

The package does not call `docker`, `docker compose`, `synopkg` Docker helpers, SSH, or shell-only owner instructions from lifecycle hooks.
