# P22.03 Dependency-Ordered Setup Wizard

## Goal

Replace the Phase 17 onboarding wizard with a dependency-ordered setup flow that handles both `starter` and `partially_configured` installs, saves incrementally through the existing config write path, and hands off to the normal UI only when the system is truly ingestion-ready.

## Scope

### API

- `GET /api/setup/state` (P21.02) is already present — no change
- `POST /api/config` (existing write path) is the save channel for all wizard steps — no new write endpoints required
- If the write-access key setup step requires a dedicated endpoint, add `POST /api/setup/write-key` in this ticket

### Web (`web/src/`)

Wizard steps in dependency order:

1. **Transmission** — URL, username, password; inline reachability ping (can use existing `/api/status` or a new lightweight probe); advisory if not reachable but not blocking
2. **Write-access key** — set the browser-side write key; must be completed before any write step
3. **Media directories** — download directory config (`downloadDirs.tv`, `downloadDirs.movie`)
4. **First feed** — add one feed with `mediaType` declared; `mediaType` drives which target step follows
5. **Target rule** — TV show (if feed is tv) or movies policy (if feed is movie); step label and form adapt to the feed's mediaType
6. **Summary** — shows current `getSetupState` result; "Done" enabled only when state is `ready`; links to normal dashboard

Incremental save: each step calls the existing config write path on completion. Returning to an incomplete wizard resumes at the first incomplete step (derived from current `getSetupState` + config shape, not wizard-local state).

Both `starter` and `partially_configured` installs enter the same wizard. `partially_configured` pre-fills completed steps.

### Shared primitives

Config field components used in the wizard (Transmission form, feed form, TV show form, movies policy form) must be the same components used by the normal `/config` page. No wizard-only form implementations.

## Fixture Snapshot Required

Before implementation begins, add a fixture snapshot for the `GET /api/setup/state` response in each setup state:

```
test/fixtures/setup-state-starter.json
test/fixtures/setup-state-partially-configured.json
test/fixtures/setup-state-ready.json
```

The wizard reads `getSetupState` on load to determine resume point. Fixtures must exist before UI implementation.

## Out Of Scope

- Plex setup step (manual token field stays on `/config`, labeled legacy)
- TMDB setup step
- Transmission reachability as a hard blocking condition (advisory only in this ticket; P22.04 owns blocking readiness)
- Bulk feed/rule management

## Exit Condition

A `starter` install opens the browser, enters the wizard, completes all six steps with incremental saves, and reaches a `getSetupState` result of `ready`. A `partially_configured` install resumes at the first incomplete step. Wizard "Done" is disabled until `ready`. Shared form components are used in both wizard and `/config`.

## Rationale

The Phase 17 wizard assumed the operator was starting fresh with a template config. Phase 22 starts from an honest empty state (P22.01) and a correct readiness check (P22.02). The wizard must therefore drive the operator through every required field rather than relying on pre-filled defaults. Incremental saves through the existing write path mean the wizard and config page are always consistent — there is no wizard-only state to reconcile.
