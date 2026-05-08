# P1.10 Retry-Failed Command Rationale

- `Red first:` CLI tests proved `media-sync retry-failed` must resubmit only failed candidate-state rows, leave queued rows untouched, and fail cleanly before the database exists.
- `Why this path:` reusing the existing submission persistence path kept `run` and `retry-failed` aligned on how queued and failed outcomes are recorded while adding only one repository read query for retryable candidates.
- `Alternative considered:` rebuilding retry work from historical `feed_items` and rematching was rejected because ticket 10 explicitly targets retrying stored candidates, not re-running feed ingestion logic.
- `Deferred:` richer submission-attempt history, retry limits or backoff, and operator filters for retry subsets remain outside phase 01.
