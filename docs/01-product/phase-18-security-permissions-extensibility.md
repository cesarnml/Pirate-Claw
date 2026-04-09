# Phase 18: Security, Permissions, and Extensibility Baseline

## Goal

Establish a secure, single-admin baseline and prepare for future extensibility and schema evolution.

## Deliverables

- Write access protected by PIRATE_CLAW_API_WRITE_TOKEN
- Single-admin model, no user accounts
- Config/db schema versioning and compatibility check on startup
- Document breaking change policy (major version = new schema)
- No audit logs, plugin, or extension support in v1

## Explicit Deferrals

- No multi-user support
- No plugin/extensibility in v1
- No audit logs/change tracking
