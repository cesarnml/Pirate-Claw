# Ticket 02 Rationale

- Red first: fetching a feed through the public entrypoint should parse multiple RSS items into the raw feed-item shape, with `guid` preferred over `link` and ISO-normalized publish dates.
- Why this path: one feed module with a single fetch entrypoint and a pure XML parser is the smallest acceptable slice that proves the app can cross the HTTP boundary and produce downstream-ready feed items.
- Alternative considered: adding source-specific parsing for the known TV and movie feeds was rejected because it would hardcode current providers before the core RSS contract is proven.
- Deferred: Atom support, enclosure parsing, parser hints, CLI orchestration, empty-feed policy beyond a readable error, and any feed-specific normalization.
