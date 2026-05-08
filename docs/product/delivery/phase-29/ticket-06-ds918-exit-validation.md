# P29.06 DS918+ Exit Validation

Size: 2 points
Type: chore
Scope: validation

## Outcome

- Every checklist item below passes on DS918+ DSM 7.1.1 (the last DSM 7.1 hardware gate before upgrade to DSM 7.2.1)
- Findings are documented in the Rationale section of this ticket
- Any blocker discovered during validation is resolved before this ticket closes (follow-up ticket opened if the fix is larger than a single commit)

## Red

- No automated test — this is a manual hardware validation gate
- The "failing" state is: P29.05 is merged but the full flow has not been validated on physical hardware
- Commit this ticket file as the only artifact: `chore(P29.06): ds918 exit validation checklist [red]`

## Green

Run through every checklist item on DS918+ DSM 7.1.1. Check each item off as it passes. Record findings in Rationale.

**CSRF / Multi-Origin (P29.02):**

- [ ] Open Pirate Claw from LAN IP — form submission (e.g. Config save) succeeds
- [ ] Open Pirate Claw from Tailscale mesh IP — form submission succeeds (CSRF gap confirmed closed)
- [ ] Grep daemon logs for `[csrf] loaded N trusted origins` — confirm N matches the number of origins in `trusted-origins.json`

**Plex PIN Callback (P29.02):**

- [ ] Start Plex connect flow from `/onboarding` — after completing Plex auth, browser redirects back to `/onboarding` (not `/config`)
- [ ] Grep logs for `[plex-callback] redirecting to` — confirm destination is `/onboarding`

**Debug Logging (P29.02):**

- [ ] Fresh container start: confirm daemon emits structured lifecycle log lines at startup (config load, trusted-origins load, auth state read)
- [ ] SvelteKit server: confirm `hooks.server.ts` logs session validation result and CSRF origin check result for at least one request — visible in container logs without SSH

**VPN Profile Upload (P29.04 + P29.05):**

- [ ] Navigate to Config → Downloader Network
- [ ] Upload a valid `.ovpn` profile — "Profile saved" confirmation shown
- [ ] Grep daemon logs for `[vpn] profile saved` — confirm size and compose regeneration logged

**VPN Credentials (P29.04 + P29.05):**

- [ ] Enter VPN username and password — "Credentials saved" confirmation shown
- [ ] Grep daemon logs for `[vpn] credentials saved` — confirm username is logged, password is NOT logged
- [ ] Open `config/vpn/credentials` on the NAS — confirm it contains `username\npassword\n` (gluetun format) with mode `0o600`
- [ ] Open `compose.synology.vpn.yml` — confirm credentials do NOT appear anywhere in the file

**Compose Artifact (P29.04 + P29.05):**

- [ ] Download `compose.synology.yml` from the browser — file downloads correctly; contains `gluetun` service and `ALLOWED_ORIGINS` env var for the web service
- [ ] Grep file — confirm no credential values appear

**Fresh Install with Gluetun Stack (P29.04 + P29.05):**

- [ ] Perform fresh install: wipe `config/` volume contents; create containers in order via DSM 7.1 Docker GUI — gluetun first (establishes bridge network), then transmission and pirate-claw containers attached
- [ ] All containers come up healthy in DSM Docker GUI
- [ ] Navigate to Pirate Claw — "VPN not configured" banner visible; queueing disabled
- [ ] Grep daemon logs for startup log lines in clean state (config load, trusted-origins load, auth state read)

**VPN Profile and Credentials (P29.04 + P29.05):**

- [ ] Navigate to Config → Downloader Network
- [ ] Upload a valid `.ovpn` profile — "Profile saved" confirmation shown
- [ ] Grep daemon logs for `[vpn] profile saved` — confirm size and compose regeneration logged
- [ ] Enter VPN username and password — "Credentials saved" confirmation shown
- [ ] Grep daemon logs for `[vpn] credentials saved` — confirm username is logged, password is NOT logged
- [ ] Open `config/vpn/credentials` on the NAS — confirm it contains `username\npassword\n` with mode `0o600`
- [ ] Open `compose.synology.yml` — confirm credentials do NOT appear anywhere in the file

**VPN Verification (P29.04 + P29.05):**

- [ ] Click "Verify VPN connection" — status badge shows `vpn_bridge_active`; "VPN not configured" banner gone; queueing enabled
- [ ] Grep daemon logs for `[vpn] verify` — confirm gluetun and Transmission both logged as `ok`

**Rollback (P29.04 + P29.05):**

- [ ] Clear credentials via UI — confirm page shows passthrough state; gluetun container remains running in DSM
- [ ] Click "Verify VPN connection" — status badge shows `passthrough` ("Gluetun running, no credentials configured")

**Fresh Install Validation:**

- [ ] Wipe pirate-claw state (remove `config/` volume contents); restart containers
- [ ] First visit → setup screen; complete owner setup
- [ ] Confirm session cookie issued; app shell accessible
- [ ] Confirm daemon emits startup log lines in a clean state (no stale state from prior runs)

**Session / Expiry:**

- [ ] Expired session (manually delete cookie) → silent redirect to `/login`

Commit when all items are checked: `chore(P29.06): ds918 exit validation — all items pass [green]`

## Refactor

- No code changes expected in this ticket
- If any item fails and requires a code fix, make the fix in a separate commit on this branch; document the fix in Rationale

## Review Focus

- All checklist items must be checked before this PR merges — no unchecked items with "deferred to P30" unless explicitly approved by the developer
- **Log grep results** — the review should confirm that the logs section items were actually grepped, not just assumed; paste the relevant log lines in Rationale
- **Credentials not in compose** — confirm you opened both artifacts and searched for the actual password value
- This is the last DSM 7.1 validation gate — the developer upgrades to DSM 7.2.1 after this ticket closes

## Rationale

> Append here (do not edit above) when behavior or trade-offs change during implementation.

Red first: no automated test; validation is gated by hardware access and P29.05 being merged
Why this path: physical device validation is required before the operator upgrades to DSM 7.2.1; automated tests cannot replicate DSM Docker GUI behavior or gluetun network topology
Alternative considered: combining validation with P29.07 docs ticket — rejected because a failed validation item should block the phase, not be buried in a docs PR
Deferred: [what was intentionally left out of this ticket]
Contract note: `Type: chore` is correct for a manual validation ticket with no code artifact as the primary deliverable
