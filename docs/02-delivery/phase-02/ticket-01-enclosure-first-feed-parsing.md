# P2.01 Enclosure-First Feed Parsing

Size: 2 points

## Outcome

- parse RSS items so `downloadUrl` prefers `enclosure.url`
- keep `<link>` as the fallback when no enclosure URL exists
- preserve current `guidOrLink`, `rawTitle`, and `publishedAt` behavior

## Red

- add parser tests for RSS items that include both `<link>` and `<enclosure url="...">`
- prove the queueable download URL comes from `enclosure.url` for EZTV-style and YTS-style items
- prove feeds without enclosure still fall back to `<link>`

## Green

- update feed parsing to read enclosure attributes without introducing feed-specific config

## Refactor

- keep XML extraction helpers small and source-agnostic
- avoid widening the feed config surface for a generic RSS behavior

## Review Focus

- correct fallback order between `enclosure.url` and `<link>`
- confidence that Transmission will receive queueable torrent URLs instead of details-page links
