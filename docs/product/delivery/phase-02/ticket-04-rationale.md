# P2.04 Rationale

- `Red first:` CLI and config-path tests proved the branded command and default config filename had to become the only supported interface, with stale `media-sync` defaults rejected.
- `Why this path:` renaming the executable wrapper, package bin entry, default config path, CLI-facing messages, and current-user docs together was the smallest acceptable way to make the branded surface consistent without carrying compatibility aliases.
- `Alternative considered:` keeping `media-sync` as a hidden alias was rejected because the ticket explicitly calls for a clean break rather than a dual-surface transition.
- `Deferred:` polling, remote capture, hosted persistence, and any ingestion redesign remain outside Phase 02 even after the branded rename.
