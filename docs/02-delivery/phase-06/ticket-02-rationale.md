# `P6.02` Rationale

- red first: the Synology baseline is not credible unless durable bind-mounted paths are proven before any container setup starts
- chosen path: lock one exact `volume1` storage layout with separate Pirate Claw state, Transmission state, and shared downloads paths, then require DSM screenshots plus shell output before later tickets proceed
- alternative rejected: combining storage setup with Transmission creation would hide whether a later failure came from mounts or from the container baseline itself
- deferred: container runtime user mapping, image-specific mounts, secrets, and restart behavior remain later tickets

## Draft Validation Checklist

Run this ticket only on the target baseline:

- Synology `DS918+`
- DSM `7.1.1-42962 Update 9`
- Synology Container Manager installed

Complete all of the following before moving to `P6.03`:

- shared folders `pirate-claw`, `transmission`, and `media` exist on `Volume 1`
- the subdirectory tree in the runbook exists exactly as written
- the DSM operator account that will manage Container Manager has `Read/Write` access to all three shared folders
- the shell validation commands in the runbook complete without permission errors
- the temporary `.p6-02-write-check` files can be created and removed successfully

## Evidence To Collect

Bring back all of the following from the NAS validation run:

- screenshot of `Control Panel -> Shared Folder` showing `pirate-claw`, `transmission`, and `media` on `Volume 1`
- screenshot of the permissions view for the DSM operator account on those shared folders
- screenshot from `File Station` showing the created subdirectory tree
- command output for:
  - `mount | grep '/volume1 '`
  - `df -h /volume1/pirate-claw /volume1/transmission /volume1/media`
  - `find /volume1/pirate-claw /volume1/transmission /volume1/media -maxdepth 2 -type d | sort`
  - `ls -ld /volume1/pirate-claw /volume1/pirate-claw/config /volume1/pirate-claw/runtime /volume1/pirate-claw/logs /volume1/transmission /volume1/transmission/config /volume1/transmission/watch /volume1/media /volume1/media/downloads /volume1/media/downloads/incomplete`
  - `ls -l /volume1/pirate-claw/runtime/.p6-02-write-check /volume1/transmission/config/.p6-02-write-check /volume1/media/downloads/.p6-02-write-check`

## Validation Result

`P6.02` is validated on the target `DS918+ / DSM 7.1.1-42962 Update 9` baseline. The reviewed DSM evidence confirmed the three shared folders on `Volume 1` and the expected setup account permissions. The reviewed NAS shell proof confirmed the documented directory tree under `/volume1`, successful `ls -ld` checks for the target paths, and successful create/remove write checks for:

- `/volume1/pirate-claw/runtime/.p6-02-write-check`
- `/volume1/transmission/config/.p6-02-write-check`
- `/volume1/media/downloads/.p6-02-write-check`
