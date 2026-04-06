# Phase 07 Config Ergonomics

Phase 07 improves the operator experience of authoring and inspecting `pirate-claw.config.json` without changing the core feed, queueing, or runtime model.

This is a product-facing phase, and it is independent of the Synology runbook work in Phase 06. It may be implemented next because it builds on the current local config and CLI surface rather than on NAS validation.

## Phase Goal

Phase 07 should make common TV tracking config materially less repetitive, make the effective config visible on demand, and reduce the awkwardness of storing Transmission credentials directly in the main JSON file.

## Committed Scope

- support compact TV config through `tv.defaults + tv.shows`
- allow per-show overrides inside `tv.shows`
- add a CLI-visible way to render the fully-expanded effective config
- allow Transmission username/password to come from env vars or `.env`
- improve config validation errors so operators can quickly find and correct malformed compact config

## Exit Condition

An operator can express common TV tracking intent with materially less repetition than the current `TvRule[]`-only form, inspect the normalized effective config through the CLI, and keep Transmission credentials out of the main JSON file when desired.

## Explicit Deferrals

These are intentionally outside Phase 07:

- config mini-DSLs or named profile systems
- broad ingestion redesign beyond the current config model
- non-Transmission secret providers or secret-manager integrations
- orchestrator or `orchestrator.config.json` refactors
- delivery-tooling module decomposition

## Why The Scope Stays Narrow

The highest-value operator pain today is config ergonomics, not a broader redesign of ingestion or delivery tooling. This phase keeps the scope on the operator-facing config surface so it can ship in thin, reviewable slices without mixing in engineering-internal cleanup that belongs to a separate tooling epic.
