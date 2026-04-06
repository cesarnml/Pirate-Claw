# `P7.01 Compact TV Config`

## Goal

Support `tv.defaults + tv.shows` as a compact TV config form while preserving backward compatibility with the current `TvRule[]` input shape.

## Why This Ticket Exists

The current TV config repeats the same `resolutions` and `codecs` block for every tracked show. Operators with one dominant quality policy should be able to declare that default once and list tracked titles without boilerplate.

## Scope

- accept a compact TV config object with `defaults` and `shows`
- keep the current `TvRule[]` array form working unchanged
- normalize the compact form into the existing internal `TvRule[]` model
- require `tv.defaults` to define the shared TV quality policy for compact entries
- allow `tv.shows` to contain title-only entries that inherit the defaults
- add tests covering compact-form loading and backward compatibility with the existing array form

## Out Of Scope

- per-show override objects inside `tv.shows` (P7.02)
- CLI rendering of normalized config (P7.03)
- env-backed secrets (P7.04)
- validation-guidance polish beyond what is needed to accept the compact form (P7.05)

## Rationale

- `Red first:` a compact config using `tv.defaults + tv.shows` should load successfully and produce the same effective TV rules as the current expanded form.
- `Why this path:` widening config ingestion while preserving the existing internal `TvRule[]` model is the smallest acceptable slice because it improves operator ergonomics without forcing matcher or pipeline redesign.
- `Alternative considered:` replacing the old `TvRule[]` form outright was rejected because Phase 07 commits to backward compatibility for existing configs.
- `Deferred:` per-show override objects, config-inspection commands, env-backed secrets, and broader config-shape generalization remain later tickets in this phase.
