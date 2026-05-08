# P8.02 Queue-Time Download Directory Resolution

## Goal

Resolve the effective `downloadDir` per submission based on media type and pass it in the Transmission RPC `torrent-add` call.

## Scope

- Add `downloadDir?: string` to `SubmitDownloadInput`
- Update `buildSubmitRequestBody` to prefer `input.downloadDir` over `config.downloadDir`
- Resolve effective `downloadDir` in the pipeline runner: per-type dir wins over global dir, which wins over omission (Transmission default)
- Add transmission adapter tests for per-submission `downloadDir`
- Add pipeline test covering per-media-type directory resolution

## Precedence

1. `transmission.downloadDirs.movie` or `transmission.downloadDirs.tv` (per media type)
2. `transmission.downloadDir` (global fallback)
3. omitted (Transmission built-in default)

## Out Of Scope

- Config type or validation changes (P8.01)
- Docs update (P8.03)

## Exit Condition

A torrent submission for a movie feed includes the movie-specific `downloadDir` in the RPC call. A TV feed submission includes the TV-specific directory. When neither is configured, existing behavior is preserved.

## Rationale

Per-submission `downloadDir` was added to `SubmitDownloadInput` and the `buildSubmitRequestBody` function now prefers it over `config.downloadDir`. The precedence chain (per-type → global → omitted) is resolved through a `createDownloadDirResolver` function in pipeline.ts that reads `TransmissionConfig`. The resolver is injected into the pipeline coordinator as a function, avoiding a direct coupling between the pipeline-runner module and config types. The `retryFailedCandidates` path also receives the resolver so that retries honor per-media-type directories.
