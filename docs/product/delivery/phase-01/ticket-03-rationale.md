# Ticket 03 Rationale

- Red first: normalizing representative TV and movie release titles should extract the matching metadata shape, while still returning a usable normalized title when some metadata is missing.
- Why this path: one normalization entrypoint with table-driven examples is the smallest acceptable slice that proves downstream matchers can depend on a stable media shape instead of reparsing raw titles.
- Alternative considered: building normalization directly into the future TV and movie matchers was rejected because it would duplicate parsing rules and make matcher tests carry unrelated title-cleanup behavior.
- Deferred: feed-specific parser hints, broader quality/source token cleanup, multi-episode parsing, and any scoring or rule-matching logic.
