# P27.04 SPK Installer and DSM Icon

## Goal

Author the `.spk` package that installs Pirate Claw on DS918+ via Package Center, prepares the install root/artifacts where DSM permits it, and registers a DSM Main Menu app icon — following the fallback path determined by P27.01.

## Scope

**This ticket's shape depends on the P27.01 spike finding. Review the finding before starting.**

### If P27.01 pass (hooks can orchestrate Docker):

- Author a `.spk` package with install/start/stop/uninstall hooks that:
  - Create the install root directory tree (create-if-absent, per P27.02 contract)
  - Place the `compose.synology.yml` artifact under the install root
  - Start the three-service Docker stack via hook on install and start
  - Stop the stack cleanly on package stop/uninstall
- Register a DSM Main Menu app:
  - Title: `Pirate Claw`
  - Admin-visible only
  - Opens `http://<nas-ip>:8888` — use a small redirect page to resolve the current DSM host if direct URL app registration is unreliable

### If P27.01 fail (hooks cannot orchestrate Docker):

- Author a `.spk` package that:
  - Creates the install root directory tree (create-if-absent)
  - Places the `compose.synology.yml` artifact under the install root
  - Opens a first-run guidance page in DSM that walks the owner through importing the compose file via the DSM Docker GUI — fully GUI-described with screenshots, no terminal steps
- Register the same DSM Main Menu app as above
- Document this as the validated DSM 7.1 path in P27.09

### Both paths:

- Package Center **Open** button launches the same `http://<nas-ip>:8888` entrypoint
- SPK must be installable as a third-party package in Package Center (may require owner to allow third-party packages in DSM security settings — document this in the install guide)
- SPK must not hard-fail on reinstall when the install root already exists

## Out Of Scope

- DSM 7.2+ Container Manager import (documented in release bundle, not in SPK).
- Install health endpoint (P27.05).
- Release bundle zip (P27.07).

## Exit Condition

The `.spk` installs on DS918+ via Package Center. The Pirate Claw stack starts through documented DSM Docker GUI steps. The DSM Main Menu app icon appears and opens a launcher with the `:8888` entrypoint. Reinstall on an existing install root does not destroy existing data.

## Rationale

P27.01 found that DSM 7.1 Package Center hooks did not produce a GUI-observable Docker orchestration result. P27.04 therefore follows the documented fallback path instead of trying to hide Docker startup behind the `.spk`.

Added `tools/synology-spk/` as the production package source and `tools/synology-spk/build-spk.sh` to emit `.pirate-claw/synology-spk/pirate-claw.spk`. The package uses the DSM 7 lower-privilege execution model from the spike, declares the Docker package dependency, includes DSM package icons, registers `dsmuidir`/`dsmappname`, and ships a DSM Main Menu launcher.

The lifecycle hooks deliberately do not call Docker. `start-stop-status start` prepares `/volume1/pirate-claw` and the expected subdirectories on a create-if-absent basis and copies `compose.synology.yml` into the install root when DSM permissions allow it. If DSM's lower-privilege package context cannot write the shared-folder path, the hook logs the issue and leaves the package installed/running so the GUI fallback page can instruct the owner to create/upload through File Station. `stop` and uninstall leave Docker GUI-managed containers and `/volume1/pirate-claw` data untouched, preserving reinstall safety.

The DSM launcher points to a package UI page with an **Open Pirate Claw** button that resolves the current DSM host and opens `http://<nas-ip>:8888/`. The same page carries DSM 7.1 Docker GUI first-run guidance for image/import/volume steps without SSH, Docker CLI, hand-edited files, or owner-visible secrets. Full screenshot-backed owner docs remain in P27.08/P27.09.
