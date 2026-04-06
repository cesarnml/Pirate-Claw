# `P7.02 TV Per-Show Overrides`

## Goal

Allow `tv.shows` to contain mixed entries so operators can use plain strings for defaulted shows and object entries for bounded overrides such as `matchPattern`, `resolutions`, or `codecs`.

## Why This Ticket Exists

Compact TV config is only useful if it still handles exceptions cleanly. Some shows need a custom match pattern or a different quality policy, and forcing those exceptions back into the fully-expanded top-level array would undermine the compact shape.

## Scope

- allow `tv.shows` to contain plain string entries and object entries
- support object-entry overrides for `matchPattern`, `resolutions`, and `codecs`
- keep compact defaults inheritance for fields not overridden
- normalize mixed entries into the same internal `TvRule[]` model used elsewhere
- add tests covering default inheritance, object-entry overrides, and mixed-entry loading order

## Out Of Scope

- named profiles or reusable quality presets
- config rendering commands (P7.03)
- env-backed secrets (P7.04)
- broader validation UX beyond what is required for mixed-entry support (P7.05)

## Rationale

- `Red first:` a compact config with a plain-string show and an object-override show should load into distinct effective rules with the expected inherited and overridden fields.
- `Why this path:` mixed `tv.shows` entries preserve the compact happy path while giving exceptions a local escape hatch, which is the smallest acceptable extension beyond P7.01.
- `Alternative considered:` introducing named profiles in the same ticket was rejected because it adds an extra indirection layer before the compact/default model is proven useful.
- `Deferred:` profile systems, config rendering, env-backed secrets, and richer validation guidance remain separate tickets.
