# P14.05 Feeds UI

## Goal

Add a Feeds section to the dashboard config page with add/remove functionality, including server-side blocking URL validation feedback, using the `PUT /api/config/feeds` endpoint from P14.02.

## Scope

- Update [`web/src/routes/config/+page.server.ts`](../../../web/src/routes/config/+page.server.ts):
  - add a `saveFeeds` server action that reads the current ETag, attaches `Authorization: Bearer` (server-only env), and proxies to `PUT /api/config/feeds`
  - the server action sends the full updated feeds array (existing minus removed, plus new entry if adding)
  - propagate API errors to the form result: 400 with feed URL in the error body maps to an inline field error on the URL input; 409 maps to a stale-ETag message; 403 maps to write-disabled state
- Update [`web/src/routes/config/+page.svelte`](../../../web/src/routes/config/+page.svelte):
  - add a Feeds section:
    - list of current feeds, each showing name + URL + mediaType badge + remove button
    - inline add form: name text input, URL text input, mediaType select (`tv` / `movie`)
    - submit button triggers the `saveFeeds` action; while the action is in flight (server-side fetch to the URL is blocking), show a spinner on the submit button
    - on 400 with a URL error: show the API error message under the URL field
    - on success: clear the add form, refresh the feeds list
  - all controls `disabled` with tooltip when `canWrite` is false
- Anchor SvelteKit types for the feeds array to `fixtures/api/config-with-feeds.json` committed in P14.02

## Prerequisite

P14.02 must be done and `fixtures/api/config-with-feeds.json` must be committed before implementation of this ticket begins.

## Implementation Note

The spinner on submit is important: the server action will block for up to 10 seconds on a new URL fetch. The UI must communicate that work is in progress so the operator does not double-submit.

## Out Of Scope

- Per-feed poll interval editing (deferred).
- Client-side URL format pre-validation beyond basic non-empty check (server is authoritative).
- Full toast UX with post-save restart offer (Phase 16).

## Exit Condition

The Feeds section is present in the dashboard config page. Adding a feed triggers server-side URL validation with a visible in-flight spinner and inline error on failure. Removing a feed updates the list. Disabled state is correct when no write token. Types anchored to fixture data.

## Rationale

`saveFeeds` receives the full current feeds array as hidden inputs (`feedName[]`, `feedUrl[]`, `feedMediaType[]`) plus optional `newFeedName`, `newFeedUrl`, `newFeedMediaType` for an add-in-progress entry. The server zips these into a `{ name, url, mediaType }[]` array and sends it as the raw JSON body to `PUT /api/config/feeds` (which expects an array, not a wrapped object). If `newFeedUrl` is empty the new-feed fields are silently ignored — this allows save-removes-only without requiring a new feed entry.

`use:enhance` with a custom callback tracks `feedsSubmitting` state for the in-flight spinner. The button changes to "Saving…" while the action is running; on completion (success or error) the state resets. On success, `newFeedName`, `newFeedUrl`, and `newFeedMediaType` are cleared before `update()` re-runs the load. `update()` invalidates all page data, so `data.config.feeds` refreshes and the `$effect` reinitializes `feedsList` from the server-confirmed state.

`feedsEtag` from the action result is folded into `currentEtag` at the highest priority, keeping the ETag current for subsequent saves on other sections.

400 responses from the feeds endpoint always indicate either invalid feed format or a URL fetch failure. Both are surfaced as `feedsUrlError` (shown under the URL input) rather than a generic alert. Other non-2xx status codes use `feedsMessage` and appear in the general alert area. The 404/409/403 handling follows the same pattern as other sections.

Remove buttons update `feedsList` state locally (no immediate save). The updated list is included in the next submit, which persists the removal atomically.
