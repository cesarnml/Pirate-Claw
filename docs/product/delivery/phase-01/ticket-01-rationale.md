# Ticket 01 Rationale

- Red first: `media-sync run --config ...` should load a valid JSON config and exit successfully, while missing or malformed config should fail with a readable message.
- Why this path: a single `run` command with one config module is the minimum public surface needed to prove the CLI can start, read config, and reject bad input.
- Alternative considered: adding a full command parser with placeholder `status` and `retry-failed` handlers was rejected because it adds CLI structure that Ticket 01 does not need yet.
- Deferred: default-command ergonomics beyond `run`, richer schema validation, environment-based config discovery, and all feed/database/downloader behavior.
