# P13.03 Auth-Gated Config Write Endpoint

## Goal

Introduce mutating config write endpoint(s) that are disabled by default and require bearer token authorization when enabled.

## Scope

- Add config write endpoint(s) in [`src/api.ts`](../../../src/api.ts).
- Enforce token-disabled behavior when token is unset/empty (clear non-2xx response).
- Enforce `Authorization: Bearer <token>` checks for writes.
- Reuse existing config validation from [`src/config.ts`](../../../src/config.ts) for incoming updates.
- Write updated config atomically to the daemon’s active config path.
- Add API tests for disabled mode, unauthorized/forbidden requests, and validation failures.

## Out Of Scope

- `If-Match` / `409` conflict contract (P13.04).
- Web Settings form/actions and UX messaging.
- Editing out-of-scope config structures (feeds/rules/transmission/tmdb).

## Exit Condition

Write endpoint(s) exist with token gating and disabled-by-default behavior, writes are validated and atomic, and auth/error-path tests pass.

## Rationale

- Added `PUT /api/config` with explicit disabled/unauthorized/forbidden responses so mutating behavior is opt-in and token-gated by default.
- Limited write payloads to `runtime` updates only to avoid expanding config mutation surface before dedicated ticket scope.
- Reused `validateConfig` for merged-on-disk config validation and persisted changes via atomic temp-file rename to reduce corruption risk on partial writes.
