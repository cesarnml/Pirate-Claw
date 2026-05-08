# `P3.03 Show Post-Queue Lifecycle In Status`

## Goal

Extend operator status output so the latest locally known post-queue lifecycle is visible without inspecting SQLite directly.

## Why This Ticket Exists

Phase 03 is only useful to an operator if the reconciled torrent lifecycle can be inspected through the CLI.

## Scope

- update status output to show the latest lifecycle for tracked torrents
- prefer latest known state first and include brief extra detail only if it remains cheap and readable
- add or update CLI and status-facing tests

## Out Of Scope

- live refresh during status
- UI work beyond the CLI
- historical analytics beyond what the current status view needs

## Red First Prompt

What user-visible status behavior fails first when reconciled lifecycle state is persisted but not exposed through the CLI?
