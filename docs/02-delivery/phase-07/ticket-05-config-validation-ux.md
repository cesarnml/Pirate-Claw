# `P7.05 Config Validation UX`

## Goal

Improve config validation errors so they identify the exact config path and suggest valid compact forms when operators provide malformed Phase 07 config.

## Why This Ticket Exists

Flexible config forms are only helpful if failures are understandable. Operators should be told exactly where config parsing failed and what compact shape was expected instead of getting a vague type mismatch.

## Scope

- improve config error messages for malformed compact TV config
- improve config error messages for malformed mixed `tv.shows` entries
- improve config error messages for env-backed Transmission credential misconfiguration
- include precise path references in the reported errors
- add tests covering the new error messages and suggestion text

## Out Of Scope

- localized error messaging
- schema visualization
- broader non-config CLI error redesign

## Rationale

- `Red first:` malformed compact config should fail with an error that points to the exact path and explains the accepted shape closely enough for an operator to fix it quickly.
- `Why this path:` tightening the current config-loader error surface is the smallest acceptable way to support the new ergonomic forms without forcing operators to reverse-engineer parser expectations.
- `Alternative considered:` replacing the entire config-loader validation layer with a new schema library was rejected because this ticket only commits to better operator feedback, not a validator rewrite.
- `Deferred:` schema visualization, localized messaging, and broader CLI error redesign remain outside this ticket.
