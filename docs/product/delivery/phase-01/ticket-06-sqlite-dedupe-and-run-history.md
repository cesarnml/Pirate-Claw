# P1.06 SQLite Dedupe And Run History

Size: 3 points

## Outcome

- create the schema for runs, feed items, and candidate state
- mark already-queued items as duplicates on later runs

## Red

- write tests that run the pipeline twice and prove the second run skips duplicates
- write a test that failed items remain retryable

## Green

- implement minimal SQLite persistence

## Refactor

- separate schema bootstrapping from repository operations

## Review Focus

- dedupe identity correctness
- safe retry behavior
