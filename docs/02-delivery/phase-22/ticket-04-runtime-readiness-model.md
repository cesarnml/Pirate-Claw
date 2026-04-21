# P22.04 Runtime Readiness Model and Daemon Liveness

## Goal

Add a runtime readiness layer on top of `getSetupState`. The browser reflects `not_ready | ready_pending_restart | ready` based on both config completeness and daemon liveness — not just file state.

## Scope

### API

New endpoint: `GET /api/setup/readiness`

Response shape:

```ts
{
  state: 'not_ready' | 'ready_pending_restart' | 'ready';
  configState: 'starter' | 'partially_configured' | 'ready';
  transmissionReachable: boolean;
  daemonLive: boolean;
}
```

Logic:

- `configState` = result of `getSetupState`
- `transmissionReachable` = lightweight RPC ping to configured transmission URL (existing Transmission client, short timeout)
- `daemonLive` = daemon process is running and responsive (can reuse existing health check)
- `state` derivation:
  - `configState !== 'ready'` → `not_ready`
  - `configState === 'ready'` + `!daemonLive` → `ready_pending_restart`
  - `configState === 'ready'` + `daemonLive` + `transmissionReachable` → `ready`
  - `configState === 'ready'` + `daemonLive` + `!transmissionReachable` → `ready_pending_restart` (advisory: transmission unreachable)

### Web (`web/src/`)

- Summary step of the wizard (P22.03) polls `GET /api/setup/readiness` to gate the "Done" button on `state === 'ready'`
- Add a persistent readiness banner to the normal dashboard: `ready_pending_restart` shows "Restart daemon to apply config changes"; `not_ready` shows "Setup incomplete"
- `ready` clears the banner

### Tests

- Unit: `getSetupState` mapping to `not_ready` for `starter` and `partially_configured`
- Integration: mock transmission ping returns unreachable → `ready_pending_restart`

## Out Of Scope

- Automatic daemon restart (P23)
- Transmission provisioning

## Exit Condition

`GET /api/setup/readiness` returns the correct three-state result. The wizard summary step polls and gates "Done" on `ready`. The dashboard banner reflects live readiness state. Transmission unreachable produces `ready_pending_restart`, not a hard block.

## Fixture Snapshot Required

Add `test/fixtures/readiness-not-ready.json`, `readiness-ready-pending-restart.json`, `readiness-ready.json` before UI implementation.

## Rationale

`getSetupState` is a pure file check — it cannot know whether the daemon has picked up a config change or whether Transmission is reachable. The runtime readiness layer adds those two signals without polluting the file-check contract. `ready_pending_restart` is the correct state for "config is complete but daemon hasn't restarted yet" — a common post-setup condition that the operator needs to act on.
