# P14.04 Movies Policy UI

## Goal

Add a Movies policy section to the dashboard config page, covering years, resolutions, codecs, and codecPolicy, using the `PUT /api/config/movies` endpoint from P14.01.

## Scope

- Update [`web/src/routes/config/+page.server.ts`](../../../web/src/routes/config/+page.server.ts):
  - add a `saveMovies` server action that reads the current ETag from the loaded config, attaches `Authorization: Bearer` (server-only env), and proxies to `PUT /api/config/movies`
  - propagate API errors (400, 409, 403) to the form result
- Update [`web/src/routes/config/+page.svelte`](../../../web/src/routes/config/+page.svelte):
  - add a Movies section with:
    - years: number input + add button, year chips with remove button
    - resolutions: multi-select chips
    - codecs: multi-select chips
    - codecPolicy: two-option segmented control (`Prefer` / `Require`)
  - all controls `disabled` with tooltip when `canWrite` is false
  - success state: inline saved confirmation
  - error state: surface API error message inline
- Anchor SvelteKit types for movies fields to `fixtures/api/config-with-movies.json` committed in P14.01

## Prerequisite

P14.01 must be done and `fixtures/api/config-with-movies.json` must be committed before implementation of this ticket begins.

## Out Of Scope

- Per-feed movie rules or per-year overrides (deferred).
- Full toast UX with post-save restart offer (Phase 16).
- Advanced codec gating beyond the existing `prefer` / `require` policy.

## Exit Condition

The Movies section is present and functional in the dashboard config page. All four fields (years, resolutions, codecs, codecPolicy) save correctly via the server action. Disabled state is correct when no write token. Types anchored to fixture data.

## Rationale

`saveMovies` follows the same shape as `saveTvDefaults`: server-side write token check, ETag extraction, payload forwarding to the daemon API, and distinct return keys (`moviesMessage`, `moviesEtag`, `moviesSuccess`) so the alert block can distinguish which action's result is being shown. `moviesEtag` is folded into `currentEtag` with the highest priority so that the ETag stays current across any sequence of partial saves.

The display-only Movies card that was previously inside the `saveSettings` form was removed and replaced by the new editable `saveMovies` form. The two forms are siblings in the outer `space-y-6` container, which keeps HTML valid (no nested forms) while preserving the visual section grouping.

Years management uses Svelte `$state` array + hidden inputs: toggle buttons only flip chip membership, and an add-year text input + "Add year" button append validated integers. The server independently validates each year (1900–2100) before forwarding the payload. Invalid year input is rejected at the server with a 400.

The codecPolicy segmented control tracks state as `'prefer' | 'require'` with a single hidden input. It initializes from `config.movies.codecPolicy` via the same `$effect` that initializes `movieYears`, `movieResolutions`, and `movieCodecs` from the loaded config.

Two pre-existing web test regressions were fixed as part of this ticket: the `page.server.test.ts` was calling a stale action name (`saveRuntime` vs `saveSettings`), and the `config.test.ts` success alert test used `getByRole('alert')` when the shadcn-svelte Alert's 'default' variant actually renders with `role="status"`, not `role="alert"`.
