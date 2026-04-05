# Ticket 01 Rationale

- Red first: `movies.codecPolicy: "require"` should stop codec-unknown movie releases from matching, and the resulting `skipped_no_match` outcome should say why.
- Why this path: extending `MoviePolicy` with a defaulted enum and threading a single movie-specific no-match message through the pipeline is the smallest acceptable slice that changes operator behavior without redesigning matcher or repository status types.
- Alternative considered: returning a broader discriminated decision object from every matcher was rejected because only the movie strict-policy path needs a new no-match explanation in this ticket.
- Deferred: TV codec policy, per-feed policy overrides, Transmission label routing, and any richer no-match taxonomy beyond the strict movie codec messages.
- Verification: `bun test test/config.test.ts test/movie-match.test.ts test/pipeline.test.ts` and `bun run ci`.
