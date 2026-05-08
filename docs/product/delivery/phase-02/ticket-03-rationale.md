# P2.03 Rationale

- `Red first:` identify the README gaps that still hid the live-feed workflow, especially the real feed URLs, queueable enclosure behavior, codec-optional movie matching, and the current pre-rename command surface.
- `Why this path:` a focused README section plus one concrete config example file was the smallest acceptable way to make local Phase 02 verification possible without inventing new tooling or pulling operators back into chat history.
- `Alternative considered:` documenting only prose steps without a concrete config artifact was rejected because the operator still needs one valid JSON shape to adapt locally against the real feeds.
- `Deferred:` polling, capture automation, hosted persistence, and the final `pirate-claw` rename remain later tickets rather than being implied by the new docs.
