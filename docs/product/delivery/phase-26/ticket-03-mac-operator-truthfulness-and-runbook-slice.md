# P26.03 Mac Operator Truthfulness and Runbook Slice

## Goal

Make the supported Mac story visible and usable by adding a dedicated Mac runbook and the thinnest operator-facing truthfulness updates needed once the `launchd` contract is real.

## Scope

### Mac runbook

- add a dedicated Mac operator runbook for the supported `launchd` deployment path
- document install, update, remove, working-directory, durable-path, and restart expectations for the Mac reference posture
- keep Mac operational procedures separate from the Synology runbook while preserving consistent shared product-boundary language

### Operator-visible truthfulness

- update the minimum product/docs surfaces needed so Mac support is neither overstated nor hidden after `P26.02`
- distinguish supported Mac deployment from developer-only shortcuts
- keep browser restart expectations on Mac aligned with the actual supervisor-handoff contract delivered in earlier tickets

## Out Of Scope

- new restart/runtime semantics (`P26.02`)
- broad overview/status closeout and retrospective (`P26.04`)
- collapsing Synology and Mac procedures into one mixed-platform runbook

## Exit Condition

An operator can follow one dedicated Mac runbook and see truthful support language for the supported `launchd` path without conflating it with the Synology reference deployment.

## Rationale

Mac support should become visible before the final docs closeout, but the first durable output here is operational clarity, not another broad code ticket. Splitting the Mac runbook from the Synology runbook keeps both deployment stories credible.
