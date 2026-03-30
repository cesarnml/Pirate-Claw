# Roadmap

This roadmap is intentionally lightweight. It gives future phases a place to land without mixing roadmap planning into ticket specs.

## Phase 01 MVP

Goal:

- read feeds
- normalize titles
- match against config rules
- deduplicate with SQLite
- queue approved items in Transmission
- record outcomes for status and retry

Exit condition:

- `media-sync run` can successfully queue a matched item in Transmission

## Phase 02: Automation And Operator Ergonomics

Likely scope:

- scheduling
- safer dry-run and preview modes
- richer run summaries
- config ergonomics
- operational logging improvements
- durable ticket tracking with issue workflow states and deferred-work capture
- issue-tracker integration such as Linear when it improves delivery signal
- AI-readable project management context through MCP-backed tooling

Not committed yet:

- exact scheduler mechanism
- notification model
- config editing workflow
- exact issue tracker choice and workflow depth

## Phase 03: Post-Queue Lifecycle

Likely scope:

- download completion tracking
- renaming or organization rules
- library/archive integrations
- Synology-oriented flows if still desired

Not committed yet:

- storage layout
- archive strategy
- media-server integrations

## Planning Rules

- keep phase docs outcome-focused
- keep tickets implementation-focused
- promote durable technical choices into ADRs
