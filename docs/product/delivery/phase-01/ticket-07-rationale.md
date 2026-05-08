# P1.07 Rationale

- `Red first:` adapter tests proving Transmission session negotiation succeeds on `409` plus `X-Transmission-Session-Id`, and that RPC, HTTP, malformed-response, and network failures are surfaced as structured results.
- `Why this path:` a narrow downloader boundary with one `submit` operation was the smallest acceptable slice that adds real Transmission integration without pulling pipeline orchestration or persistence concerns into the adapter.
- `Alternative considered:` exposing raw Transmission RPC request and response shapes to the rest of the app was rejected because later tickets only need queueing semantics, not protocol details.
- `Deferred:` run-pipeline wiring, persistence of submission outcomes, duplicate handling across prior candidate state, status rendering, and retry command orchestration remain in tickets 08-10.
