# `P7.03 Config Normalization Visibility`

## Goal

Add a CLI-visible way to render the fully-expanded effective config so operators can audit how compact config forms resolve before or after a run.

## Why This Ticket Exists

More flexible config ingestion increases the need for visibility. Operators should not have to infer how `tv.defaults`, mixed `tv.shows`, and env-backed config resolve into the effective runtime config.

## Scope

- add a CLI command such as `pirate-claw config show` or `pirate-claw config normalize`
- load the configured app config through the same normalization path used by runtime commands
- print the fully-expanded effective config in a stable human-readable or JSON form
- document the command in operator-facing docs
- add tests covering normalized output for compact TV config

## Out Of Scope

- interactive config editing
- schema introspection beyond showing the effective config
- env-backed secret loading behavior itself (P7.04)
- validation-guidance improvements beyond what is needed for the command (P7.05)

## Rationale

- `Red first:` when compact TV config is present, operators should be able to ask the CLI what effective rules Pirate Claw will actually use and see the expanded result.
- `Why this path:` one bounded config-inspection command is the smallest acceptable way to make flexible config ingestion auditable without redesigning status or runtime artifacts.
- `Alternative considered:` surfacing the normalized config only through daemon artifacts was rejected because operators need an on-demand inspection path even when the daemon is not running.
- `Deferred:` interactive config tooling, broader schema introspection, and validation-polish work beyond the command itself remain outside this ticket.
- `Implementation note:` `pirate-claw config show` reuses the existing `loadConfig` normalization path and prints the resulting `AppConfig` as stable pretty JSON, which avoided introducing a second config-rendering model.
- `Validation note:` CLI coverage now exercises compact TV defaults plus per-show overrides through the public command so this visibility path stays aligned with the runtime loader rather than only with unit-level config tests.
