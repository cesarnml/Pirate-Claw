# P16.06 Movie Policy Card

## Goal

Integrate the toast system (P16.02) into the existing Movie Policy card. No structural changes to the card's save logic — the `saveMovies` action is already correct.

## Scope

### `+page.svelte` — Movie Policy card enhance callback

- Update the `use:enhance` callback for the movies form to call:
  - `toast('Saved', 'success')` on `moviesSuccess`.
  - `toast('Save failed — see errors above', 'error')` on failure.
  - 409: canonical reload toast.
- Remove any lingering Alert reference for `moviesMessage`.

### Inline field errors

- The `saveMovies` action returns `moviesMessage` on validation failure (bad year range, invalid codecPolicy). This was rendered as an Alert. After P16.02's Alert removal, confirm these errors surface via the error toast "Save failed — see errors above" and are also visible as the toast message detail.
- If the error message is specific enough (e.g., "Years must be whole numbers between 1900 and 2100"), display it as the toast description rather than a generic fallback.

### Tests

- No action changes — existing `saveMovies` tests remain valid.
- Update any UI test asserting on Alert element presence to assert on toast instead.

## Out of Scope

- Changes to the `saveMovies` server action.
- Per-year override or per-feed movie policy (deferred by PRD).
- Collapsible card wrapping — P16.08.

## Exit Condition

Movie Policy card produces toasts on success and failure. Tests green.

## Rationale

Mirrors P16.04 in scope. The save logic is complete; this ticket is purely feedback-layer wiring.
