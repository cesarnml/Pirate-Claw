# P20.05 Context Menu UI

## Goal

Wire a right-click context menu on TorrentManagerCard torrent rows that surfaces all active-torrent actions: pause, resume, remove, and remove+delete. All backend endpoints exist by this ticket — this ticket is pure UI.

## Depends On

P20.04 (dispose — all endpoints now exist)

## Scope

### Context menu component

Right-click anywhere on a torrent row opens a context menu. Available actions are derived from `torrentDisplayState()` for that candidate:

| Display State         | Menu Items                              |
| --------------------- | --------------------------------------- |
| `downloading`         | Pause, Remove, Remove + Delete Data     |
| `paused`              | Resume, Remove, Remove + Delete Data    |
| `completed`           | Remove, Remove + Delete Data            |
| `removed` / `deleted` | none — row renders as terminal, no menu |

Note: `missing` and `queued` are handled by P20.04's inline buttons and have no right-click menu.

### Behavior

- Right-click opens menu anchored to cursor position
- Clicking outside or pressing Escape closes the menu
- Destructive items (Remove, Remove + Delete Data) use a warning color treatment
- While a request is in flight: close the menu, show a loading indicator on the row, disable further right-clicks on that row
- On success: row updates to reflect new state (optimistic or reload)
- On failure: toast or inline error on the row; re-enable right-click

### Endpoint mapping

| Menu item            | Endpoint                                           |
| -------------------- | -------------------------------------------------- |
| Pause                | `POST /api/transmission/torrent/pause`             |
| Resume               | `POST /api/transmission/torrent/resume`            |
| Remove               | `POST /api/transmission/torrent/remove`            |
| Remove + Delete Data | `POST /api/transmission/torrent/remove-and-delete` |

All requests send `{ hash: candidate.transmissionTorrentHash }`.

### Implementation notes

- Use a Svelte action or `contextmenu` event listener on each row
- Portal the menu to `document.body` to avoid overflow clipping from the card
- One active menu at a time — opening a second menu closes the first

## Out of Scope

- Keyboard navigation within the context menu
- Bulk multi-row actions

## Exit Condition

- Right-click on a `downloading` row shows Pause, Remove, Remove + Delete Data
- Right-click on a `paused` row shows Resume, Remove, Remove + Delete Data
- Right-click on a `completed` row shows Remove, Remove + Delete Data
- Right-click on a `removed` or `deleted` row: no menu
- In-flight state disables the row correctly
- Success updates the row state; failure shows an error
- `bun run typecheck` passes
