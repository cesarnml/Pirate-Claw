# Phase 17: Onboarding and Empty State Experience

**Delivery status:** Delivered on `main` via `P17.01`-`P17.07`; see [`docs/02-delivery/phase-17/`](../02-delivery/phase-17/).

Phase 17 covers two distinct surfaces: a first-time setup wizard for operators who just installed pirate-claw, and per-section empty states in the main UI for operators who have a running daemon but haven't added feeds or targets yet.

## Phase Goal

Phase 17 should leave Pirate Claw in a state where:

- a new operator can go from a fresh install to a working pirate-claw config without opening a text editor
- every section of the dashboard that can be empty tells the operator what to do next rather than showing a blank view
- the onboarding wizard hands off to the normal Config page (Phase 16) once the minimum viable config is in place

## Bootstrap Assumption

The daemon requires a valid `pirate-claw.config.json` to start — it cannot run without one. The Phase 17 onboarding wizard depends on the daemon already being up (it submits to the normal write API). This is resolved by shipping a **starter config template** alongside the installation:

- `pirate-claw.config.example.json` already exists in the repo; Phase 17 ensures the install runbook tells operators to copy it to `pirate-claw.config.json` before starting the daemon for the first time
- the starter template contains valid but empty targets (no shows, no movie years, one placeholder feed commented out) so the daemon starts successfully in a "configured but empty" state
- the onboarding wizard then populates targets via the normal Phase 14 write API — no direct file writing from the web process

## Committed Scope

### Daemon and API

No new endpoints. The wizard uses the existing write endpoints from Phase 14:

- `PUT /api/config/feeds` to add the first feed
- `PUT /api/config/tv/defaults` and the existing `PUT /api/config` (tv.shows) to add a TV target
- `PUT /api/config/movies` to add a movie year target

### Web (`web/`)

**First-time onboarding wizard** (shown when `GET /api/config` returns a config with no feeds AND no TV shows AND no movie years)

- multi-step flow, not a modal — a dedicated `/onboarding` route or full-page overlay
- step 1 — **Feed type**: select TV, Movie, or Both; determines which subsequent steps appear
- step 2 — **Add your first feed**: name + URL input; URL is validated (blocking fetch, same 10s/HTTP 2xx rule as Phase 14); type pre-filled from step 1
- step 3 — **Add a target**: if TV selected: show name input + global codec/resolution defaults; if Movie selected: year input + codec/resolution + codecPolicy; if Both: TV then Movie
- step 4 — **Done**: summary of what was configured; "Go to Dashboard" CTA
- wizard is dismissible — operator can skip to the main UI at any point and configure via the Config page instead
- no sample data, no suggestions, no auto-detection of existing media

**Wizard completion condition**: at least 1 feed AND (at least 1 TV show OR at least 1 movie year) must be saved before the "Done" step is reached. The wizard does not enforce this as a hard block — it can be skipped — but it won't show the Done screen until the minimum is met.

**Onboarding decisions**

- Auto-trigger onboarding only for the strict initial-empty case: no feeds AND no TV shows AND no movie years. Once any of those exist, the product does not auto-redirect into onboarding again.
- If the operator dismisses onboarding, that dismissal suppresses future auto-redirects until they explicitly choose to resume onboarding from the main UI.
- The wizard saves incrementally at each successful step rather than batching everything into a final submit. In practice: adding the first feed saves at the feed step; adding targets saves at the target step; the Done step is summary-only.
- When onboarding adds a TV show, it appends to the existing `tv.shows` list and preserves any shows already configured. Onboarding must not replace the show list with only the newly entered show.
- When onboarding adds a movie target, it preserves any existing movie policy already on disk. The wizard may seed movie resolutions, codecs, and codec policy only when the current movie policy is effectively empty; it does not overwrite an existing movie policy as part of resumed onboarding.
- If config writes are disabled in the web app, onboarding does not launch. Show a blocked state instead, directing the operator to enable config writes before using the wizard.
- After the initial-empty auto-trigger case, partially configured installs should surface a prominent "Resume onboarding" CTA rather than forcing the user back into the wizard.

**Per-section empty states** (shown in the main UI when a section has no data)

| Section                     | Empty condition             | Empty state message                                       | CTA                                            |
| --------------------------- | --------------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| TV Shows                    | no TV candidates in DB      | "No TV shows tracked yet"                                 | "Add a show" → Config page TV section          |
| Movies                      | no movie candidates in DB   | "No movies tracked yet"                                   | "Add a movie year" → Config page Movie section |
| Feeds (Config card)         | no feeds configured         | "No feeds configured"                                     | "Add your first feed" → inline add form        |
| Unmatched Candidates        | no skipped_no_match records | "No unmatched items — your policy is catching everything" | —                                              |
| Active Downloads (Overview) | no active torrents          | "Nothing downloading right now"                           | —                                              |
| Archive Commit (Overview)   | no completed items          | "No completed downloads yet"                              | —                                              |

Empty states are informational only — no illustrations, no decorative UI. A short sentence and a link/button is sufficient.

## Explicit Deferrals

- auto-detection of existing media on disk to pre-populate targets
- sample data or suggestions for show names or feeds
- guided walkthrough of Transmission setup (stays in the existing runbook)
- email or notification configuration
- multi-user onboarding (single operator model throughout v1)

## Exit Condition

A new operator who installs pirate-claw, copies the starter config, and starts the daemon sees an onboarding wizard in the browser. By following it they add at least one feed and one target, and the daemon starts picking up candidates on its next run cycle — no terminal required after initial install.

## Rationale

The existing dashboard shows blank sections silently when there is no data. That is confusing for a new operator who doesn't know if the daemon is broken or just unconfigured. Phase 17 makes the "no data yet" state explicit and actionable. The wizard solves the cold-start problem within the constraint that the daemon must already be running — the bootstrap template approach avoids adding a daemon-less write path that would increase the security surface.
