# Ticket 02 Rationale

- Red first: queueing should still succeed when Transmission rejects `labels`, with a warning explaining the unlabeled fallback.
- Why this path: adding optional label support at the downloader boundary and deriving fixed `movie` / `tv` labels from the matched media type is the smallest acceptable slice that delivers routing metadata without redesigning config or placement policy.
- Alternative considered: adding configurable per-feed label values in this ticket was rejected because it would widen scope beyond the fixed media-type labels committed for Phase 05.
- Deferred: per-feed custom labels, hard-fail behavior for unsupported labels, downloader-side placement ownership, and richer label policy beyond the fixed media-type mapping.
