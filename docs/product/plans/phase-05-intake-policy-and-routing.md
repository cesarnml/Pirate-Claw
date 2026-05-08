# Phase 05 Intake Policy And Transmission Routing

Phase 05 adds policy control for movie codec handling and queue-time routing metadata for Transmission, without changing the Phase 04 runtime model.

## Phase Goal

Phase 05 should leave Pirate Claw in a state where a local operator can:

- choose whether movie codec is a preference or a hard requirement
- submit torrents with media-type routing labels for Transmission
- continue queueing safely when label support is unavailable

## Committed Scope

- add movie codec policy mode:
  - `movies.codecPolicy: "prefer" | "require"`
- keep existing `movies.codecs` list and apply it according to policy mode
- when policy is `require`, skip movie candidates with missing or non-matching codec
- add queue-time Transmission labels based on media type:
  - `movie` for movie feeds
  - `tv` for TV feeds
- if Transmission rejects label arguments, log a warning and retry submission without labels
- preserve existing queueing semantics when fallback path succeeds

## Exit Condition

With `movies.codecPolicy` set to `require`, movie candidates that do not explicitly match configured codecs are not queued.

Torrent submissions include media-type labels when supported by Transmission, and fallback-to-unlabeled submission keeps the pipeline functional when label support is unavailable.

## Explicit Deferrals

These are intentionally outside Phase 05:

- generalized per-feed custom label policy
- hard-fail mode when labels are unsupported
- media placement policy owned by Pirate Claw
- NAS packaging and deployment automation
- UI/dashboard implementation

## Why The Scope Stays Narrow

Phase 05 focuses on two bounded policy changes that directly affect operator outcomes while avoiding broader routing and deployment design expansion.
