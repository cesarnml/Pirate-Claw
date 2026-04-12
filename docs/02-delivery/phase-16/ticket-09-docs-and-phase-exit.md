# P16.09 Docs and Phase Exit

## Goal

Update the runbook with the supervisor requirement, mark Phase 16 delivered across all status docs, and close out the delivery directory.

## Scope

### `docs/01-product/phase-06-synology-runbook.md`

- Add a section "Daemon supervisor requirement" (or extend an existing restart/recovery section):
  > Pirate Claw must be run under a supervisor that auto-restarts the process on exit. On Synology, use Task Scheduler with "Run at boot" and restart-on-failure enabled. On Linux, use a systemd unit with `Restart=on-failure`. The `POST /api/daemon/restart` endpoint triggers a graceful `SIGTERM` shutdown and relies on the supervisor to bring the process back up.

### `docs/01-product/phase-16-config-editing-hot-reload-and-daemon-controls.md`

- Update the "Delivery status" line at the top from "Not started — product definition only" to "Delivered — see `docs/02-delivery/phase-16/`".

### `docs/00-start-here.md` (or equivalent roadmap doc)

- Mark Phase 16 as delivered. Update "current phase" pointer to Phase 17.

### `docs/02-delivery/phase-16/implementation-plan.md`

- Update "Delivery status" from "Planning/decomposition only. Implementation has not started." to "Delivered."

### Phase exit verification checklist (confirm before merging this ticket)

- [ ] `POST /api/daemon/restart` endpoint live, bearer-authed, tests green (P16.01)
- [ ] `POST /api/transmission/ping` endpoint live, tests green (P16.01)
- [ ] `tvDefaults` exposed in `GET /api/config` response and type (P16.01)
- [ ] `fixtures/api/config-with-tv-defaults.json` updated with `tvDefaults` field (P16.01)
- [ ] Toast system wired, old Alert blocks removed, `restartDaemon` action tested (P16.02)
- [ ] Transmission card shows status dot, version, masked credentials, Test Connection (P16.03)
- [ ] RSS Feeds card produces toasts (P16.04)
- [ ] TV Configuration card pre-populates tvDefaults chips from API response (P16.05)
- [ ] Movie Policy card produces toasts (P16.06)
- [ ] `saveSettings` removed; `saveShows` and `saveRuntime` replace it (P16.07)
- [ ] All cards wrapped in Accordion; read-only mode audited (P16.08)
- [ ] Runbook updated with supervisor requirement (P16.09)

## Out of Scope

- Any code changes.

## Exit Condition

All checklist items confirmed. Docs updated. Phase 16 is marked delivered.
