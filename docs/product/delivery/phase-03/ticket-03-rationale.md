# `P3.03` Rationale

- red first: after `P3.02`, reconciliation data existed only in SQLite, so an operator still had to inspect the database directly to see post-queue lifecycle
- chosen path: keep `status` read-only, surface `lifecycle_status` when present, and sort candidates by the latest known lifecycle timestamp with only cheap extra downloader detail
- alternative rejected: making `status` perform live reconciliation would blur the read/write boundary and bypass the dedicated reconciliation command added in `P3.02`
- deferred: completion and missing-from-Transmission semantics remain in `P3.04`
