# P2.02 Rationale

- `Red first:` movie matcher tests proving year-and-resolution matches survive when codec is absent, plus a ranking test proving explicit allowed codec hits beat otherwise equivalent unknown-codec releases.
- `Why this path:` keeping the config schema unchanged and treating missing codec as a movie-only scoring case was the smallest acceptable way to support YTS-style titles without loosening TV matching semantics.
- `Alternative considered:` adding a new config flag for unknown-codec movies was rejected because the live-feed behavior is consistent enough for a local policy adjustment in this ticket.
- `Deferred:` any broader quality-policy redesign, source-specific matching overrides, or scheduling/capture automation remains later-phase work.
