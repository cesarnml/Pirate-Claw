# P8.03 Docs And Example Config Update

## Goal

Update user-facing docs and the example config to reflect the new per-media-type download directory feature.

## Scope

- Add `transmission.downloadDirs` to `pirate-claw.config.example.json`
- Update `README.md` configuration section with the new fields and precedence
- Update `docs/00-overview/start-here.md` delivered surface to include media placement
- Update `docs/00-overview/roadmap.md` Phase 08 status to implemented

## Out Of Scope

- Code changes (covered by P8.01 and P8.02)

## Exit Condition

An operator reading the README and example config can discover and configure per-media-type download directories without looking at source code.

## Rationale

The example config uses explicit paths (`/data/movies`, `/data/tv`) to make the feature discoverable without reading source code. The README inline JSON example mirrors the example config so operators see correct syntax in both places. The `docs/README.md` delivery index, `start-here.md` delivered surface list, and `roadmap.md` Phase 08 status are updated to reflect the implemented state.
