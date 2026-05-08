# P26.02 Mac Restart Truthfulness and Real-Machine Validation

## Goal

Make the existing restart-backed Pirate Claw behavior truthful under the supported Mac `launchd` contract and prove that truth on a real Apple Silicon Mac.

## Scope

### Runtime truthfulness

- harden any daemon, API, browser-restart, path, or environment behavior required for the Phase 25 restart story to remain truthful under per-user `launchd`
- preserve the existing durable state boundary so config, SQLite state, and existing auth state survive the Mac-supervised restart path together
- keep the supported story bounded to supervisor handoff and proven return, not full host lifecycle management

### Real-machine validation

- validate install, start under `launchd`, browser-triggered restart handoff, daemon return, and persistence across restart on the real Mac reference environment
- record the validated environment and the proof bar clearly enough to support the Apple Silicon-only claim for this phase
- add the narrow tests or validation hooks needed to keep the contract reviewable in-repo

## Out Of Scope

- the first dedicated Mac operator runbook and broad support messaging (`P26.03`)
- final overview/doc closeout and retrospective (`P26.04`)
- widening the support claim to Intel Macs or system-wide daemons

## Exit Condition

Pirate Claw can run under the supported Mac `launchd` contract, accept restart-backed behavior truthfully, and demonstrate on a real Apple Silicon Mac that config, SQLite state, and existing auth state survive the round-trip.

## Rationale

This is the smallest code-bearing slice that turns the Mac contract from a declared artifact into a supportable reality. If it cannot be made truthful here, the phase should stop before broader docs and support claims spread the wrong story.
