# P8.01 Per-Media-Type Download Directory Config

## Goal

Add `transmission.downloadDirs` to the config type and validation so operators can specify per-media-type download directories.

## Scope

- Add `downloadDirs?: { movie?: string; tv?: string }` to `TransmissionConfig`
- Validate `transmission.downloadDirs` in the config loader with path-aware error messages
- Both fields are optional; when omitted, existing behavior is unchanged
- Add config validation tests for the new fields

## Out Of Scope

- Passing the resolved directory at queue time (P8.02)
- Docs/example config update (P8.03)

## Exit Condition

`validateConfig` accepts `transmission.downloadDirs` with movie and/or tv fields, rejects invalid shapes, and the parsed `TransmissionConfig` carries the new fields through to consumers.

## Rationale

`downloadDirs` is validated as a separate optional object on `TransmissionConfig` rather than replacing the existing `downloadDir` field. This preserves backward compatibility — operators with a single global `downloadDir` continue to work unchanged. The per-type fields use the same `movie` / `tv` media-type vocabulary already established by `FeedConfig.mediaType`. Unknown keys inside `downloadDirs` are rejected at config load time to catch typos early.
