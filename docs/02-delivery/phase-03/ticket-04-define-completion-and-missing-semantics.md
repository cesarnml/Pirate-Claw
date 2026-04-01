# `P3.04 Define Completion And Missing Semantics`

## Goal

Make completion and missing-from-Transmission behavior explicit in both persistence and operator output.

## Why This Ticket Exists

Phase 03 needs honest semantics for torrents that finish downloading and for torrents that later disappear from Transmission, including cases where removal may have been manual.

## Scope

- define the local meaning of `completed`
- define the local meaning of `missing_from_transmission`
- ensure reconciliation and status behavior follow those semantics consistently
- document the operator-facing behavior and add targeted tests

## Out Of Scope

- recovering intent behind a manual removal
- seeding policy beyond completion
- final media placement or archive behavior

## Red First Prompt

What visible behavior fails first when Pirate Claw cannot distinguish a completed torrent from one that has simply disappeared from Transmission?
