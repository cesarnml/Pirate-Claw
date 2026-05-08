# Phase 08 Media Placement

Phase 08 routes completed downloads into media-type-specific directories by passing per-media-type `downloadDir` values to Transmission at queue time, without adding post-completion file-move logic to Pirate Claw.

## Phase Goal

Phase 08 should leave Pirate Claw in a state where a local operator can:

- configure separate Transmission download directories for movies and TV
- have queued torrents land in the correct directory based on their feed's media type
- fall back to the existing global `transmission.downloadDir` (or Transmission's own default) when no per-type directory is configured

## Committed Scope

- add per-media-type download directory configuration to the Transmission config block:
  - `transmission.downloadDirs.movie` (optional)
  - `transmission.downloadDirs.tv` (optional)
- resolve the effective `downloadDir` at queue time based on the candidate's media type
- precedence: per-type directory wins over global `transmission.downloadDir`, which wins over Transmission's built-in default
- pass the resolved `downloadDir` in the Transmission RPC `torrent-add` call
- update `status` output to reflect the actual `downloadDir` recorded by Transmission after reconciliation
- preserve existing label-routing and fallback behavior from Phase 05

## Configuration Surface Added In This Phase

```json
{
  "transmission": {
    "url": "http://localhost:9091/transmission/rpc",
    "downloadDirs": {
      "movie": "/volume1/media/completed/movies",
      "tv": "/volume1/media/completed/tv"
    }
  }
}
```

Both fields are optional. When omitted, existing behavior is unchanged.

## Exit Condition

A torrent queued from a movie feed lands in the configured movie directory. A torrent queued from a TV feed lands in the configured TV directory. When no per-type directory is configured, behavior is identical to the pre-Phase-08 baseline. Reconciled `status` output shows the actual download directory for each candidate.

## Explicit Deferrals

These are intentionally outside Phase 08:

- Pirate-Claw-side post-completion file moves or renaming
- per-feed custom download directories beyond the two media types
- directory validation or creation via Transmission RPC
- web UI or dashboard
- media metadata enrichment

## Why The Scope Stays Narrow

The highest-value gap on the current NAS deployment is that all downloads land in one flat directory. Transmission already supports per-torrent `downloadDir` at add time, and Pirate Claw already knows the media type at queue time. This phase connects those two facts with minimal new code and zero new infrastructure.
