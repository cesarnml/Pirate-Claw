# P2.01 Rationale

- `Red first:` parser tests proving RSS items with both `<link>` and `<enclosure url="...">` use the enclosure as the queueable `downloadUrl`, plus a fallback test proving feeds without enclosures still use `<link>`.
- `Why this path:` adding one small enclosure extractor inside the existing feed parser was the smallest acceptable way to make Transmission receive torrent payload URLs without widening config or introducing feed-specific parsing rules.
- `Alternative considered:` adding per-feed parser hints or source-specific URL selection was rejected because the ticket targets a generic RSS behavior that should remain source-agnostic.
- `Deferred:` any feed-specific normalization beyond enclosure-vs-link fallback, plus polling or capture automation, remain later-phase work.
