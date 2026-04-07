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

## Rationale

- Added `tools/delivery/review.ts` as the shared review lifecycle core for fetcher parsing, triager parsing, polling cadence, timeout handling, artifact persistence, thread-resolution persistence, and cumulative review outcome accumulation.
- Rewired ticketed `poll-review`, ticketed `record-review`, and standalone `ai-review` to call that shared core through thin orchestrator adapters so the review lifecycle logic now lives in one place.
- Kept PR-body refresh/rendering ownership in `tools/delivery/orchestrator.ts` so this ticket does not reopen the reviewer-facing metadata/rendering scope deferred to `E3.05`.
- Preserved the existing artifact roots, timeout semantics, cumulative `patched` behavior, and standalone `needs_patch` to `operator_input_needed` mapping so Epic 02 review convergence behavior remains unchanged while the module boundary tightens.
- Follow-up AI review findings tightened the standalone path to use the injected `now` clock consistently when opening the poll window and replaced the standalone poll cadence literals with named module constants so the extracted review core cannot silently drift from its own timeout semantics.
