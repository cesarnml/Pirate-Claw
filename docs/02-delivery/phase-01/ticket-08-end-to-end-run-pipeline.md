# P1.08 End-To-End Run Pipeline

Size: 3 points

## Outcome

- wire config, feed fetch, normalization, matching, dedupe, and Transmission together
- choose one best candidate per identity and submit it

## Red

- write an end-to-end test using local feed fixtures and a fake Transmission server
- prove `queued`, `skipped_duplicate`, `skipped_no_match`, and `failed` outcomes

## Green

- implement the orchestration code

## Refactor

- remove duplicated decision logic and improve run summaries

## Review Focus

- pipeline readability
- one-behavior-per-stage structure
