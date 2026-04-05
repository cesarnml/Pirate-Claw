# Phase 06 Synology Runbook

Phase 06 makes Pirate Claw operational for NAS use as a documentation-and-validation phase, not an implementation phase for deployment tooling.

## Phase Goal

Phase 06 should leave Pirate Claw in a state where an operator can follow a tested runbook to run Pirate Claw and Transmission continuously on Synology.

## Committed Scope

- provide a validated Synology deployment runbook that covers:
  - prerequisites
  - setup steps
  - runtime expectations
  - restart behavior
  - upgrade path
  - troubleshooting
- document operational boundaries and what remains manual

## Exit Condition

A clean Synology environment can be configured by following the runbook only, resulting in an always-on Pirate Claw + Transmission setup with documented operator verification steps.

## Explicit Deferrals

These are intentionally outside Phase 06:

- repo-managed Docker Compose bundle
- backup/restore automation scripts
- health-check daemon behavior beyond what existing runtime already supports
- one-click installation tooling

## Why The Scope Stays Narrow

The immediate value is repeatable operator setup with low ambiguity. Tooling automation can follow once the runbook path is proven stable.
