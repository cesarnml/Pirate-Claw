# P27.01 SPK Docker Orchestration Spike

## Goal

Determine whether a Synology `.spk` package can create and start Docker containers on DS918+ DSM 7.1 via Package Center hooks, without any SSH or Docker CLI steps from the owner.

## Scope

- Author a minimal `.spk` package with install/start hooks that create and start a single Docker container (any image — `hello-world` or similar is sufficient).
- Install the package on DS918+ via Package Center using Codex + Computer Use against `https://100.108.117.42:5001/`.
- Observe whether the container appears as running in the DSM Docker package GUI without any terminal interaction.
- Document the finding: which hook types are available, what shell context they run in, whether Docker CLI is accessible from hooks, and any restrictions encountered.
- If orchestration succeeds: record the working hook pattern for P27.04.
- If orchestration fails: confirm that the fallback path (File Station folder creation + DSM Docker GUI import from a compose file) is fully GUI-accessible without terminal steps, and document that flow for P27.04.

## Out Of Scope

- Any Pirate Claw service or stack wiring.
- Compose file authoring (P27.03).
- Permanent install root creation (P27.02).
- DSM Main Menu icon.

## Exit Condition

A written finding is committed to this ticket's rationale section confirming one of:

- **Pass:** `.spk` hooks can create and start Docker containers on DSM 7.1 via Package Center. The working hook pattern is documented.
- **Fail:** `.spk` hooks cannot orchestrate Docker containers from Package Center alone. The GUI-only fallback flow (File Station + Docker GUI import) is confirmed feasible and documented.

P27.04 scope must be reviewed against this finding before that ticket starts.

## Rationale

**Finding: Fail.** A minimal lower-privilege `.spk` was built with `INFO`, `conf/privilege`, `scripts/start-stop-status`, and `scripts/postuninst`. DSM 7.1 rejected the initial root-privileged package shape, so the spike used Synology's lower-privilege package execution model (`run-as: package`) before validation.

The package installed through Package Center after the third-party package warning, but DSM immediately left `Pirate Claw SPK Spike` stopped and reported `System failed to start [Pirate Claw SPK Spike]`. The Package Center **Repair** CTA retried the same failing start path and also failed. Docker GUI validation showed no `pirate-claw-spk-spike` container and no `busybox:latest` image after install/repair, so the hook did not produce any GUI-observable Docker orchestration result.

Available hook surface from the spike:

- `scripts/start-stop-status start|stop|status` is the lifecycle entrypoint Package Center uses for a startable package.
- `scripts/postuninst` runs after uninstall and is suitable for best-effort cleanup.
- DSM 7.1 root-privileged third-party packages are rejected by Package Center unless privilege settings are changed; `conf/privilege` is required for an owner-safe install path.
- Under the lower-privilege package context, Docker orchestration did not succeed from the owner-visible Package Center path. The GUI-only validation cannot distinguish whether the failure was Docker CLI path, package-user permission, network/image pull, or script-shape related without using SSH or NAS-side CLI diagnostics, which are outside the Phase 27 owner contract.

Fallback feasibility:

- DSM Docker's **Container > Settings > Import** flow opens a DSM file picker rooted in shared folders and includes an **Upload** entry. The dialog did not advertise supported file extensions, but it is GUI-accessible and can select files from DSM shares.
- File Station can create folders and upload files through the GUI.
- Developer clarification after the spike: DSM 7.1 fallback may include multiple GUI-only Docker image/import and volume mount steps. The controlling constraint is no SSH, no Docker CLI, no hand-edited files, and no owner-visible secrets.

P27.04 must not assume Package Center hooks can create/start Docker containers on DSM 7.1. It should either use a documented GUI-only File Station + Docker import/image/mount path or explicitly revise scope before implementation if the required artifact format is not compatible with legacy DSM Docker.
