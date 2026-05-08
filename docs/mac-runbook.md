# macOS Runbook

This is the canonical operator-facing macOS deployment guide for Pirate Claw.

The narrower Phase 26 reference contract still lives at
[`docs/mac-launchd-reference.md`](./mac-launchd-reference.md). Use that file
for the exact supported `launchd` boundary. Use this runbook for the operator
workflow around it.

## Scope

This document is for the supported always-on macOS deployment shape shipped in
Phase 26:

- Apple Silicon Mac hardware
- per-user `launchd` under `~/Library/LaunchAgents`
- one dedicated always-logged-in operator account
- Pirate Claw daemon running continuously from an operator-chosen install
  directory

This runbook does not cover:

- system-wide daemons under `/Library/LaunchDaemons`
- Intel Mac support claims
- App bundles, menu bar packaging, or App Store distribution
- turning Synology and Mac into one mixed-platform operational guide

## Install Boundary

Choose one install directory that Pirate Claw owns. That directory is the
durable boundary for the Mac deployment.

Expected files and directories:

- `<install-dir>/pirate-claw.config.json`
- `<install-dir>/pirate-claw.db`
- `<install-dir>/.pirate-claw/runtime/`
- `<install-dir>/.pirate-claw/runtime/logs/`

The `launchd` plist lives separately under
`~/Library/LaunchAgents/<label>.plist`, but it points back to this install
directory. Do not split config, SQLite, and runtime artifacts across unrelated
Mac-specific folders.

## Prerequisites

- Bun installed and available in `PATH` or `~/.bun/bin/bun`
- Transmission running locally with RPC enabled on port `9091`
- Plex Media Server `1.43.0` or later if you want Plex enrichment
- repo checkout present at the chosen install directory

The current Phase 26 contract is source-first: the supported launch agent runs
`src/cli.ts` from the install directory rather than a packaged `.app`.

## Owner Account Setup

Phase 28 adds an owner auth layer. On first launch the web UI is in **starter mode** and requires owner account creation before any app state or controls are accessible.

1. Start the daemon and open `http://127.0.0.1:5555` (or the configured port) in a browser.
2. You are redirected to `/setup`. Enter a username and password for the owner account and submit.
3. Pirate Claw creates the owner account and logs you in automatically.
4. Complete onboarding or navigate to `/config` to continue setup.

**Complete owner setup immediately after first launch.** Until an owner account exists the web UI has no auth. On subsequent visits log in at `/login` with the owner credentials you created.

## First Boot

From the install directory:

1. Install dependencies:

```bash
bun install
bun install --cwd web
```

2. Start Transmission and confirm RPC is reachable.

3. Start the daemon once in the foreground to generate the starter config if
   needed:

```bash
./bin/pirate-claw daemon
```

4. Stop it after starter mode is written, then open the browser UI when you are
   ready to complete setup:

```bash
PIRATE_CLAW_API_URL=http://127.0.0.1:5555 \
PIRATE_CLAW_API_WRITE_TOKEN=your-write-token \
bun run --cwd web dev --host 127.0.0.1 --port 5173
```

5. Visit `http://127.0.0.1:5173` and complete the browser setup flow.

If you already manage config manually, skip the browser-first flow and write
`pirate-claw.config.json` directly.

## Install The Supported Launch Agent

From the repo checkout at the install directory:

```bash
sh docs/mac-reference-pirate-claw-launch-agent.sh install \
  --install-dir "$(pwd)"
```

What this does:

- writes the reviewed plist to `~/Library/LaunchAgents`
- validates the plist
- bootstraps it into the current user's `launchd` domain
- starts the daemon job immediately

To inspect the exact plist without installing it:

```bash
sh docs/mac-reference-pirate-claw-launch-agent.sh print \
  --install-dir "$(pwd)"
```

## Start / Restart Expectations

Under the supported Mac contract:

- `launchd` is the supervisor
- the browser can request a daemon restart, but it is not the supervisor
- `POST /api/daemon/restart` only asks the daemon process to exit
- `launchd` is what brings the daemon back
- restart-backed behavior is truthful only when config, SQLite, and
  `.pirate-claw/runtime/` remain one durable boundary

Phase 26 validation proved that, on the Apple Silicon reference environment,
the daemon returns under `launchd` with:

- a new daemon `startedAt`
- the same config file
- the same SQLite database
- the same restart-proof artifact
- the same persisted Plex auth identity state

See [`docs/product/delivery/phase-26/validation-evidence.md`](./02-delivery/phase-26/validation-evidence.md)
for the recorded validation run.

## Logs And Inspection

Useful files under the install boundary:

- `.pirate-claw/runtime/logs/launchd.stdout.log`
- `.pirate-claw/runtime/logs/launchd.stderr.log`
- `.pirate-claw/runtime/restart-proof.json`

Useful commands:

```bash
launchctl print "gui/$(id -u)/dev.pirate-claw.daemon"
launchctl list | grep pirate-claw
tail -n 200 .pirate-claw/runtime/logs/launchd.stderr.log
tail -n 200 .pirate-claw/runtime/logs/launchd.stdout.log
```

## Update Flow

From the install directory:

1. Pull or otherwise update the repo checkout.
2. Refresh dependencies if needed:

```bash
bun install
bun install --cwd web
```

3. Reinstall the launch agent so the reviewed plist stays in sync with the
   current repo contract:

```bash
sh docs/mac-reference-pirate-claw-launch-agent.sh install \
  --install-dir "$(pwd)"
```

Re-running `install` is the supported way to apply launch-agent updates.

## Remove Flow

To remove the supported Mac supervisor path:

```bash
sh docs/mac-reference-pirate-claw-launch-agent.sh uninstall
```

That boots the job out of the current user's `launchd` domain and removes the
plist. It does not delete your Pirate Claw config, SQLite database, or runtime
artifacts from the install directory.

## Supported Vs Developer-Only Shortcuts

Supported:

- per-user `launchd` installed from the repo-owned reference artifact
- Apple Silicon Mac hardware
- one durable install directory containing config, SQLite, and runtime state

Developer-only shortcuts:

- `bun run daemon` in a terminal tab
- `bun --watch ./src/cli.ts daemon`
- tmux or screen sessions
- Homebrew services wrapping an ad hoc command

Those shortcuts can still be useful, but they are not the first-class Mac
deployment contract Pirate Claw now supports.
