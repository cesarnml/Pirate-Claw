# Ticket 04 Rationale

- Red first: matching representative normalized TV releases should accept intended titles, reject near-miss names, and prove case-insensitive regex override behavior without overmatching.
- Why this path: deriving a safe default pattern from the canonical rule name, while allowing an optional regex override, was the smallest acceptable slice that kept the common case readable without blocking more specific show matching.
- Alternative considered: requiring regex-only rule definitions was rejected because it would make every tracked show pay the complexity cost of custom patterns and make routine config review harder.
- Deferred: broader fuzzy matching, explicit alias support, and any cross-rule conflict policy beyond returning deterministic per-rule match scores.
