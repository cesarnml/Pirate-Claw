# P16.02 Toast Utility and Save Feedback

## Goal

Build the shared toast infrastructure and save-feedback wiring that all card tickets (P16.03–P16.07) will use. The existing per-section `<Alert>` banners at the top of `+page.svelte` are replaced with a transient toast system. The post-save "Restart Daemon" inline offer is implemented here so card tickets only need to pass a flag.

## Scope

### Toast component — `web/src/lib/components/ui/`

- Verify which Shadcn/UI toast/sonner component is available in the project. Use whatever is already installed rather than adding a new dependency. If a `<Toaster>` or `<Sonner>` component exists in `web/src/lib/components/ui/`, wire it up. If not, add Shadcn/UI's sonner component (`bunx shadcn-svelte@latest add sonner`).
- Mount the toaster at the app root (`web/src/routes/+layout.svelte`) so toasts persist across navigation.

### `useToast` or `toast()` helper — `web/src/lib/`

- Expose a simple `toast(message, variant: 'success' | 'error')` call that the page can use from form enhance callbacks.
- If Sonner is used, this is just a re-export of `toast.success(...)` / `toast.error(...)`.

### Remove existing `<Alert>` feedback blocks from `+page.svelte`

- Delete the `{#if form?.feedsMessage}`, `{#if form?.tvDefaultsMessage}`, `{#if form?.moviesMessage}`, `{#if form?.message}` blocks.
- Replace with `toast()` calls in each section's `use:enhance` callback (already partially structured — the callbacks just need the new call).

### Post-save daemon restart offer — `web/src/routes/config/+page.svelte`

- Add a Svelte `$state` variable `showRestartOffer = false` and `restartOffered = false`.
- After any successful save, if the saved section includes fields that require restart (runtime interval fields, apiPort), set `showRestartOffer = true`.
- For interval/port saves specifically, the success toast message reads: "Saved — restart the daemon for this change to take effect."
- Render an inline "Restart Daemon" button that appears below the saved section (or within the toast action slot if Sonner supports it). Clicking it:
  1. Sets a `restarting = true` state.
  2. Calls `POST /api/daemon/restart` via a client-side `fetch` with the write token forwarded through a SvelteKit server action `restartDaemon`.
  3. Shows "Restarting… the page may become temporarily unavailable."
  4. The button auto-hides after 10 seconds whether or not clicked.
- The restart offer only appears after a save — not as a standalone button.

### `restartDaemon` server action — `web/src/routes/config/+page.server.ts`

- New action: reads `PIRATE_CLAW_API_WRITE_TOKEN` from env, calls `POST /api/daemon/restart`, returns `{ restarted: true }` or `fail(502, { restartError: '...' })`.
- Does not require `If-Match` (matches API contract from P16.01).

### Toast messages (canonical list for implementers)

| Event                                        | Toast variant | Message                                                           |
| -------------------------------------------- | ------------- | ----------------------------------------------------------------- |
| Any section save success (non-interval)      | success       | "Saved"                                                           |
| Save success (includes interval/port fields) | success       | "Saved — restart the daemon for this change to take effect"       |
| Any section save failure                     | error         | "Save failed — see errors above"                                  |
| 409 ETag conflict                            | error         | "Config changed elsewhere — reload and try again" + Reload button |
| Daemon restart triggered                     | success       | "Restarting… the page may become temporarily unavailable"         |
| Daemon restart call failed                   | error         | "Restart failed — try again or restart manually"                  |

### Tests — `web/src/routes/config/config.test.ts` or `page.server.test.ts`

- `restartDaemon` action: disabled writes → fail 403; missing token → fail 401; happy path → `{ restarted: true }`.
- Remove or update tests that assert on the old Alert-based feedback form fields if they exist.

## Out of Scope

- Individual card UI changes — those happen in P16.03–P16.07.
- Collapsible card wrapping — that's P16.08.

## Exit Condition

Toast infrastructure is wired up and the existing `<Alert>` feedback blocks are removed. The `restartDaemon` action exists and is tested. All existing card save flows still work — they just produce toasts instead of banners. Tests green.

## Rationale

Building the toast utility before refactoring individual cards eliminates a rework cycle. If cards are enhanced first with the old Alert pattern and the toast system is retrofitted later, the Alert removal happens twice — once per card. Doing it once here means P16.03–P16.07 each only need to add the `toast(...)` call in their enhance callbacks.

The restart offer is scoped here rather than in a card ticket because it's cross-card behavior — any section save can trigger the offer (if runtime fields are affected). Centralizing it avoids duplicating the `showRestartOffer` state machine across multiple cards.
