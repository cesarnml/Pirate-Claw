# Phase 01 Polish And Hardening Rationale

- `Red first:` pipeline behavior coverage now includes duplicate winner selection within one identity and retry-run failure handling when submission throws.
- `Why this path:` extracting a dedicated pipeline coordinator was the smallest acceptable refactor that reduced orchestration complexity in the run path without changing the CLI surface, config shape, repository schema, or downloader contract.
- `Alternative considered:` broader cleanup across the CLI and repository layers was rejected because the highest-friction seam was already concentrated in pipeline orchestration, and widening the scope would blur phase-01 hardening with phase-02 design work.
- `Deferred:` PR creation and the closing `qodo-code-review` pass remain separate follow-up steps once this branch is pushed and opened for review.
