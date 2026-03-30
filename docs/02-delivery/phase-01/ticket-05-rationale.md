# Ticket 05 Rationale

- Red first: matching representative normalized movie releases should accept allowed year-and-quality combinations and reject releases that fail year, resolution, or codec policy without relying on title intent.
- Why this path: one policy matcher that reuses the existing quality-preference semantics was the smallest acceptable slice that proves movie intake behavior is global-policy filtering rather than per-title rule matching.
- Alternative considered: adding movie title rules alongside TV rules was rejected because Phase 01 defines movies as one global intake policy and does not track specific movie names.
- Deferred: feed `guidOrLink` identity, torrent-level identity, and any pipeline or dedupe integration beyond this standalone matcher boundary.
