# P16.04 RSS Feeds Card

## Goal

Integrate the toast system (P16.02) into the existing RSS Feeds card and tighten the inline URL error display. No structural changes to the card's save logic — the `saveFeeds` action is already correct.

## Scope

### `+page.svelte` — Feeds card enhance callback

- Update the `use:enhance` callback for the feeds form to call `toast('Saved', 'success')` on `feedsSuccess` and `toast('Save failed — see errors above', 'error')` on failure.
- For 409 responses: call `toast('Config changed elsewhere — reload and try again', 'error')` with a Reload button (use the canonical 409 toast from P16.02's message table).
- Remove any remaining Alert references for feeds feedback — P16.02 deleted the top-level Alert block, but double-check the enhance callback doesn't still reference `form.feedsMessage` for rendering.

### Inline URL error

- The `feedsUrlError` field already surfaces from the `saveFeeds` action on 400.
- Verify the error renders inline below the URL input (already in the template at `{#if form?.feedsUrlError}`). No change needed if it's already correct — just confirm it survives the Alert removal from P16.02.

### Spinner during save

- `feedsSubmitting` state already exists and disables controls. Confirm the submit button label still shows "Saving…" while submitting. No change if already correct.

### Tests

- Existing `saveFeeds` action tests remain valid — no action changes.
- If a UI integration test exists for the feeds section, update it to assert on toast calls rather than Alert element presence.

## Out of Scope

- Changes to the `saveFeeds` server action.
- Per-feed poll interval editing (deferred by PRD).
- Collapsible card wrapping — P16.08.

## Exit Condition

Feeds card produces toasts on save success and failure. 409 conflict shows the reload toast. Inline URL error remains functional. Tests green.

## Rationale

The feeds save logic is complete from P14. This ticket is purely a feedback-layer integration — wiring the existing enhance callback to the toast system built in P16.02. Keeping the scope minimal avoids disturbing a tested, working save path.
