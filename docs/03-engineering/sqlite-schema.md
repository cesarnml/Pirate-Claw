# Current SQLite Schema

This note documents the current local SQLite model used by Pirate Claw. It is intentionally behavior-oriented: the goal is to explain what is persisted, how the tables relate, and which invariants matter for review and future tickets.

For the exact DDL and repository queries, see [`src/repository.ts`](../../src/repository.ts).

For a visual relationship view, see [`sqlite-schema.mmd`](./sqlite-schema.mmd).

## Scope

The current schema supports these behaviors:

- record each CLI run
- record raw feed items seen during a run
- preserve the latest known state for each matched media identity
- record per-item outcomes for status reporting and debugging
- support duplicate suppression and retry of failed submissions

This schema is local-only. It does not attempt to capture polling history, remote ingestion, or any cross-machine state.

## Tables

## `runs`

One row per `pirate-claw run` or `pirate-claw retry-failed` invocation.

Important fields:

- `id`: surrogate primary key
- `started_at`
- `status`: `running`, `completed`, or `failed`
- `completed_at`

Behavioral role:

- provides the top-level audit trail for each invocation
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
- captures the queueable URL passed downstream at the time the item was seen
- gives `feed_item_outcomes` and `candidate_state.last_feed_item_id` a stable pointer back to the specific observed item

## `candidate_state`

One row per matched media identity. This is the durable dedupe and retry table.

Primary key:

- `identity_key`

Important fields:

- `media_type`
- `status`: `queued`, `failed`, or `skipped_duplicate`
- `queued_at`
- `lifecycle_status`, `reconciled_at`
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
- records the current best-known state for that identity
- blocks requeueing when a prior candidate was already queued
- powers `retry-failed` by storing the last retryable failed candidate with its `download_url`
- retains the downloader identity needed for later lifecycle reconciliation after queueing
- acts as the local persistence boundary for the latest reconciled Transmission lifecycle snapshot

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

## Identity And Relationships

The schema intentionally separates three layers of identity:

- run identity: `runs.id`
- observed feed item identity: `feed_items.id`
- media candidate identity: `candidate_state.identity_key`

Key relationships:

- one `run` has many `feed_items`
- one `run` has many `feed_item_outcomes`
- one `feed_item` may produce zero or one durable `candidate_state` update
- many observed `feed_items` across multiple runs can collapse onto one `candidate_state.identity_key`

This separation matters because dedupe happens at the media identity level, not at the raw RSS item level.

## State Model

## Run states

`runs.status` transitions are:

- `running` when the invocation starts
- `completed` when orchestration finishes successfully
- `failed` when orchestration aborts due to an error

## Candidate states

`candidate_state.status` reflects the latest durable state for an identity:

- `queued`: the identity has been successfully sent to Transmission
- `failed`: the latest submission attempt failed and remains retryable
- `skipped_duplicate`: the identity lost to a higher-ranked candidate or was seen again after being effectively handled elsewhere

Important nuance:

- `skipped_no_match` is not a `candidate_state` value because unmatched feed items do not create a durable candidate identity
- `queued_at` is preserved once set, even if later upserts touch the same identity
- queued Transmission identity fields are sticky once present, so later duplicate or failure updates do not lose the original downloader pointer
- `lifecycle_status` and `reconciled_at` reflect the latest successful reconciliation snapshot, separate from the queue-submission `status`
- `completed` is sticky once observed from Transmission, while torrents that disappear before any completed observation become `missing_from_transmission`

## Current Invariants

- `candidate_state.identity_key` is the dedupe boundary for queueing behavior.
- `candidate_state.first_seen_run_id` never changes after the first insert.
- `candidate_state.last_seen_run_id` moves forward as later runs encounter the same identity.
- `candidate_state.queued_at` is sticky once a candidate has been queued.
- reconciliation only targets queued candidates that have at least one durable Transmission identifier.
- `feed_item_outcomes` is append-only from the application point of view; it records each run decision rather than overwriting history.
- `listRetryableCandidates` only returns `candidate_state` rows with `status = 'failed'` and a non-empty `download_url`.

## What This Doc Intentionally Does Not Freeze

This note describes the current Phase 01 and early Phase 02 local model. It does not promise that the schema is final for later ingestion work.

Likely future pressure points:

- remote feed capture
- import or buffering layers for short-lived feeds
- richer submission-attempt history
- migrations beyond the current lightweight `runs.status` compatibility check

If later phases change the persistence boundary materially, update this doc alongside the schema changes instead of relying on chat history.
