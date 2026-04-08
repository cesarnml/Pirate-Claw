# Phase 14 Feeds and Rules Authoring in the UI (Placeholder)

**Delivery status:** Placeholder — **not scheduled**. No ticket decomposition and no `docs/02-delivery/phase-14/` implementation plan until Phase 13 is delivered and the narrower config-write path has been exercised in production-like settings.

## Phase Goal (Future)

Provide structured or semi-structured editing of **RSS feeds** and **matching rules** (and any remaining config surface not covered by Phase 13’s bounded Settings), reusing the same write API patterns: bearer-protected mutations, ETag concurrency, server-side SvelteKit proxying, and validation aligned with the CLI.

## Why This Doc Exists

Naming Phase 14 explicitly keeps **feeds/rules UI** from creeping into Phase 12 (design-only) or Phase 13 (runtime subset). It also ties **show/movie search-to-add** and similar discovery features to a future bucket once the config editor foundation exists.

## Exit Condition

Defined when Phase 14 is promoted from placeholder to an approved planning pass — not before Phase 13 closes.

## Rationale

Feeds and rules are the highest-risk part of the config to expose in a UI: validation surface, edge cases, and operator mistakes have pipeline consequences. Shipping Phase 13 on a smaller subset first proves the write pipeline, security model, and conflict semantics before expanding the editable surface.
