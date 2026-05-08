# DSM 7.2+ Container Manager Install

Validation status: pending DSM 7.2+ tester verification.

This path is included for newer Synology systems that support Container Manager Projects. It uses `compose.synology.cm.yml` from this bundle.

## Before You Start

- Confirm Container Manager is installed.
- Keep the default install root: `/volume1/pirate-claw`.
- Do not place secrets in the compose file. Pirate Claw generates its daemon write token and session secret on first daemon startup.

## Prepare The DSM Folders

1. Open File Station.
2. Create or confirm `/volume1/pirate-claw`.
3. Create or confirm these folders:
   - `config`
   - `config/auth`
   - `config/generated`
   - `data`
   - `downloads`
   - `downloads/incomplete`
   - `media`
   - `media/movies`
   - `media/shows`
   - `transmission/config`

For a true Phase 28 fresh-install validation, remove prior owner/auth state before importing the project. Do not delete media/download folders unless intentionally resetting all data.

## Import The Project

1. Open Container Manager.
2. Open Project.
3. Choose Create or Import from compose file, depending on DSM wording.
4. Select `compose.synology.cm.yml` from this bundle.
5. Name the project `pirate-claw-synology`.
6. Confirm the project uses `/volume1/pirate-claw` as the host folder source for Pirate Claw data.
7. Create the project.
8. Start the project if Container Manager does not start it automatically.

The web service waits for the daemon write token and session secret files before starting the SvelteKit server.

## Open Pirate Claw

1. Open `http://<nas-ip>:8888` in a browser.
2. Fresh Phase 28 install should show the owner setup screen before any app shell appears.
3. Create the owner account.
4. Continue onboarding and install-health checks.

## Phase 28 Notes

- Image references intentionally use `pirate-claw:latest` and `pirate-claw-web:latest`; there are no phase-specific image tags.
- The daemon owns durable auth state under `/volume1/pirate-claw/config/auth/`.
- The web container reads `/volume1/pirate-claw/config/auth/session-secret` through `PIRATE_CLAW_SESSION_SECRET_FILE`.
