# Phase 02 Workflow Notes

These are candidate workflow improvements to review before phase 02 planning. The goal is to improve signal and reduce repeat failure modes without adding process noise.

## Current Workflow Summary

- global `AGENTS.md` owns personal defaults
- repo `AGENTS.md` owns only repo-local overrides
- work is ticketed in small vertical slices
- plans are created when needed, then implementation follows
- PR and squash titles carry ticket linkage when clear; normal commits stay clean
- CI runs `verify` and `test`
- AI review comments are advisory, not authoritative
- engineering lessons are documented once instead of rediscovered per ticket

## High-Value Improvements To Consider

- Add a small pre-push gate that runs the same checks as CI: `bun run verify` and `bun run test`.
- Keep short runtime portability notes for each active stack so future tickets do not repeat known environment mistakes.
- Add a minimal PR checklist template:
  - red-first behavior
  - smallest acceptable path
  - deferred work
  - verification run
- Keep a lightweight review standard for AI-generated comments: accept high-signal findings, push back on low-signal or mis-scoped suggestions.

## Changes To Avoid For Now

- do not redesign instruction layering again before phase 02
- do not add more commit or PR policy
- do not over-automate review policy
- do not chase theoretical portability beyond environments exercised by CI and local development

## Recommendation

Ship with the current workflow. Only adopt phase 02 changes that either:

- prevent a repeated class of failures
- reduce review friction in a measurable way
- tighten local-to-CI parity
