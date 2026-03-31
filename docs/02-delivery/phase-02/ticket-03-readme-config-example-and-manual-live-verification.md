# P2.03 README And Real-World Config Example

Size: 2 points

## Outcome

- document the Phase 02 real-world target feeds and expected behavior
- provide a concrete local config example for manual testing before the branding rename lands

## Red

- identify missing or misleading docs around queueable URLs and movie codec handling
- identify any gaps that prevent a local operator from preparing a valid real-world config

## Green

- update `README.md` with the Phase 02 real-world compatibility notes
- add a concrete config example using:
  - `https://myrss.org/eztv`
  - `https://atlas.rssly.org/feed`
- capture the planned manual verification prerequisites while deferring the final branded command to the rename ticket

## Refactor

- keep the README focused on current behavior rather than future polling or ingestion plans
- avoid documenting a temporary operator surface as the final branded workflow

## Review Focus

- operator can configure and exercise the app without consulting chat history
- docs clearly separate the working Phase 02 path from deferred Phase 03 ingestion work
