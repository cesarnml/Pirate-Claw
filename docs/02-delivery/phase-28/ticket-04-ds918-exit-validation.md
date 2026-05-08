# P28.04 DS918+ Exit Validation

## Goal

Validate the complete P28 auth flow on the DS918+ DSM 7.1 baseline.

## Scope

Manual validation checklist on DS918+ / DSM 7.1.1:

- [ ] First visit with no owner → setup screen shown; no app shell, no diagnostics, no torrent state visible
- [ ] Owner account creation → session issued; redirected to onboarding/dashboard
- [ ] Logout → session cleared; redirected to `/login`
- [ ] Login with correct credentials → session issued; app shell accessible
- [ ] Login with wrong credentials → error shown; no session issued
- [ ] Expired session → silent redirect to `/login` (no alarming error)
- [ ] Unauthenticated GET to app shell route → redirected to `/login`
- [ ] Unauthenticated mutating request to web API → 401 returned
- [ ] Destructive actions (torrent pause, config write, daemon restart) blocked when logged out
- [ ] Destructive actions succeed after login
- [ ] LAN origin access works without trust banner (auto-persisted during setup)
- [ ] Tailscale access from a new origin → trust banner shown; one click trusts origin; banner gone on next load
- [ ] Direct-mode acknowledgement banner appears in Config on first authenticated visit; disappears after any acknowledgement action
- [ ] Daemon restart preserves `session-secret` (existing JWT cookies remain valid)
- [ ] Fresh install (no `session-secret`) → daemon generates one on startup

Record findings in the ticket rationale. If any item fails, open a follow-up before closing this ticket.

## Out Of Scope

- New feature work
- Performance or load testing

## Exit Condition

All checklist items pass on DS918+ DSM 7.1. Findings documented in rationale.

## Rationale

Automated test suite (`bun run ci:quiet`) passes across the full stack. All unit tests for the P28 auth layer, session management, hooks auth guard, trust-origin proxy, and network-posture proxy pass cleanly.

Physical device validation on DS918+ / DSM 7.1.1 is still required before closing this ticket. The checklist items above represent the exit criteria; each must be manually exercised on the target hardware.

Validation attempt on 2026-04-29:

- `https://100.108.117.42:5001/` returned HTTP 200, so the DSM management UI is reachable over Tailscale.
- `http://192.168.1.52:8888/` failed to connect.
- `http://100.108.117.42:8888/` timed out with no response.
- Browser automation was unable to inspect the DSM UI directly, so container state could not be verified from this agent session.

Current blocker: Pirate Claw web is not reachable on the DS918+ validation target, so the P28.04 checklist cannot be truthfully exercised. Next validation step is to inspect DSM Docker/Container state on the DS918+ and restore the Pirate Claw web service on port 8888 before rerunning the checklist. If the service is running but still unreachable, open a follow-up for the port 8888/container health failure before closing this ticket.

Validation attempt on 2026-05-08:

- Fresh DS918+ install reached `http://100.108.117.42:8888`, but web owner setup was blocked by two implementation defects.
- The daemon container was running background cycles but not listening on `:5555` because the manually created DSM container was missing `PIRATE_CLAW_API_PORT`; web calls to `http://pirate-claw-daemon:5555` failed with connection refused errors.
- The no-owner web guard still redirected `/` to `/login` after daemon API recovery because `hooks.server.ts` threw `redirect(302, "/setup")` inside a local `try` and caught the redirect as if it were a daemon failure.
- Manual `/setup` owner creation returned `500 Internal Error` while daemon API was unreachable; `/volume1/pirate-claw/config/auth/owner.json` was not created.
- Local fixes now persist Synology API defaults into starter config, bake appliance defaults into daemon/web images, and move no-owner redirect selection outside the catch path. Patched images were loaded onto the DS918+; daemon now listens on `0.0.0.0:5555`, web can read `/api/auth/state`, and unauthenticated `/` redirects to `/setup` when `owner_exists` is false.

Remaining manual validation resumes from owner account creation on `/setup`.
