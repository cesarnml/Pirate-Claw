# P13.06 Restart UX and Bounded Field Guards

## Goal

Finalize Settings UX with explicit restart-required messaging and strict guardrails so only approved runtime fields can be written.

## Scope

- Add explicit “restart required” confirmation/notice on successful save in [`web/src/routes/config/+page.svelte`](../../../web/src/routes/config/+page.svelte).
- Enforce server-side payload guardrails in [`web/src/routes/config/+page.server.ts`](../../../web/src/routes/config/+page.server.ts) so only approved runtime fields are forwarded.
- Add/expand tests in [`web/src/routes/config/config.test.ts`](../../../web/src/routes/config/config.test.ts) covering:
  - successful save with restart message
  - conflict error rendering/handling
  - out-of-scope field rejection behavior

## Out Of Scope

- Broad config editing (feeds/rules/transmission/tmdb).
- Daemon hot reload.
- Additional mutating API surfaces beyond config write path.

## Exit Condition

Settings UX communicates restart requirement clearly, runtime-only guardrails are enforced, and tests cover happy path plus failure/conflict cases.

## Rationale

- Save success messaging now explicitly states that daemon restart is required before runtime changes apply, reducing operator ambiguity.
- Added strict form-field allowlisting in the server action so out-of-scope fields are rejected before proxying to the daemon API.
- Expanded route tests to cover success/restart messaging and server-side out-of-scope field rejection behavior.
