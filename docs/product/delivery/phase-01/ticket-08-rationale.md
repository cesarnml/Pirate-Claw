# P1.08 Rationale

- `Red first:` an end-to-end CLI test proving one run can queue the best candidate, persist `failed`, `skipped_duplicate`, and `skipped_no_match` outcomes, and keep queued identities deduped on a later run.
- `Why this path:` a small pipeline entrypoint plus a minimal `feed_item_outcomes` table was the smallest acceptable slice that made `media-sync run` real without pulling status rendering or retry orchestration forward.
- `Alternative considered:` storing `skipped_no_match` indirectly in `candidate_state` or jumping straight to a full submission-attempt history model was rejected because unmatched feed items do not have stable candidate identities and ticket 08 only needs one per-item outcome record.
- `Deferred:` dedicated status command output, retry-failed orchestration, richer submission-attempt history, and any verbose operator UI remain in tickets 09-10.
