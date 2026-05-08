# P14.03 TV Section UI

## Goal

Extend the existing TV config section in the dashboard to add editable resolutions and codecs global defaults, using the `PUT /api/config/tv/defaults` endpoint from P14.01.

## Scope

- Update [`web/src/routes/config/+page.server.ts`](../../../web/src/routes/config/+page.server.ts):
  - add a `saveTvDefaults` server action that reads the current ETag from the loaded config, attaches `Authorization: Bearer` (server-only env), and proxies to `PUT /api/config/tv/defaults`
  - propagate API errors (400, 409, 403) to the form result so the UI can surface them
- Update [`web/src/routes/config/+page.svelte`](../../../web/src/routes/config/+page.svelte):
  - add resolutions and codecs multi-select controls to the existing TV section (the shows list from Phase 13 stays unchanged)
  - controls are `disabled` with tooltip `"Configure PIRATE_CLAW_API_WRITE_TOKEN to enable editing"` when `canWrite` is false
  - success state: show saved confirmation (can be simple inline text — full toast UX is Phase 16)
  - error state: surface API error message inline
- Anchor SvelteKit types for the TV defaults fields to `fixtures/api/config-with-tv-defaults.json` committed in P14.01 — do not derive types from prose

## Prerequisite

P14.01 must be done and `fixtures/api/config-with-tv-defaults.json` must be committed before implementation of this ticket begins.

## Out Of Scope

- Per-show codec/resolution overrides (deferred).
- Per-feed poll interval editing.
- Full toast UX with post-save restart offer (Phase 16).
- Any changes to the shows list save flow from Phase 13.

## Exit Condition

The TV config section in the dashboard includes working resolutions and codecs defaults controls. Submitting saves to the daemon via the server action. Disabled state is correct when no write token. Types are anchored to real fixture data.

## Rationale

`canWrite` is derived server-side from `!!env.PIRATE_CLAW_API_WRITE_TOKEN` in the load function and passed to the page as `data.canWrite`. This is the single source of truth for write availability — the same env var the action checks before forwarding to the API. Client-side components just read `data.canWrite`; they never re-derive write availability from the config payload.

TV defaults are in a separate `<form action="?/saveTvDefaults">` outside the existing `saveSettings` form. Nested HTML forms are invalid, so the TV defaults card could not live inside the existing form without restructuring. The `saveTvDefaults` form is placed visually before `saveSettings` in the layout. The `saveSettings` form is left exactly as Phase 13 committed it.

`tvDefaultsEtag` is returned by the `saveTvDefaults` action and folded into `currentEtag` alongside the existing `form?.etag`. This ensures that after a TV defaults save, the next `saveSettings` submission uses the updated revision, avoiding a 409 conflict on the combined save.

Multi-select state (`tvResolutions`, `tvCodecs`) is tracked in Svelte `$state` arrays. Hidden inputs carry the selected values into the form body; toggle buttons flip array membership. The fixed option sets (`ALL_RESOLUTIONS`, `ALL_CODECS`) match the allowed values enforced by `validateCompactTvDefaults` in `src/config.ts` — no duplication of validation logic is needed on the client since the server rejects any invalid value with a 400.

Disabled state uses the HTML `disabled` attribute on buttons and the `title` attribute on the container divs for tooltip text — no tooltip component dependency added.
