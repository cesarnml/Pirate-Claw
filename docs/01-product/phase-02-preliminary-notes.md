# Phase 02 Preliminary Notes

These notes started as a holding area for real-world feed findings before Phase 02 scope was clear. Phase 02 is now narrowed to a smaller compatibility goal; the older polling and remote-capture ideas remain useful background, but they are not the implementation target for this phase.

## Current Phase 02 Scope

Phase 02 should deliver a minimal real-world working app for local manual invocation of the branded CLI against:

- `https://myrss.org/eztv`
- `https://atlas.rssly.org/feed`

The current Phase 02 implementation target is:

- prefer RSS `enclosure.url` over `<link>` for queueable download URLs
- keep `<link>` as fallback when no enclosure URL exists
- allow movie items to match when year and resolution are valid even if codec is absent
- rename the operator surface to `pirate-claw` and `pirate-claw.config.json` as the final Phase 02 ticket
- keep the app manually invoked and locally persisted using the existing SQLite model

## Explicit Phase 03 Deferrals

The following ideas are deferred out of Phase 02:

- polling or scheduling to avoid short feed-retention windows
- remote feed capture
- Turso or any other hosted persistence layer
- importing buffered feed items into local SQLite
- persistence redesign beyond the current local SQLite behavior

## Why This Note Exists

Phase 01 is complete, and a few important findings came out of manual review of live RSS feeds. Those findings still matter because they explain why Phase 02 needs compatibility work before it needs automation.

Reference feed discussed:

- `https://atlas.rssly.org/feed`

## Confirmed Feed Findings

- The feed is valid RSS and exposes movie items with standard RSS fields including `title`, `link`, `guid`, `pubDate`, and `enclosure`.
- For this feed, `<link>` points to a movie details page, not the torrent payload that should be submitted to Transmission.
- The real torrent URL is exposed in `<enclosure url="...">`.
- Movie titles on this feed often include year and resolution.
- Some items include an explicit codec marker such as `[x265]`.
- Many items omit codec entirely.
- In sampled feed content, explicit `x264` markers were not observed.
- Both target feeds appear to have short practical retention windows for newly published items, often only a few hours of reliably visible "latest" entries.

Additional feed discussed:

- `https://myrss.org/eztv`

Observed on sampled live feed content:

- EZTV-style TV entries also expose the queueable torrent URL in `<enclosure url="...">`.
- EZTV feed churn is high enough that once-daily polling is likely to miss releases.

## Design Implications

- Feed parsing should prefer `enclosure.url` as the queueable torrent URL when present, with `<link>` only as a fallback.
- The current Phase 01 movie matcher is too strict for feeds that omit codec metadata on otherwise valid items.
- For movie feeds like this one, codec omission appears to mean "not explicitly x265" rather than "metadata unavailable at random."
- A hard codec filter causes Pirate Claw to reject releases that are likely acceptable candidates once year and resolution match.
- Once-daily direct polling against live feeds is not reliable enough for the target sources.
- For Phase 02, this remains a known limitation rather than an implementation target.
- Any future feed-capture layer should be treated as a later ingestion solution, not bundled into the compatibility slice.

## Earlier Ideas Now Deferred

- Keep movie `years` as a hard filter.
- Keep movie `resolutions` as a hard filter.
- Move movie codec handling from a hard rejection rule to a scoring preference when codec is absent.
- Prefer explicit preferred-codec hits over unknown codec.
- Continue to rank among duplicate movie candidates using the scoring rubric so explicit codec beats unknown codec when both candidates are otherwise acceptable.
- Defer any capture path, remote poller, or hosted persistence design to Phase 03.

## Open Questions

- Should unknown codec always remain eligible for movies, or should this be configurable per feed or per movie policy?
- Should explicit non-preferred codec be allowed with a score penalty, or rejected outright?
- Should movie policy distinguish between "required" and "preferred" quality dimensions explicitly in config, or should this remain implicit in matching logic?
- Should feed-specific parsing rules become a first-class boundary in config, or should Phase 02 keep parser behavior source-agnostic where possible?
- What stored capture format best fits the app boundary: raw RSS snapshots, normalized feed items, or append-only item records keyed by source and guid?
- Should remote capture write directly into a reusable data repo, or should Pirate Claw later support importing from that repo into local SQLite before `run`?

## Remote Capture Storage Notes

- A small durable remote store is a better long-term fit than appending operational snapshots into the application repo.
- A separate data repo remains the cheapest Git-native fallback, but it should be treated as a simple persistence hack rather than the preferred architecture.
- The more natural target boundary is a tiny hosted store that captures raw feed items or snapshots independently of the code repo.

Examples worth considering:

- Turso: likely the best fit if Phase 02 wants to stay close to the current SQLite model while supporting lightweight hosted capture.
- Cloudflare D1: a viable low-cost option if feed polling later moves into a Worker-style runtime.
- Neon via Vercel Marketplace: technically viable, but more database surface area than Phase 02 appears to need right now.
- Blob/object storage: viable only if the app stores raw RSS snapshots and imports them later rather than querying item-level state remotely.

Cost posture for the current expected workload:

- Two feeds polled roughly every 45 minutes should remain very small in both storage and query volume.
- Raw snapshot storage for a month of captures should likely stay well under a few hundred megabytes.
- This should fit inside free tiers or low single-digit monthly spend for most lightweight hosted options.
- If a paid option is needed for predictability, a small SQLite-compatible hosted store is likely to be the cleanest low-cost path.

## Turso Capture Shape

If Turso is used as the remote capture store, the likely Phase 02 flow is:

- A remote poller fetches the target feeds every 30-45 minutes.
- Each poll records a lightweight capture-run row for observability.
- Parsed RSS items are upserted into an item-level table keyed by stable source identity such as `(feed_name, guid_or_link)`.
- The remote store acts as a buffer so local `run` does not depend on the live RSS window still containing the item.
- Local Pirate Claw later imports unprocessed rows into local SQLite, runs matching and queueing, then marks them imported or processed remotely.

Likely stored fields:

- feed name
- source item key such as guid or fallback link
- raw title
- published timestamp
- page URL
- queueable download URL
- first seen timestamp
- last seen timestamp
- optional raw payload JSON or source fragment for debugging
- optional imported/processed timestamp

Why this is attractive:

- The polling workload is very small relative to a hosted SQLite-compatible database.
- Repeated polling mostly becomes idempotent upserts rather than unbounded duplicate writes.
- The local machine can stay offline for long periods without losing items from short-lived RSS windows.
- The design keeps RSS capture separate from local match-and-queue behavior instead of forcing a larger application rewrite.

## Current Stance

- Prefer enclosure-based download URLs over link-based submission URLs.
- Treat explicit codec hits as a ranking advantage, not necessarily a mandatory filter, for movie feeds with incomplete codec labeling.
- Treat short-lived RSS windows as an ingestion problem, not a reason to abandon RSS for source-specific APIs yet.
- Defer polling, remote capture, Turso, and any ingestion redesign to Phase 03.
- Treat Phase 02 as a compatibility slice, not an automation phase.
