# `P4.04 Add Shared Runtime Lock And Overlap Skip Semantics`

## Goal

Guarantee deterministic daemon behavior by preventing overlapping run/reconcile execution and recording explicit skip semantics.

## Why This Ticket Exists

Without a shared lock, run and reconcile cycles can overlap and create race-prone state transitions. Phase 04 explicitly requires skip-on-busy with reason `already_running`.

## Scope

- enforce one shared runtime lock across run and reconcile tasks
- if a cycle is due while another task is running, skip and record `already_running`
- add tests for overlap prevention and skip reason behavior

## Out Of Scope

- artifact formatting and retention logic
- policy changes for codec or Transmission labels

## Red First Prompt

What deterministic runtime behavior fails first when due cycles are allowed to overlap instead of being skipped with `already_running`?
