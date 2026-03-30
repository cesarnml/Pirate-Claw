# P1.06 Rationale

- `Red first:` repository tests proving a queued candidate blocks later duplicates while a failed candidate remains retryable.
- `Why this path:` a single `candidate_state` row per identity with persistent `queued_at` gives later tickets one small place to check dedupe state without losing the latest outcome.
- `Alternative considered:` a latest-status-only row was rejected because writing `skipped_duplicate` after a prior `queued` outcome would erase the fact that the candidate had already been queued successfully.
- `Deferred:` `skipped_no_match` persistence is intentionally not modeled in ticket 06 because unmatched feed items do not have a stable candidate identity. That outcome should land with the ticket 08 pipeline shape, likely as per-feed-item outcome history rather than `candidate_state`. Submission-attempt history, CLI wiring, status rendering, and retry command orchestration remain in tickets 08-10.
