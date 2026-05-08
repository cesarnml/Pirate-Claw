# P29.05 Downloader Network Web UI

Size: 3 points
Type: feat
Scope: web-vpn

## Outcome

- A persistent "VPN not configured" banner is shown on the dashboard when `downloaderNetwork.mode === 'passthrough'`; queueing is disabled until `vpn_bridge_active`
- The "Config → Downloader Network" page (standalone settings page, not wizard) presents the full VPN setup flow
- Owner can upload an `.ovpn` profile file — form action hits `POST /api/vpn/profile`
- Owner can enter VPN credentials (username + password) — form action hits `POST /api/vpn/credentials`
- Owner can download `compose.synology.yml` (single artifact, for DSM 7.2+ Container Manager Project apply reference)
- Apply instructions shown inline: DSM 7.1 individual container creation path (Docker GUI, gluetun first) and DSM 7.2+ Container Manager Project path
- Owner can click "Verify VPN connection" — action hits `POST /api/vpn/verify`; result badge shows `vpn_bridge_active`, `vpn_bridge_unreachable`, or `passthrough`
- "Try again" affordance shown when status is `vpn_bridge_unreachable`
- Owner can clear credentials (return to passthrough) — no compose teardown required; UI reflects passthrough state
- All existing web CI tests continue to pass; new tests cover the form actions and verify round-trip

## Red

Write tests in `web/test/routes/config/downloader-network.test.ts`:

- Profile upload form action: renders upload input; on submit with a valid file, calls the correct API endpoint
- Credentials form action: renders username + password inputs; on submit, calls `POST /api/vpn/credentials`
- "VPN not configured" banner: rendered on dashboard when `mode === 'passthrough'`; absent when `mode === 'vpn_bridge'` and status `verified`
- Compose download link: when `hasProfile: true`, download link rendered; when `hasProfile: false`, link is disabled with a clear message ("Upload a VPN profile first")
- Verify button: clicking it triggers `POST /api/vpn/verify`; `vpn_bridge_active` → active badge; `vpn_bridge_unreachable` → "Try again" affordance; `passthrough` → neutral "No credentials saved" message
- DSM 7.1 instructions block: individual container creation steps (gluetun first, then Transmission and pirate-claw attached)
- DSM 7.2+ instructions block: Container Manager Project apply steps

Run `bun run ci` from `web/` and confirm new tests fail. Commit: `test(P29.05): downloader-network web ui [red]`

## Green

**Route:** add a "Downloader Network" section to the existing `/config` page, or create `/config/downloader-network` as a new SvelteKit route — match the pattern used by other config sub-sections.

**Page server load (`+page.server.ts` or equivalent):**

- Call `GET /api/vpn/manifest` (or derive from existing `GET /api/auth/state` + VPN manifest read) to determine `hasProfile` and `hasCredentials`
- Call `GET /api/auth/state` for `network_posture` (to show direct-mode context)
- Emit: `[web] downloader-network load — hasProfile: <bool>, hasCredentials: <bool>, posture: <posture>`

**Profile upload form action:**

- `<input type="file" accept=".ovpn">` with a label
- On submit: `POST /api/vpn/profile` (multipart file body proxied to daemon)
- On success: show "Profile saved" confirmation + re-render compose download buttons as active
- On error: show the daemon error message

**Credentials form action:**

- `<input type="text" name="username">` and `<input type="password" name="password">`
- On submit: `POST /api/vpn/credentials`
- On success: show "Credentials saved" confirmation
- On error: show the daemon error message
- **Never echo the password back** to the page in any form value or error message

**Compose download button:**

- "Download Compose (`compose.synology.yml`)" → `GET /api/vpn/compose` with `download` attribute
- Disabled (with explanatory text: "Upload a VPN profile first") when `hasProfile` is false
- No rollback artifact download — rollback is clearing credentials in the UI

**Apply instructions:**

- DSM 7.1 block (static): individual container creation steps — pull gluetun image, create gluetun container (establishes bridge network), create/recreate Transmission container attached to gluetun network, create/recreate pirate-claw containers
- DSM 7.2+ block (static): Container Manager Project → Import/Update with `compose.synology.yml` — same as current project update flow
- Both blocks always visible

**Verify section:**

- "Verify VPN connection" button triggers `POST /api/vpn/verify` as a form action
- Status badge: `vpn_bridge_active` (green), `vpn_bridge_unreachable` (red + "Try again" button), `passthrough` (neutral — "No credentials saved")
- "Try again" re-submits the verify action
- Emit from form action: `[web] vpn-verify action — result: <status>`

**Clear credentials:**

- "Clear credentials" action — removes the credentials file, resets `downloaderNetwork.mode` to `passthrough`; gluetun stays in stack
- Confirm prompt before clearing

## Refactor

- Ensure the new route/section is consistent with the existing Config page layout (same card/section component, same heading style)
- If the credential form mirrors the pattern used in login (`/login`), reuse any shared password-field component rather than duplicating

## Review Focus

- **Password never echoes back** — assert in tests that the credentials form action does not set a `password` field value on error or redirect; this is a security requirement
- **"VPN not configured" banner** — must be present and prominent on the dashboard when `mode === 'passthrough'`; queueing must be visually disabled; this is the primary driver to the Downloader Network page
- **`hasProfile: false` state** — download button must be visually disabled and carry a message; an operator who has not yet uploaded a profile should not see broken download links or a misleading verify button
- **Debug logging coverage** — page load and verify form action must both emit structured log lines; these are the first thing to check in P29.06 hardware validation when something doesn't work
- **DSM 7.1 individual container creation steps** — must be accurate before P29.05 PR merges; the steps must match the DSM 7.1 Docker GUI flow confirmed in P29.01
- **Verify status persistence** — the verify status does not need to persist across page reloads at v1 (stateless button); confirm this is the intended behavior and note it as deferred if the developer wants persistence
- **`passthrough` status**: shown when `POST /api/vpn/verify` returns `passthrough` — this is not an error; display neutrally as "Gluetun running (no credentials configured)"

## Rationale

> Append here (do not edit above) when behavior or trade-offs change during implementation.

Red first: [what test failed first]
Why this path: [why this implementation was the smallest acceptable]
Alternative considered: [one rejected alternative and why]
Deferred: [what was intentionally left out of this ticket]
Contract note: record any deviation from the ticket metadata contract here, including missing/incorrect `Type:` or non-compliant `Scope:` fields, and why it happened.
