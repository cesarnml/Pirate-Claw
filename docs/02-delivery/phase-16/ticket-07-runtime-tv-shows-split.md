# P16.07 Runtime and TV Shows Split

## Goal

Split the existing `saveSettings` action (which bundles TV show names and runtime interval fields in a single PUT to `/api/config`) into two separate actions: `saveShows` and `saveRuntime`. Each action gets its own form and Save button in the UI. The Runtime card keeps its existing layout; the TV shows list becomes a standalone card section with its own save.

## Scope

### `+page.server.ts` — new actions

**`saveShows` action** (extracted from `saveSettings`):

- Reads: `ifMatch`, `showName[]`.
- Validates: at least one non-empty show name.
- Sends `PUT /api/config` with body `{ tv: { shows: showNames } }` (same endpoint as today).
- Returns: `{ showsSuccess: true, message: 'TV shows saved.', etag }` or `fail(status, { showsMessage, etag })`.

**`saveRuntime` action** (extracted from `saveSettings`):

- Reads: `runtimeIfMatch`, `runIntervalMinutes`, `reconcileIntervalMinutes`, `tmdbRefreshIntervalMinutes`, `apiPort`.
- Same validation logic as the existing `saveSettings` runtime path.
- Sends `PUT /api/config` with body `{ runtime: { ... } }`.
- Returns: `{ runtimeSuccess: true, message: 'Runtime settings saved.', etag }` or `fail(status, { runtimeMessage, etag })`.
- On `runtimeSuccess`: the page signals the restart offer (interval/port fields always require restart).

**Remove `saveSettings`** once both new actions are verified. Update any tests that reference `saveSettings`.

### `+page.svelte` — form split

- Replace the single `<form action="?/saveSettings">` that contains both TV shows and Runtime fields with two separate forms:
  - `<form action="?/saveShows">` wrapping the TV shows card.
  - `<form action="?/saveRuntime">` wrapping the Runtime card.
- Each form has its own `ifMatch` hidden input (both still read from `currentEtag`).
- TV shows card: "Save shows" submit button.
- Runtime card: "Save runtime" submit button. On `runtimeSuccess`, set `showRestartOffer = true` (the restart offer from P16.02).

### ETag chain

- `currentEtag` is currently a `$derived` that merges ETag values from all form action returns. Add `form?.showsEtag` and `form?.runtimeEtag` to the chain. Remove `form?.etag` (was `saveSettings` ETag) once `saveSettings` is removed.

### Toast integration

- `saveShows` enhance callback: `toast('TV shows saved.', 'success')` or `toast('Save failed — see errors above', 'error')`.
- `saveRuntime` enhance callback: `toast('Saved — restart the daemon for this change to take effect', 'success')` on `runtimeSuccess`. Always shows the restart message since runtime fields always require a restart.

### Tests

- Add tests for `saveShows` action: at least one show required, ETag checks, happy path.
- Add tests for `saveRuntime` action: invalid interval → 400, happy path with ETag update.
- Remove `saveSettings` tests.

## Out of Scope

- Collapsible card wrapping — P16.08.
- Any changes to the `/api/config` PUT endpoint itself — the same endpoint accepts both `{ tv: { shows } }` and `{ runtime }` payloads; no API changes needed.

## Exit Condition

TV shows and Runtime are independently saveable from separate forms. `saveSettings` is removed. ETag chain is intact. All tests green.

## Rationale

The `saveSettings` bundling was a P13 design choice made before the card-per-section UX was defined. Splitting it here, after all other cards have their own save flows (P16.04–P16.06), is the natural last step before collapsing everything into the Accordion layout in P16.08.

Doing the split in its own ticket rather than alongside a card enhancement keeps each change reviewable in isolation. The ETag chain adjustment is the trickiest part — isolating it here means P16.08 only has to deal with layout.
