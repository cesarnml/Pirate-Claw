# P29.05 Downloader Network Web UI

Size: 3 points
Type: feat
Scope: web-vpn

## Outcome

- The "Config → Downloader Network" section (or a new `/config/downloader-network` route) presents the full VPN setup flow
- Owner can upload an `.ovpn` profile file — form action hits `POST /api/vpn/profile`
- Owner can enter VPN credentials (username + password) — form action hits `POST /api/vpn/credentials`
- Owner can download the VPN Compose artifact (`compose.synology.vpn.yml`) and the rollback artifact (`compose.synology.direct.yml`)
- Apply instructions are shown inline: DSM 7.1 path (per P29.01 findings) and DSM 7.2+ Container Manager Project path
- Owner can click "Verify VPN connection" — action hits `POST /api/vpn/verify`; result badge shows `vpn_bridge_active`, `vpn_bridge_unreachable`, or `direct_mode`
- "Try again" affordance shown when status is `vpn_bridge_unreachable`
- Direct-mode acknowledgement state (P28 baseline) is preserved and visible
- All existing web CI tests continue to pass; new tests cover the form actions and verify round-trip

## Red

Write tests in `web/test/routes/config/downloader-network.test.ts`:

- Profile upload form action: renders upload input; on submit with a valid file, calls the correct API endpoint
- Credentials form action: renders username + password inputs; on submit, calls `POST /api/vpn/credentials`
- Compose download links: when VPN manifest exists (`hasProfile: true`), both download links are rendered; when `hasProfile: false`, download links show a disabled/unavailable state with a clear message
- Verify button: clicking it triggers `POST /api/vpn/verify`; a `vpn_bridge_active` response renders the active status badge; a `vpn_bridge_unreachable` response renders the "Try again" affordance
- DSM 7.1 instructions block is present in the page output (content depends on P29.01 findings — use a placeholder string in the test)

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

**Compose download buttons:**

- "Download VPN Compose" → `GET /api/vpn/compose/vpn` with `download` attribute
- "Download Rollback Compose" → `GET /api/vpn/compose/direct` with `download` attribute
- Both disabled (with explanatory text: "Upload a VPN profile first") when `hasProfile` is false

**Apply instructions:**

- DSM 7.1 block: conditional on `dsm71ApplyFeasible` flag (set from P29.01 findings). If GUI-feasible: step-by-step GUI instructions. If SSH-fallback: SSH commands block with a "DSM 7.1 requires manual apply" heading
- DSM 7.2+ block: Container Manager Project → Import/Update steps (static content)
- Both blocks are always visible so the operator can compare paths

**Verify section:**

- "Verify VPN connection" button triggers `POST /api/vpn/verify` as a form action
- Status badge: `vpn_bridge_active` (green), `vpn_bridge_unreachable` (red + "Try again" button), `direct_mode` (neutral)
- "Try again" re-submits the verify action
- Emit from form action: `[web] vpn-verify action — result: <status>`

## Refactor

- Ensure the new route/section is consistent with the existing Config page layout (same card/section component, same heading style)
- If the credential form mirrors the pattern used in login (`/login`), reuse any shared password-field component rather than duplicating

## Review Focus

- **Password never echoes back** — assert in tests that the credentials form action does not set a `password` field value on error or redirect; this is a security requirement
- **`hasProfile: false` state** — download buttons must be visually disabled and carry a message; an operator who has not yet uploaded a profile should not see broken download links or a misleading verify button
- **Debug logging coverage** — page load and verify form action must both emit structured log lines; these are the first thing to check in P29.06 hardware validation when something doesn't work
- **DSM 7.1 / DSM 7.2+ instructions** — both blocks must be present and accurate per P29.01 findings before P29.05 PR is merged; the P29.01 ticket must be closed first
- **Verify status persistence** — the verify status does not need to persist across page reloads at v1 (stateless button); confirm this is the intended behavior and note it as deferred if the developer wants persistence
- **`direct_mode` status**: shown when `POST /api/vpn/verify` returns `direct_mode` — this is not an error; display it neutrally as "Bundled Transmission: Direct (VPN bridge not configured)"

## Rationale

> Append here (do not edit above) when behavior or trade-offs change during implementation.

Red first: [what test failed first]
Why this path: [why this implementation was the smallest acceptable]
Alternative considered: [one rejected alternative and why]
Deferred: [what was intentionally left out of this ticket]
Contract note: record any deviation from the ticket metadata contract here, including missing/incorrect `Type:` or non-compliant `Scope:` fields, and why it happened.
