# P13.01 Config Model and Token Wiring

## Goal

Add a bounded write-token configuration model that supports `runtime.apiWriteToken` with env override precedence (`PIRATE_CLAW_API_WRITE_TOKEN`) while preserving current read behavior and secret redaction discipline.

## Scope

- Extend runtime config model and validation in [`src/config.ts`](../../../src/config.ts) to include optional `apiWriteToken`.
- Implement env override precedence for `PIRATE_CLAW_API_WRITE_TOKEN`.
- Keep compatibility with existing config files that omit the token.
- Add or update config tests for:
  - token unset/empty behavior
  - config token only
  - env override precedence over config token
- Update `.env.example` with `PIRATE_CLAW_API_WRITE_TOKEN` and concise setup notes.

## Out Of Scope

- Any new mutating API endpoint behavior (P13.03+).
- Web Settings save flow.
- Concurrency/ETag behavior.

## Exit Condition

Config parsing and validation support token wiring with env precedence, tests pass, and `.env.example` documents the token variable.

## Rationale

- Added `runtime.apiWriteToken` as an optional runtime field so existing configs remain valid when the token is omitted.
- Enforced precedence `PIRATE_CLAW_API_WRITE_TOKEN` > config file token to support operational secret management without file edits.
- Treating empty token values as disabled avoids accidental write enablement while still allowing explicit opt-out in file-backed config.
- Extended API config redaction to include `runtime.apiWriteToken` so read endpoints continue to avoid leaking secrets.
