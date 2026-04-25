# P27.04 SPK Installer and DSM Icon

## Goal

Author the `.spk` package that installs Pirate Claw on DS918+ via Package Center, creates the install root, starts the Docker stack, and registers a DSM Main Menu app icon — following the path determined by P27.01.

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

The `.spk` installs on DS918+ via Package Center. The Pirate Claw stack starts (directly or via documented GUI steps). The DSM Main Menu app icon appears and opens `:8888`. Reinstall on an existing install root does not destroy existing data.

## Rationale

_To be completed after implementation, including which spike path was followed and why._
