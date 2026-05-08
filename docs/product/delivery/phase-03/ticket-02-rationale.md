# `P3.02` Rationale

- red first: once a torrent was queued, Pirate Claw had no dedicated command or downloader boundary for refreshing live Transmission state back into SQLite
- chosen path: add a narrow `reconcile` CLI command, a `torrent-get` lookup boundary in the Transmission adapter, and local persistence for reconciled lifecycle plus a few raw downloader fields
- alternative rejected: folding reconciliation into `status` would hide write behavior behind a read command and would pull the later status-surface ticket forward
- deferred: operator-facing lifecycle display details, missing-from-Transmission semantics, and any background polling or scheduling
