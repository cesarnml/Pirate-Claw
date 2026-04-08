# Competitive Landscape

This is a lightweight working note, not a commitment document. It captures nearby open-source tools that overlap with Pirate Claw so future planning stays grounded in a concrete answer to "why not just use X?"

Update it when competitor context actually changes a product decision or phase boundary. Keep it short.

## Nearby Tools

## FlexGet

General-purpose automation engine for feeds and download workflows.

Closest overlap to Pirate Claw's local rule-engine shape. Stronger as a generic automation toolbox than as a tight product with a narrow operator workflow — the breadth that makes it powerful also makes it hard to get right for a specific use case without significant config investment.

## autobrr

Torrent and Usenet intake automation with direct client integration, including Transmission.

The more relevant comparison once Pirate Claw moves toward always-on polling. autobrr is meaningfully stronger at low-latency grabbing and web UI than Pirate Claw's current local-manual model. Worth understanding before expanding the feed polling or UI surface.

## Sonarr

TV-focused internet PVR and library manager.

Demonstrates the value of durable show tracking and quality profiles. Much broader product scope than Pirate Claw — it owns post-processing, calendar, renaming, and library management in addition to acquisition. The useful question isn't whether to clone Sonarr but where to stop short of it.

## Radarr

Movie-focused acquisition and organization manager — Sonarr's movie sibling.

A useful reference point for how far Pirate Claw should or should not move toward library management on the movie side.

## Medusa

TV automation in the same broad family as Sonarr. Reinforces the pattern that TV tools tend to sprawl once they own post-processing and library behavior — a useful reminder when deciding what Pirate Claw should defer.

## Where Pirate Claw Sits

Between generic automation and full library management:

- more product-shaped and identity-aware than a raw downloader automation script
- smaller and more hackable than Sonarr or Radarr
- local-first and operator-driven rather than UI-first
- intentionally bounded around matching, dedupe, queueing, and downloader lifecycle visibility

## Questions For Future Phases

- where should Pirate Claw stay intentionally narrower than Sonarr or Radarr?
- when is a feature genuine product value versus reimplementing existing media-manager behavior?
- should downloader-side capabilities like labels or placement rules be reused rather than rebuilt?
- when does always-on automation become worth the operational complexity?

## Maintenance Rule

Only update this note when competitor context materially changes a product decision, phase boundary, or differentiation argument.
