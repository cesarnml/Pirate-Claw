# P17.01 Onboarding Shell, Trigger Rules, and First Feed Save

## Goal

Introduce the onboarding route and its entry rules, land the write-disabled blocked state, and make the first feed step a real end-to-end save flow.

## Scope

### Fixtures first — `fixtures/api/`

Commit real `GET /api/config` response snapshots for onboarding route work before dependent UI assertions are written:

- `fixtures/api/config-empty.json` — valid starter-config shape with no feeds, no TV shows, and no movie years
- `fixtures/api/config-feed-only.json` — one saved feed, no TV shows, no movie years

These snapshots are the source of truth for onboarding route load and resume-state tests.

### Onboarding route shell — `web/src/routes/onboarding/`

- Add a dedicated onboarding route with `+page.server.ts`, `+page.svelte`, and tests.
- Load `GET /api/config` using the existing server-side API helper and expose:
  - current config
  - current ETag
  - `canWrite`
  - a derived onboarding state:
    - `initial_empty`
    - `partial_setup`
    - `ready`
    - `writes_disabled`
- Render:
  - feed-type step shell
  - first-feed step form
  - blocked state when writes are disabled
  - non-auto-trigger partial-state guidance with a “Resume onboarding” affordance path

### Trigger and dismissal behavior — `/` and onboarding route

- In [`web/src/routes/+page.server.ts`](../../../web/src/routes/+page.server.ts), load enough config state to decide whether the strict initial-empty auto-trigger applies.
- Apply the agreed rule:
  - auto-trigger only when config is strictly empty
  - dismissal suppresses future auto-trigger until the operator explicitly resumes onboarding
- Keep the suppression client-local; do not add server persistence or schema changes.
- Add a home-page resume CTA entry point for later tickets to build on, even if the full affordance copy/polish lands later.

### First feed save — onboarding server action

- Add a route-local server action on `/onboarding` that reuses the existing Phase 14 feeds write path.
- Save the first feed incrementally with the same validation behavior as `/config`:
  - URL validation remains blocking via the existing endpoint behavior
  - `If-Match` / ETag flow stays intact
  - success advances onboarding state
- Keep the media type derived from the selected onboarding path (`tv`, `movie`, or initial choice for `both`).

### Tests

- `/onboarding` route:
  - renders blocked state when `canWrite` is false
  - renders feed step for strict initial-empty config
  - does not auto-run “ready” state as a wizard when config already has targets
- `/` route:
  - redirects or surfaces onboarding entry only for strict initial-empty config
  - does not auto-trigger for feed-only partial config
  - respects dismissal suppression
- Onboarding feed save action:
  - missing ETag error
  - validation failure passthrough
  - happy path returns fresh ETag and feed-save success

## Out of Scope

- TV target onboarding
- movie target onboarding
- Done step summary/completion gate
- distributed empty-state copy updates outside minimal entry-point scaffolding

## Exit Condition

The app can detect the strict initial-empty case, launch onboarding only there, block honestly when writes are unavailable, and save the first feed as a real incremental step without adding new backend endpoints.

## Rationale

This ticket is intentionally a thin real slice rather than a route-only shell. It proves the entry contract, dismissal semantics, and incremental-save model before later tickets add target-specific branching.

The home route currently takes the "surface onboarding entry" branch rather than forcing an immediate redirect. That still honors the agreed trigger contract for this ticket while keeping the first slice smaller: the route now derives the strict initial-empty vs partial-setup state, surfaces onboarding affordances accordingly, and leaves stronger redirect behavior available as a later refinement if product review still wants it after the dedicated onboarding route exists.
