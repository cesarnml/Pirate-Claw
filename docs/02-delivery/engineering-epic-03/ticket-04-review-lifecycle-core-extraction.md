# E3.04 Review Lifecycle Core Extraction

Extract one shared review core without reopening the Epic 02 boundary.

## Deliverable

- move fetcher and triager parsers into `review/`
- move polling cadence, timeout handling, artifact writing, and thread-resolution persistence into `review/`
- move cumulative outcome and note accumulation into `review/`
- rewire `poll-review`, `record-review`, and standalone `ai-review` to use the shared review core

## Acceptance

- ticketed and standalone flows become thin adapters over the same review lifecycle core
- current storage roots and body-ownership rules remain unchanged
- Epic 02 convergence semantics are preserved

## Explicit Deferrals

- no PR-creation redesign
- no storage-layout unification
- no vendor-contract redesign
