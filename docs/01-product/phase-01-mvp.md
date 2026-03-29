# Phase 01 MVP

## Goal

Build a local CLI that:

- fetches configured RSS feeds
- normalizes feed items into a common media shape
- matches items against TV and movie rules from JSON config
- deduplicates items using SQLite
- submits the best match to Transmission
- records outcomes so later runs can skip duplicates and retry failures

Phase 01 ends when an item is successfully queued in Transmission.

## Non-Goals

- no web UI
- no automatic scheduling
- no download completion polling
- no file renaming or library management
- no Synology archiving
- no source-specific business logic baked into the app

## Runtime And Storage

- Runtime: Bun with TypeScript
- Database: SQLite via Bun's native SQLite support
- Trigger: manual CLI command
- Config: JSON file checked in locally or stored beside the app

Use Bun deliberately in phase 01. This repo prefers Bun's integrated runtime, test runner, and SQLite support over a more conservative Node setup.

## User-Facing Interface

The initial CLI surface should stay small:

- `media-sync run`
- `media-sync status`
- `media-sync retry-failed`

## Config Shape

The config should have four top-level sections:

## `feeds`

Defines the sources to read.

Each feed entry should contain:

- `name`
- `url`
- `mediaType`: `tv` or `movie`
- optional parser hints if a feed needs light normalization help

## `tv`

Defines tracked TV rules.

Each rule should contain:

- `name`
- `pattern`: case-insensitive regex string
- `resolutions`: allowed values such as `1080p`
- `codecs`: allowed values such as `x265`

## `movies`

Defines tracked movie rules.

Each rule should contain:

- `name`
- `year`
- optional `pattern`
- `resolutions`
- `codecs`

## `transmission`

Defines RPC connectivity:

- `url`
- `username`
- `password`
- optional `downloadDir`

## Internal Data Flow

Each run should follow the same pipeline:

1. Load and validate config.
2. Open SQLite and ensure schema exists.
3. Fetch each RSS feed.
4. Parse entries into a common raw feed-item shape.
5. Normalize titles into structured metadata.
6. Match each normalized item against TV or movie rules.
7. Group competing matches by media identity.
8. Select the best candidate using configured quality preferences.
9. Skip anything already queued successfully.
10. Submit the remaining candidate to Transmission.
11. Record `queued`, `failed`, `skipped_duplicate`, or `skipped_no_match`.

## Core Data Concepts

## Feed Item

Represents one source entry from RSS.

Suggested fields:

- `feedName`
- `guidOrLink`
- `rawTitle`
- `publishedAt`
- `downloadUrl`

## Normalized Item

Represents extracted metadata from the title.

Suggested fields:

- `mediaType`
- `normalizedTitle`
- `season`
- `episode`
- `year`
- `resolution`
- `codec`

## Candidate Identity

Represents duplicate prevention and winner selection.

TV identity:

- normalized title + season + episode

Movie identity:

- normalized title + year

## Match Result

Represents a rule hit plus ranking metadata.

Suggested fields:

- `ruleName`
- `identityKey`
- `score`
- `reasons`

## Persistence Model

The database should persist enough history to support review and retries:

- runs
- feed items seen
- candidate state
- submission attempts

The important behavior is:

- successful queueing blocks future duplicate submissions
- failed submissions remain retryable
- skipped items are visible for debugging

## Design Constraints

- source-agnostic core
- boundary-based design so external systems are easy to fake in tests
- behavior tested through public interfaces
- no internal-module mocking unless the dependency crosses a system boundary

## Review Standard For Phase 01

Every code review should be able to answer these questions:

- what new user-visible behavior was added
- which public interface was introduced or changed
- which test went red first
- what is still intentionally deferred
