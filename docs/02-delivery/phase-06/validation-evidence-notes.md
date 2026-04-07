# Phase 06 Validation Evidence Notes

Purpose:
Preserve ticket-by-ticket evidence notes, screenshot reminders, redaction guidance, and private operator observations for Phase 06 without bloating the canonical runbook.

How to use this file:

- keep one section per Phase 06 ticket
- store working notes here before cropping or redacting artifacts for durable runbook inclusion
- keep operator-private reminders here if they should not appear in the operator-facing runbook
- move only the minimum validated checkpoints into `synology-runbook.md`

Privacy rule:

- treat this file as an internal working artifact, not a publish-ready operator guide
- redact or omit secrets, public IPs, usernames, hostnames, and unrelated desktop or browser details before copying any evidence into the runbook or an external issue

## P6.01 Runbook Skeleton And Acceptance Checklist

Status:
Validated on `main`.

Notes:

- the canonical operator artifact remains `docs/02-delivery/phase-06/synology-runbook.md`
- ticket rationale and this file carry the heavier proof and working notes so the runbook stays concise

Evidence notes:

- no screenshot set currently needs to be preserved here beyond normal doc-review history

## P6.02 Synology Storage Layout And Mount Baseline

Status:
Validated on the target `DS918+ / DSM 7.1.1-42962 Update 9` NAS.

What was proven:

- shared folders `pirate-claw`, `transmission`, and `media` exist on `Volume 1`
- the required subdirectory tree exists exactly as documented
- the DSM setup account has the expected `Read/Write` access for this baseline
- the NAS shell validation commands succeeded against the target paths
- write checks succeeded for:
  - `/volume1/pirate-claw/runtime/.p6-02-write-check`
  - `/volume1/transmission/config/.p6-02-write-check`
  - `/volume1/media/downloads/.p6-02-write-check`

Recommended durable runbook artifacts:

- `Control Panel -> Shared Folder` showing `pirate-claw`, `transmission`, and `media` on `Volume 1`
- one permissions view showing the DSM setup account has `Read/Write`
- `File Station` showing `pirate-claw/config`, `pirate-claw/runtime`, and `pirate-claw/logs`
- `File Station` showing `transmission/config` and `transmission/watch`
- `File Station` showing `media/downloads` and `media/downloads/incomplete`
- one NAS shell capture showing successful `find`, `ls -ld`, and write-check results

Current private/raw evidence notes:

- the DSM walkthrough was captured as a larger clickstream; keep only the minimum proof set above when preparing runbook artifacts
- the terminal proof confirms the expected tree and successful create/remove write checks
- SSH tunneling is not a `P6.02` requirement; only a safe path to an NAS shell is required

Cropping and redaction notes:

- crop tightly to the relevant DSM pane or terminal output
- remove public IPs, usernames, hostnames, tabs, bookmarks, desktop notifications, and unrelated shares
- exclude unrelated terminal tabs or sessions
- keep only the command block and the confirming output in the terminal artifact

Follow-up note:

- if later tickets need the same NAS shell access path, reuse it instead of rediscovering the remote-shell setup

## P6.03 Transmission Container Baseline

Status:
Validated on the target `DS918+ / DSM 7.1.1-42962 Update 9` NAS.

What was proven:

- `linuxserver/transmission:latest` image pulled and container created with documented settings
- container name `transmission`, restart policy `always`, ports `9091/tcp`, `51413/tcp`, `51413/udp`
- bind mounts: `/volume1/transmission/config -> /config`, `/volume1/transmission/watch -> /watch`, `/volume1/media/downloads -> /downloads`
- PUID `1026`, PGID `100` confirmed via `id` on the NAS
- `settings.json`, `bandwidth-groups.json`, `stats.json` written to `/volume1/transmission/config/`
- `curl` health check returned `200` from the NAS
- logs show clean startup with no permission errors after permission fix
- Docker package confirmed as `Docker` on DSM 7.1.x (not `Container Manager`)
- docker binary lives at `/var/packages/Docker/target/usr/bin/docker`, not on default SSH PATH

Issues found and resolved during validation:

- Synology DSM shared folders have restrictive default ACLs (`d---------`); `chmod 755` and `chown 1026:100` required on bind-mount dirs before the container can write
- `linuxserver/transmission` expects `/downloads/complete`; added `media/downloads/complete` to the storage layout
- `docker` command requires root or PATH export on DSM 7.1.x
- initial runbook referenced `Container Manager` which is the DSM 7.2+ name; corrected to `Docker` for DSM 7.1.x

Evidence captured:

- `docker ps` output: container running with correct image, ports, uptime
- `docker logs` output: clean Transmission startup, RPC serving on `0.0.0.0:9091`
- `ls -la /volume1/transmission/config/`: `settings.json` and runtime files present
- `curl` returning `200` from `http://localhost:9091/transmission/web/`
- `docker inspect` confirming restart policy `always`
- `ls -la /volume1/media/downloads/`: `complete/` and `incomplete/` directories present

Redaction applied:

- public IP redacted from evidence notes (appeared in Transmission's `ip-cache` log line)

Notes:

- `rpc-whitelist-enabled` defaults to `false` in this image, which is appropriate for local-LAN-first operation
- the IPv6 LPD warning is expected in Docker bridge networking and not a failure

## P6.04 Pirate Claw Container Baseline

Status:
Pending validation.

Notes:

- capture image reference, daemon command or entrypoint, bind mounts, env inputs, and first healthy log proof here
- note any mismatch between repo expectations and Container Manager UX while it is fresh

## P6.05 Secrets And Env Injection

Status:
Pending validation.

Notes:

- capture which settings are safe to show as examples and which must remain redacted
- preserve where the operator enters env values in DSM so the runbook can stay precise without leaking secrets

## P6.06 Daemon Restart Semantics

Status:
Pending validation.

Notes:

- capture what survives container restart, recreation, and NAS reboot
- preserve the exact post-restart checks that most quickly prove healthy recovery

## P6.07 Upgrade Path

Status:
Pending validation.

Notes:

- capture the before-and-after image references and any backup or snapshot reminders
- note which persistent paths proved durable across replacement

## P6.08 Fresh End-To-End Runbook Validation

Status:
Pending validation.

Notes:

- preserve the one explicit safe validation input used for the clean run
- record the smallest evidence set that proves the runbook works end to end without hidden steps

## P6.09 Troubleshooting Guide

Status:
Pending validation.

Notes:

- collect only the shortest useful failure signatures and the exact checks that disambiguate them
- avoid turning this section into a generic Synology knowledge base

## P6.10 Portability Notes And Explicit Non-Validated Differences

Status:
Pending validation.

Notes:

- record only differences actually observed or strongly justified by the validated baseline boundaries
- keep unvalidated portability claims clearly labeled as non-validated
