# Phase 16: Config Editing, Hot Reload, and Daemon Controls

## Goal

Allow users to edit configuration via the web UI, trigger hot reloads, and control the daemon lifecycle.

## Deliverables

- Form-based config editing for all supported fields (no raw editor)
- Hot reload on config changes; toast on failure
- Daemon restart button on config page
- Banner for read-only mode if write token missing
- eTag or similar for basic write collision avoidance (optional)

## Explicit Deferrals

- No rollback/version history
- No raw config editing
