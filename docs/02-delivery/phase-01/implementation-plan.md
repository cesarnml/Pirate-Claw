# Phase 01 Implementation Plan

This breakdown is intentionally small. Each ticket should fit a 1-3 hour review and follow one red-green-refactor loop around a single behavior.

## Ticket Order

1. `P1.01 CLI Skeleton And Config Loading`
2. `P1.02 RSS Fetch And Parse`
3. `P1.03 Title Normalization`
4. `P1.04 TV Rule Matching`
5. `P1.05 Movie Rule Matching`
6. `P1.06 SQLite Dedupe And Run History`
7. `P1.07 Transmission Adapter`
8. `P1.08 End-To-End Run Pipeline`
9. `P1.09 Status Command`
10. `P1.10 Retry-Failed Command`

## Ticket Files

- `ticket-01-cli-skeleton-and-config-loading.md`
- `ticket-02-rss-fetch-and-parse.md`
- `ticket-03-title-normalization.md`
- `ticket-04-tv-rule-matching.md`
- `ticket-05-movie-rule-matching.md`
- `ticket-06-sqlite-dedupe-and-run-history.md`
- `ticket-07-transmission-adapter.md`
- `ticket-08-end-to-end-run-pipeline.md`
- `ticket-09-status-command.md`
- `ticket-10-retry-failed-command.md`

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- the previous tests are green
- the public interface is acceptable
- open design questions are resolved

## Stop Conditions

Pause for review after every ticket if:

- a regex rule is too loose to explain clearly
- dedupe identity becomes ambiguous
- Transmission response handling requires a broader interface than planned
- a test needs to mock internal modules instead of a true system boundary
