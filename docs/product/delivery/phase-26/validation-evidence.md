# Phase 26 Mac Validation Evidence

This artifact records the real-machine validation run for `P26.02 Mac Restart
Truthfulness and Real-Machine Validation`.

## Reference Environment

Validated on `2026-04-23` on the active developer Mac:

- Model: `MacBook Pro` (`MacBookPro18,3`, 14-inch 2021 class hardware)
- Chip: `Apple M1 Pro`
- Architecture: `arm64`
- Memory: `16 GB`
- OS: `macOS 26.4.1 (25E253)`
- Kernel: `Darwin 25.4.0`

System facts were captured from `system_profiler SPHardwareDataType SPSoftwareDataType`,
`sw_vers`, and `uname -m`.

## Validation Method

The repo-owned validator is:

- `bun run validate:mac:launchd`

What it does:

1. Creates a clean temporary install directory that acts as the Pirate Claw
   durable boundary for the run.
2. Symlinks the repo `src/` and `node_modules/` into that install directory so
   the daemon runs from a Mac-style install boundary rather than from the main
   working tree root.
3. Writes a validation config with a dedicated local API port and write token.
4. Installs the repo-owned `launchd` agent via
   `docs/mac-reference-pirate-claw-launch-agent.sh`.
5. Waits for daemon health on the configured port.
6. Seeds durable Plex auth identity state in SQLite.
7. Requests daemon restart through the authenticated restart API.
8. Polls restart proof until the same request resolves to `back_online`.
9. Verifies that config, SQLite, restart-proof, and seeded Plex auth state all
   survive the `launchd`-managed restart.
10. Optionally starts the SvelteKit dev server and verifies that the browser
    restart-status proxy reflects the same `back_online` proof.

## Successful Real-Machine Runs

### Daemon + launchd proof

- Install dir: temporary validator-created install boundary under macOS `TMPDIR`
- Launch agent label: temporary `dev.pirate-claw.phase26.validation.<suffix>`
- API port: `65270`
- Daemon `startedAt` before restart: `2026-04-23T11:44:14.739Z`
- Daemon `startedAt` after restart: `2026-04-23T11:44:25.354Z`
- Restart request id: `54d27296-0cee-4838-a025-a44d8b0bc509`
- Restart proof resolved to `back_online`
- Config survived restart inside the temporary install boundary at
  `pirate-claw.config.json`
- SQLite survived restart inside the temporary install boundary at
  `pirate-claw.db`
- Restart proof artifact survived restart inside the temporary install boundary
  at `.pirate-claw/runtime/restart-proof.json`
- Seeded Plex auth refresh token `phase-26-refresh-token` remained present after
  restart

### Daemon + launchd + browser proxy proof

- Install dir: temporary validator-created install boundary under macOS `TMPDIR`
- Launch agent label: temporary `dev.pirate-claw.phase26.validation.<suffix>`
- API port: `49192`
- Web port: `49193`
- Daemon `startedAt` before restart: `2026-04-23T11:45:11.596Z`
- Daemon `startedAt` after restart: `2026-04-23T11:45:22.306Z`
- Restart request id: `1a72f0f6-7cc7-4c72-bee1-1b3064eea8b6`
- Restart proof resolved to `back_online`
- Browser-facing `/api/daemon/restart-status` proxy returned the same
  `back_online` request id after the daemon returned

## Conclusion

On the validated Apple Silicon Mac reference environment, Pirate Claw can run
under the repo-owned per-user `launchd` contract, accept a restart request, and
return online with:

- a new daemon `startedAt`
- the same durable config file
- the same SQLite database
- the same seeded Plex auth identity state
- a resolved `.pirate-claw/runtime/restart-proof.json`
- a browser-facing restart-status proxy that reflects the returned daemon proof

That is sufficient evidence for the bounded Phase 26 support claim: Mac
`launchd` handoff and return are truthful on Apple Silicon under the supported
per-user supervisor contract.
