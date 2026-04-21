# P22.02 `getSetupState` Readiness Condition Fix

## Goal

Replace the broken `transmissionCustom` URL-comparison heuristic with a correct feed-driven readiness check: a config is `ready` when it has feeds, each feed's `mediaType` has a configured target block, and the transmission URL is a valid non-empty string.

## Scope

### `src/bootstrap.ts`

Replace the `getSetupState` ready condition:

**Current (wrong):**

```ts
feedsNonEmpty && tvNonEmpty && transmissionCustom;
```

**New:**

- `feedsNonEmpty`: `feeds` array non-empty (unchanged)
- `transmissionUrlSet`: `transmission.url` is a non-empty string (any value — no URL comparison)
- `targetsComplete`: for every distinct `mediaType` across the feeds array:
  - `"tv"` → `tv.shows` non-empty (compact or flat format)
  - `"movie"` → `movies` key is present (not absent)
- ready = `feedsNonEmpty && transmissionUrlSet && targetsComplete`

Remove the `DEFAULT_TRANSMISSION_URL` constant (no longer used for comparison).

### `src/bootstrap.ts` — `SetupState` type

No change to the type (`'starter' | 'partially_configured' | 'ready'`). The mapping to UI readiness states (`not_ready | ready_pending_restart | ready`) is owned by P22.04.

### Tests

- `test/bootstrap.test.ts`: update/add cases:
  - TV-only feeds + tv.shows non-empty + any transmission URL → `ready`
  - movie-only feeds + movies present + any transmission URL → `ready`
  - mixed feeds + both targets configured → `ready`
  - bundled deployment at default URL (`http://localhost:9091/transmission/rpc`) + feeds + targets → `ready` (was broken before)
  - TV feeds + movies present but tv.shows empty → `partially_configured`
  - movie feeds + tv.shows non-empty but movies absent → `partially_configured`

## Out Of Scope

- Transmission reachability probe (P22.04)
- UI readiness display (P22.04)

## Exit Condition

`getSetupState` returns `ready` for a fully configured install regardless of whether the transmission URL is the default. A config with TV feeds requires tv.shows. A config with movie feeds requires movies. A config with both requires both. All tests green.

## Rationale

`transmissionCustom` checked whether the transmission URL differed from the default localhost value. A bundled deployment at the default URL would permanently return `partially_configured` even with feeds and targets fully set up. The fix aligns the readiness check with what actually determines ingestion capability: feeds exist, their target types are configured, and a transmission endpoint is specified. Reachability is a runtime concern owned by P22.04 — `getSetupState` stays a pure file check.
