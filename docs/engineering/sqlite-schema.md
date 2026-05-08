# Current SQLite Schema

This note documents the current local SQLite model used by Pirate Claw. It is behavior-oriented: the goal is to explain what is persisted, how the tables relate, and which invariants matter for review and future tickets.

For the exact DDL and migration guards, see [`src/repository.ts`](../../src/repository.ts), [`src/tmdb/schema.ts`](../../src/tmdb/schema.ts), and [`src/plex/schema.ts`](../../src/plex/schema.ts).

For a visual relationship view, see [`sqlite-schema.mmd`](./sqlite-schema.mmd).

## Scope

The current schema supports these behaviors:

- record each run and its outcome
- record raw feed items seen during a run
- preserve the latest known state for each matched media identity
- record per-item outcomes for status reporting and debugging
- cache TMDB movie, TV, and TV-season metadata
- cache Plex movie and TV library presence
- persist Plex browser-auth device identity and in-flight auth sessions

This schema is local-only. It does not attempt to capture cross-machine state, durable audit logs for every reconciliation snapshot, or long-lived submission history beyond the latest durable candidate row plus append-only per-item outcomes.

## Tables

## `runs`

One row per `pirate-claw run` or other persisted cycle that records run status.

Important fields:

- `id`: surrogate primary key
- `started_at`
- `status`: `running`, `completed`, or `failed`
- `completed_at`

Behavioral role:

- provides the top-level audit trail for an invocation
- anchors `feed_items`, `candidate_state.first_seen_run_id`, `candidate_state.last_seen_run_id`, and `feed_item_outcomes.run_id`

## `feed_items`

One row per raw RSS item observed during a specific run.

Important fields:

- `id`: surrogate primary key
- `run_id`: references `runs(id)`
- `feed_name`
- `guid_or_link`
- `raw_title`
- `published_at`
- `download_url`

Behavioral role:

- preserves the source payload used for matching and queueing during that run
- gives `feed_item_outcomes` and `candidate_state.last_feed_item_id` a stable pointer to the observed item

## `candidate_state`

One row per matched media identity. This is the durable dedupe, queue-state, retry, and reconciliation table.

Primary key:

- `identity_key`

Important fields:

- `media_type`
- `status`: queue-submission state such as `queued`, `failed`, or `skipped_duplicate`
- `queued_at`
- `pirate_claw_disposition`: terminal Pirate Claw action marker such as `removed` or `deleted`
- `reconciled_at`
- `transmission_torrent_id`, `transmission_torrent_name`, `transmission_torrent_hash`
- `transmission_status_code`, `transmission_percent_done`, `transmission_done_date`, `transmission_download_dir`
- `rule_name`
- `score`
- `reasons_json`
- normalized media fields such as `normalized_title`, `season`, `episode`, `year`, `resolution`, and `codec`
- last-seen source fields such as `feed_name`, `guid_or_link`, `published_at`, and `download_url`
- provenance fields: `first_seen_run_id`, `last_seen_run_id`, `last_feed_item_id`
- `updated_at`

Behavioral role:

- collapses competing releases onto one durable identity
- records the latest best-known queueing and Transmission snapshot for that identity
- blocks requeueing when a prior candidate was already effectively handled
- powers retry flows by storing the last retryable failed candidate with its `download_url`
- retains the downloader identity needed for later lifecycle reconciliation after queueing
- stores Pirate Claw terminal actions separately from live Transmission-derived state

Current state model notes:

- `candidate_state.status` is the queue-submission result, not the derived torrent row state shown in the API/UI
- the old `lifecycle_status` column is no longer part of the schema
- Transmission lifecycle is derived from `transmission_status_code`, `transmission_percent_done`, `transmission_done_date`, and `pirate_claw_disposition`
- reconciliation only targets rows where `pirate_claw_disposition IS NULL`

## `feed_item_outcomes`

One row per disposition decision made during a run.

Important fields:

- `id`: surrogate primary key
- `run_id`: references `runs(id)`
- `feed_item_id`: optional reference to `feed_items(id)`
- `status`: `queued`, `failed`, `skipped_duplicate`, or `skipped_no_match`
- `identity_key`
- `rule_name`
- `message`
- `created_at`

Behavioral role:

- records what happened to each processed feed item during that run
- supports run summaries and operator debugging
- preserves decisions even when there is no durable `candidate_state` row, such as `skipped_no_match`

## `tmdb_movie_cache`

One row per TMDB movie lookup key.

Primary key:

- `match_key`

Important fields:

- `tmdb_id`
- `is_negative`: `1` when the cache records a miss or temporary negative result
- `expires_at`
- `title`, `overview`, `poster_path`, `backdrop_path`
- `vote_average`, `vote_count`
- `genre_ids_json`
- `release_date`

Behavioral role:

- avoids repeated TMDB movie lookups for the same normalized match key
- supports negative caching with a bounded TTL

## `tmdb_tv_cache`

One row per TMDB TV lookup key.

Primary key:

- `match_key`

Important fields:

- `tmdb_id`
- `is_negative`
- `expires_at`
- `name`, `overview`, `poster_path`, `backdrop_path`
- `network_name`
- `vote_average`, `vote_count`
- `genre_ids_json`
- `first_air_date`
- `number_of_seasons`
- `seasons_json`

Behavioral role:

- avoids repeated TMDB TV show lookups for the same normalized match key
- stores enough show-level metadata to render enriched TV views without refetching

## `tmdb_tv_season_cache`

One row per TMDB TV season lookup.

Primary key:

- composite key: `show_match_key`, `season_number`

Important fields:

- `expires_at`
- `episodes_json`

Behavioral role:

- stores season-level episode payloads separately from the show row
- allows partial refresh at the season granularity

## `plex_movie_cache`

One row per movie identity checked against Plex.

Primary key:

- composite key: `title`, `year`

Important fields:

- `plex_rating_key`
- `in_library`
- `watch_count`
- `last_watched_at`
- `cached_at`

Behavioral role:

- caches movie library presence and lightweight watch-state metadata from Plex

## `plex_tv_cache`

One row per normalized TV title checked against Plex.

Primary key:

- `normalized_title`

Important fields:

- `plex_rating_key`
- `in_library`
- `watch_count`
- `last_watched_at`
- `cached_at`

Behavioral role:

- caches TV library presence and lightweight watch-state metadata from Plex

## `plex_auth_identity`

Singleton row holding the browser-auth device identity and current credential material for Plex.

Primary key:

- `singleton` with `CHECK (singleton = 1)`

Important fields:

- `client_identifier`, `client_name`, `platform_name`
- `key_id`, `key_algorithm`, `public_jwk_json`, `private_key_pem`
- `refresh_token`, `token_expires_at`
- `last_authenticated_at`
- `last_error`
- `reconnect_required_at`, `reconnect_required_reason`
- `renewal_started_at`
- `created_at`, `updated_at`

Behavioral role:

- preserves the durable local Plex device identity across restarts
- stores the current renewable auth material and reconnect state

## `plex_auth_sessions`

One row per browser auth handshake started from the local app.

Primary key:

- `id`

Important fields:

- `oauth_state`: unique browser flow state
- `code_verifier`
- `pin_id`, `pin_code`
- `redirect_uri`
- `return_to`
- `opened_at`, `expires_at`
- `status`
- `completed_at`, `cancelled_at`

Behavioral role:

- tracks in-flight and recently completed Plex auth sessions
- ties callback validation to the generated PKCE/browser session state

## Identity And Relationships

The schema intentionally separates several identity layers:

- run identity: `runs.id`
- observed feed item identity: `feed_items.id`
- media candidate identity: `candidate_state.identity_key`
- cache lookup identities: TMDB `match_key` and Plex cache primary keys
- auth identities: Plex singleton identity row and per-session `plex_auth_sessions.id`

Key relationships:

- one `run` has many `feed_items`
- one `run` has many `feed_item_outcomes`
- many observed `feed_items` across multiple runs can collapse onto one `candidate_state.identity_key`
- one `feed_item` may be the `candidate_state.last_feed_item_id`
- one TMDB TV show row can have many season rows through `tmdb_tv_season_cache.show_match_key`

The TMDB, Plex cache, and Plex auth tables are intentionally independent of run history. They are caches and credentials, not per-run audit records.

## Current Invariants

- `candidate_state.identity_key` is the dedupe boundary for queueing behavior.
- `candidate_state.first_seen_run_id` never changes after the first insert.
- `candidate_state.last_seen_run_id` moves forward as later runs encounter the same identity.
- `candidate_state.queued_at` is sticky once a candidate has been queued.
- queued Transmission identity fields are preserved once present so later updates do not lose the downloader pointer.
- `candidate_state.pirate_claw_disposition` is only set for Pirate Claw terminal actions and suppresses further reconciliation polling.
- `feed_item_outcomes` is append-only from the application point of view.
- `listRetryableCandidates` only returns `candidate_state` rows with `status = 'failed'` and a non-empty `download_url`.
- TMDB and Plex cache rows are keyed by normalized lookup identities and refreshed by TTL rather than by run id.
- `plex_auth_identity` is a singleton row, not a history table.

## What This Doc Intentionally Does Not Freeze

This note describes the current persisted local model; it does not promise the schema is final.

Likely future pressure points:

- richer durable reconciliation history instead of only the latest candidate snapshot
- stronger migration/versioning rules beyond the current additive column guards
- deeper Plex or TMDB metadata expansion
- any future remote-sync or multi-machine state

If later phases change the persistence boundary materially, update this doc alongside the schema changes instead of relying on chat history.
