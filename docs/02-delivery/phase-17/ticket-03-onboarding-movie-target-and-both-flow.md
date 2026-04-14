# P17.03 Onboarding Movie Target Save and Both Flow

## Goal

Add the movie target onboarding path and compose the `Both` onboarding branch so a user can complete TV then movie target setup in one guided flow.

## Prerequisites

- P17.01 merged
- P17.02 merged
- existing `fixtures/api/config-with-movies.json` available for type anchoring

## Scope

### Movie target step — `web/src/routes/onboarding/`

- Add the movie-target branch for onboarding:
  - movie year input
  - movie resolutions chips
  - movie codecs chips
  - codecPolicy toggle (`prefer` / `require`)
- Reuse the existing config-page option vocabulary and validation ranges.

### Save behavior

- Save through `PUT /api/config/movies`.
- Preserve existing movie policy when present:
  - if movie policy is already populated, onboarding must carry it forward rather than overwrite it with onboarding defaults
  - if movie policy is effectively empty, onboarding may seed it from the onboarding inputs
- Add the first year target incrementally; success advances onboarding state immediately.

### `Both` path composition

- Implement the `Both` onboarding flow as sequential target steps:
  - TV target first
  - movie target second
- Keep the branch logic explicit; do not introduce a combined one-shot save payload.

### Tests

- movie target step validates year and codecPolicy correctly
- existing movie policy is preserved during resumed onboarding
- empty movie policy is seeded correctly on first-time setup
- `Both` flow advances through TV then movie steps in order

## Out of Scope

- Done step summary/completion gate
- route-level or dashboard empty-state alignment

## Exit Condition

An operator can complete the movie onboarding path, and the `Both` branch can guide them through TV then movie target setup without overwriting existing movie policy in resumed flows.

## Rationale

Movie onboarding is separated from TV onboarding because the backend write semantics are different: movie writes replace the full movies section, so preservation behavior must be tested and reviewed on its own.

The onboarding route keeps the chosen path (`tv`, `movie`, or `both`) in route-local form state across post-backs instead of introducing a second onboarding state machine. That keeps the `Both` flow explicit while still letting movie-only partial setups land directly on the movie step and preserving existing movie policy whenever it is already populated.
