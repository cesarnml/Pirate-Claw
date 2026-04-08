# Phase 13 Daemon Config Write API and Settings (Bounded Runtime Subset)

**Delivery status:** Not started — product definition only; no `docs/02-delivery/phase-13/` implementation plan until tickets are approved.

Phase 13 introduces a **bounded**, **opt-in** write path for `pirate-claw.config.json` through the daemon HTTP API and a **Settings** experience in the SvelteKit dashboard. Feeds, rules, and other high-risk structural editing stay out of scope — they are reserved for the Phase 14 placeholder.

## Phase Goal

Phase 13 should leave Pirate Claw in a state where:

- the daemon can accept validated config updates over HTTP **only when** an explicit write token is configured (mutations disabled when unset)
- concurrent edits are handled safely via **ETag** and **If-Match**, with **409** on conflict
- the dashboard can change an **approved subset** of config (focused on `runtime` and other safe operational fields) via **SvelteKit server-side** proxying — the bearer token never reaches browser JavaScript
- operators understand that **a daemon restart is required** after a successful save for changes to take effect in v1

## Product Goals For This Phase

- unlock operator workflows that avoid SSH or manual JSON editing for common tuning (API port cadences, paths where safe, etc.) without opening unauthenticated LAN-wide mutation on existing deployments
- reuse the same config validation path the CLI uses so file-backed config and API-driven updates stay consistent
- make conflict behavior explicit so CLI edits and UI edits cannot silently overwrite each other

## Committed Scope

### Daemon and API

- add mutating endpoint(s) gated by an opt-in config field (for example `runtime.apiWriteToken` or equivalent naming agreed at ticket time)
  - when the token is **absent** or **empty**, mutating routes are **disabled** (reject with a clear error)
- require `Authorization: Bearer <token>` on mutating requests; **leave existing GET endpoints unchanged** for backward compatibility with the Phase 09 LAN read-only story
- validate request bodies using the same rules as `pirate-claw.config.json` loading (implementation reuses existing config validation in `src/config.ts` and related helpers)
- write atomically to the config file path the running daemon was started with
- expose an **ETag** (or equivalent revision) for the config resource on read; require **If-Match** (or equivalent) on write; return **409** when the revision does not match
- preserve redaction behavior for secrets in API responses; do not force plaintext Transmission credentials where Phase 07 env substitution applies

### Web (`web/`)

- **Settings** UI for the **bounded subset** agreed during ticket decomposition (exact fields are not fixed in this product doc)
- forms submit to SvelteKit server actions or server routes that forward to the daemon; the write token is read from **server-only** environment variables (paired with daemon config at deploy time)
- clear **restart required** messaging after successful save (no hot reload of timers or API listener in v1)

## Exit Condition

With write token configured on the daemon and matching server-side token on the dashboard host, an operator can change approved runtime fields from the browser, observe conflict-safe behavior when the file changes elsewhere, and restart the daemon to apply changes. CLI and direct file editing remain supported parallel paths.

## Explicit Deferrals

These are intentionally outside Phase 13:

- structured or bulk editing of **feeds** and **matching rules** in the UI (Phase 14 placeholder)
- TLS termination, SSO, or full API authentication beyond bearer-on-write
- hot reload of config inside the running daemon without restart
- manual queue, retry, or other non-config mutating API features

## Rationale

Phase 09 deferred writes until the dashboard and API contract were stable; Phase 12 stabilizes the read UI. Phase 13 adds mutation only with explicit opt-in, server-side token handling, and revision checks — the minimum viable trust model for NAS LANs without turning every read-only deployment into a writable surface. Deferring feeds and rules keeps the first write phase reviewable and avoids duplicating the entire config schema in form controls before patterns are proven on a smaller subset.
