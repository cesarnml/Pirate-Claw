# Phase 19 Implementation Plan

**Status:** Not started — ticket decomposition approved; ready for orchestrator.

Phase 19 elevates the web UI from a functional ops dashboard to a visually
premium media command center. It adopts the Obsidian Tide design language,
restructures navigation to a left sidebar, absorbs the Candidates and Unmatched
routes into the Dashboard, and surfaces existing API data (movie backdrops,
Phase 18 Plex state) that the current UI leaves on the table. No new daemon API
endpoints are introduced.

**Product contract:** [`docs/product/plans/phase-19-ui-redesign-razzle-dazzle.md`](../../01-product/phase-19-ui-redesign-razzle-dazzle.md)

## Epic

- `Phase 19 UI/UX Redesign — Razzle-Dazzle`

Follow the shared guidance in [`docs/product/delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Decomposition Decisions (grill-me)

| Decision                   | Choice                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| Tokens vs layout           | Separate tickets — tokens land first as CSS-only baseline                                       |
| Route removal timing       | `/candidates` + `/candidates/unmatched` removed in P19.03 (Dashboard), not P19.02 (sidebar)     |
| TV Shows vs TV Show Detail | Two separate tickets — Detail's backdrop hero and episode table are a distinct complexity spike |
| View ticket order          | Dashboard → TV Shows → TV Show Detail → Movies → Config                                         |
| Onboarding retouch         | Folded into P19.01 (tokens ticket); no dedicated ticket                                         |
| StatusChip component       | Built in P19.03 (first consumer); imported by P19.04–P19.06                                     |
| Sidebar responsive states  | All three (expanded, icon rail, mobile drawer) ship in P19.02 — no deferral                     |
| Plex chip condition        | Null-check `plexStatus` per item; no global config flag                                         |

## Stack (high level)

- SvelteKit (`web/`) — all changes are frontend-only
- Existing daemon HTTP API — zero new endpoints
- Obsidian Tide CSS design tokens in `web/src/app.css`
- TMDB backdrop data (`backdropUrl`) already present in `/api/movies` response
- Plex enrichment fields (`plexStatus`, `watchCount`, `lastWatchedAt`) delivered by Phase 18

## Ticket Order

1. `P19.01 Design tokens + onboarding retouch`
2. `P19.02 Sidebar layout`
3. `P19.03 Dashboard redesign`
4. `P19.04 TV Shows redesign`
5. `P19.05 TV Show Detail redesign`
6. `P19.06 Movies redesign`
7. `P19.07 Config redesign`
8. `P19.08 Docs, index updates, exit verification`

## Ticket Files

- `ticket-01-design-tokens.md`
- `ticket-02-sidebar-layout.md`
- `ticket-03-dashboard-redesign.md`
- `ticket-04-tv-shows-redesign.md`
- `ticket-05-tv-show-detail-redesign.md`
- `ticket-06-movies-redesign.md`
- `ticket-07-config-redesign.md`
- `ticket-08-docs-exit-verification.md`

## Exit Condition

Matches the product doc:

> The web UI adopts Obsidian Tide visual language across all routes. Left
> sidebar navigation is in place and functional on desktop and mobile.
> Candidates and Unmatched are no longer top-level routes; their data surfaces
> in the redesigned Dashboard. Movie backdrops render on the Movies grid. If
> Phase 18 is configured, Plex status chips appear on TV Shows, TV Show Detail,
> and Movies views. All existing read and write functionality continues to work.

Source: [`docs/product/plans/phase-19-ui-redesign-razzle-dazzle.md`](../../01-product/phase-19-ui-redesign-razzle-dazzle.md) (Exit Condition section).

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- the previous visual output matches the reference design intent for that view
- all existing read and write functionality on the changed route remains working
- the phase-level deferrals remain unchanged

## Explicit Deferrals

These are intentionally out of scope for Phase 19 (see product doc **Explicit Deferrals**):

- New daemon API endpoints of any kind
- New config fields or intake behavior
- Dark/light theme toggle (Obsidian Tide dark is the single theme in v1)
- Advanced animations or page transitions beyond standard Svelte transitions
- Onboarding wizard structural re-architecture (tokens retouch only)
- Mobile-native app or PWA manifest

## Stop Conditions

Pause for review if:

- any reference design screenshot requires an API field not currently returned by an existing endpoint
- a shadcn-svelte component cannot be styled to match the Obsidian Tide spec without replacing it entirely
- the responsive sidebar behavior requires a dependency not already in `web/package.json`

## Phase Closeout

- **Retrospective:** `required`
- **Why:** Phase 19 restructures the operator navigation surface, absorbs two routes, and establishes the v1 visual contract. Design decisions here (sidebar structure, view consolidation, design token system) are durable and will constrain future phases.
- **Trigger:** product-impact + durable-learning risk
- **Artifact:** `notes/public/phase-19-retrospective.md`
- **Scope:** retrospective writing is in scope for P19.08 (docs/exit ticket).
