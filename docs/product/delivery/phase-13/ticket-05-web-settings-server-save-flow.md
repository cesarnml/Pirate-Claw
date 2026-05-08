# P13.05 Web Settings Server-Side Save Flow

## Goal

Enable the dashboard Settings route to submit runtime-only config updates through server-side SvelteKit handling, keeping write token usage server-only.

## Scope

- Extend [`web/src/routes/config/+page.server.ts`](../../../web/src/routes/config/+page.server.ts) with server action/endpoint proxy for runtime-only writes.
- Read write token from server-only environment variable (`PIRATE_CLAW_API_WRITE_TOKEN`) and attach bearer auth server-side.
- Forward `If-Match`/revision data from server side to daemon write API.
- Update [`web/src/routes/config/+page.svelte`](../../../web/src/routes/config/+page.svelte) to provide editable controls for approved runtime-only subset.
- Show save success and explicit error states from server action responses.

## Out Of Scope

- Browser-side token exposure.
- Editing any non-runtime fields.
- Restart-required UX copy finalization (P13.06).

## Exit Condition

Operators can submit runtime-only settings changes via server-side proxy flow, with no token in browser JS and clear save/error handling.

## Rationale

- Added a server-only `saveRuntime` action in `+page.server.ts` so browser clients never receive or submit the write token directly.
- Save flow now forwards `If-Match` with the loaded config `ETag`, preserving optimistic concurrency semantics from the API layer.
- Config route now includes runtime edit controls and explicit success/error alerts, giving operators clear save feedback without widening editable scope beyond runtime fields.
