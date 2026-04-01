# `P3.01` Rationale

- red first: queued candidates had no durable Transmission pointer, so later lifecycle reconciliation had no reliable torrent identity to look up
- chosen path: extend `candidate_state` with sticky Transmission torrent id/name/hash fields and thread them through the existing queue-success persistence path
- alternative rejected: storing a separate submission-history table now would widen the ticket into lifecycle history design before Phase 03 proves the narrower reconciliation slice
- deferred: richer downloader-state persistence, repeated reconciliation history, and any status-surface changes beyond what tests need
