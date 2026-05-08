# `P5.01 Add Movie Codec Policy Mode`

## Goal

Add `movies.codecPolicy` config to control whether codec matching is a preference or a hard requirement, and enforce skip behavior when `require` is set.

## Why This Ticket Exists

The current movie-match logic treats codec as a preference: a candidate without a matching codec still passes if other criteria match. Phase 05 lets an operator make codec matching strict so non-matching candidates are never queued.

## Scope

- add `movies.codecPolicy` config field: `"prefer" | "require"` (default `"prefer"`)
- validate the field in config loading; reject unknown values
- when policy is `"prefer"`, behavior is unchanged from Phase 04
- when policy is `"require"`, skip movie candidates where codec is absent or does not appear in `movies.codecs`
- record the skip reason in the pipeline result for skipped-by-policy candidates
- add tests covering both policy modes and the default passthrough

## Out Of Scope

- per-feed codec policy overrides
- TV codec policy
- Transmission label routing (P5.02)

## Rationale

The change is a bounded predicate in movie matching. `"prefer"` is the default so existing configs work unchanged. The skip reason for policy-rejected candidates follows the same pattern as existing dedupe/rule skip reasons to keep pipeline result semantics consistent.

## Red First Prompt

What user-visible behavior fails first when `movies.codecPolicy: "require"` is set but the movie-match logic still passes codec-absent candidates?
