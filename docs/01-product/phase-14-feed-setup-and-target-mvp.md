# Phase 14: Feed Setup & Target Management MVP

## Goal

Enable users to set up and manage RSS feeds and media targets via the web UI, with minimal validation and a focus on core intake configuration.

## Deliverables

- Add/remove RSS feeds (TV/movie) via web UI
- Add/remove TV show targets and movie years via web UI
- Set global codec/resolution for TV, and codec/resolution/year for movies
- Minimal validation (feed fetch, allowed codecs/resolutions)
- Manual .env write token required for config writes
- No advanced options, no per-target rules, no suggestions
- UI is read-only until write token is set

## Explicit Deferrals

- No advanced feed options or per-target rules
- No suggestions or sample data
- No multi-user support
- No plugin/extensibility
