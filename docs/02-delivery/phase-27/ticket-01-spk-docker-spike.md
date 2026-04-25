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

_To be completed after spike execution._
