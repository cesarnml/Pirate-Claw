# P17.02 Onboarding TV Target Save

## Goal

Add the TV target onboarding path so an operator can save TV defaults plus at least one TV show from the onboarding flow without clobbering existing TV shows.

## Prerequisites

- P17.01 merged
- `fixtures/api/config-empty.json` and `fixtures/api/config-feed-only.json` committed
- existing `fixtures/api/config-with-tv-defaults.json` available for type anchoring

## Scope

### Onboarding TV target step — `web/src/routes/onboarding/`

- Add the TV target UI branch for onboarding:
  - show name input
  - TV default resolutions chips
  - TV default codecs chips
- Reuse the same option set already established on `/config`.

### Save behavior

- Save TV defaults through `PUT /api/config/tv/defaults`.
- Save TV shows through the existing `PUT /api/config` write path.
- Preserve existing `tv.shows` entries:
  - read the current show list from loaded config
  - append the newly entered show if it is not already present
  - do not replace the list with only the onboarding value
- Keep the operation incremental; the target step records progress as soon as the TV save succeeds.

### Tests

- TV target step renders from feed-only partial config
- saving a new show appends to an existing show list
- duplicate show handling remains stable and does not create duplicate entries
- TV defaults save and show save both surface success/error correctly

## Out of Scope

- movie target onboarding
- `Both` path composition
- Done step summary/completion gate
- config-page empty-state changes

## Exit Condition

An operator on the TV onboarding path can save TV defaults and at least one show from onboarding, and the flow preserves any existing show list already in config.

## Rationale

TV target onboarding is separated because its preservation rule is easy to get wrong: the API accepts a full `tv.shows` array, so the onboarding implementation must carry forward the existing list explicitly.

The onboarding route owns its save action instead of delegating through `/config` so the flow stays route-local and can sequence `PUT /api/config/tv/defaults` followed by `PUT /api/config` with the returned ETag. That keeps the default-save and show-append behavior incremental without clobbering existing TV targets.
