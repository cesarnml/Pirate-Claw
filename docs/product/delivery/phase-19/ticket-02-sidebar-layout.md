# P19.02 Sidebar layout

## Goal

Replace the current top-nav + `max-w-5xl` centered column layout with a
persistent left sidebar + full-width content area. Implement all three
responsive states (expanded, icon rail, mobile drawer) so every subsequent
view ticket is reviewed against the correct layout.

## Scope

- **`web/src/routes/+layout.svelte`:** full rebuild
  - Remove existing top-nav bar and `max-w-5xl` content wrapper
  - Sidebar: `~220px` fixed width on desktop; contains:
    - App logo / "Pirate Claw" name at top
    - 4 nav items with icons + labels: Dashboard (`/`), TV Shows (`/shows`),
      Movies (`/movies`), Config (`/config`)
    - System status strip at bottom: daemon uptime, Transmission connection
      indicator (sourced from existing `/api/health` + `/api/status` data
      already loaded in the current layout)
  - Content area: fills remaining width; no `max-w` cap
- **Responsive breakpoints:**
  - `lg` and above: persistent expanded sidebar (`~220px`)
  - `md`: icon-only rail (`~64px`) — icons visible, labels hidden
  - `sm` and below: sidebar hidden; hamburger button in a thin top bar
    triggers a full-screen drawer overlay
- **Mobile drawer implementation:**
  - Writable Svelte store for open/closed state
  - `transition:fly` from the left on open
  - Overlay `<div>` behind the drawer dismisses on click
  - Same sidebar contents as desktop; closes on nav item click
- **Orphaned routes:** `/candidates` and `/candidates/unmatched` remain on the
  filesystem and continue to respond; the new sidebar does not link to them.
  They are deleted in P19.03.

## Out Of Scope

- Any changes to view content inside the routes (P19.03–P19.07)
- Deletion of `/candidates` or `/candidates/unmatched` route files (P19.03)
- Status chip component (P19.03)

## Exit Condition

The sidebar renders in all three responsive states. Navigation between the 4
linked routes works on desktop and mobile. The mobile drawer opens, closes on
nav click, and closes on overlay click. The content area fills the available
width at all breakpoints. All existing route functionality (including the
orphaned `/candidates` routes) continues to work.

## Rationale

Shipping the full responsive sidebar in one ticket avoids reviewing subsequent
view PRs against a half-responsive layout. The drawer implementation is
self-contained to `+layout.svelte` and Svelte's built-in transitions, keeping
the complexity cost low and fully isolated from the view redesigns.
