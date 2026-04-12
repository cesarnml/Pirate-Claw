# P16.05 TV Configuration Card

## Goal

Fix the TV defaults pre-population bug (tvResolutions and tvCodecs never populated from the API response), integrate toasts, and tighten the TV Configuration card layout to match the PRD's description.

## Scope

### Fix tvDefaults pre-population bug — `+page.svelte`

**Current behavior (bug):** `tvResolutions` and `tvCodecs` are initialized to `[]` and the `$effect` block does not populate them from `data.config`. The `GET /api/config` response now includes `tvDefaults` (added in P16.01), but the Svelte state is never wired to it.

**Fix:**

- Update the `$effect` block to include:
  ```ts
  tvResolutions = [...(c.tvDefaults?.resolutions ?? [])];
  tvCodecs = [...(c.tvDefaults?.codecs ?? [])];
  ```
- Update the `AppConfig` import/type usage: `c.tvDefaults` is now a required field per the P16.01 type change.

### TV shows section

The TV shows list is currently bundled in the `saveSettings` action with runtime fields. P16.07 will split this — **do not move TV shows in this ticket**. This ticket only touches the TV defaults (resolutions/codecs chips) section of the TV Configuration card.

Verify that the chips for resolutions and codecs correctly reflect `tvResolutions`/`tvCodecs` after the `$effect` fix. No structural chip changes needed.

### Toast integration — `saveTvDefaults` enhance callback

- Add `toast('Saved', 'success')` on `tvDefaultsSuccess`.
- Add `toast('Save failed — see errors above', 'error')` on failure.
- 409: use canonical reload toast.
- Remove any lingering Alert reference for `tvDefaultsMessage`.

### Tests

- `saveTvDefaults` action tests remain valid — no action changes.
- Add or update a UI test that verifies `tvResolutions` and `tvCodecs` are populated from `config.tvDefaults` on load (use the updated `config-with-tv-defaults.json` fixture from P16.01).

## Out of Scope

- TV shows list and `saveShows` action split — P16.07.
- Collapsible card wrapping — P16.08.
- Per-show override editing (deferred by PRD).

## Exit Condition

The TV defaults chips render with the current config values on page load. Save produces toasts. Bug where chips always start empty is fixed. Tests green.

## Rationale

The tvDefaults pre-population bug makes the TV Configuration card actively misleading — an operator who saves with empty chips would wipe their current TV defaults. Fixing it in this ticket, as soon as the P16.01 API extension is available, prevents that data-loss risk from shipping.

The TV shows list is intentionally left in `saveSettings` here and split in P16.07, keeping this ticket narrowly scoped to the bug fix and toast wiring.
