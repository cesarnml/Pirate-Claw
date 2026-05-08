# P29.03 VPN Config Types and File Path Helpers

Size: 2 points
Type: feat
Scope: daemon-vpn-schema

## Outcome

- `src/vpn-state.ts` exports all VPN config types, file path helpers, and manifest read/write helpers
- `NetworkPostureState` includes `vpn_bridge_active` alongside existing states
- `pirate-claw.config.json` `downloaderNetwork` block shape is defined and validated
- No HTTP surface in this ticket — types and file I/O only
- All new code is covered by unit tests; CI passes

## Red

- Write tests in `test/vpn-state.test.ts`:
  - `vpnDir(configDir)` returns the expected path
  - `activeProfilePath(configDir)` returns `<configDir>/vpn/active-profile.ovpn`
  - `credentialsPath(configDir)` returns `<configDir>/vpn/credentials`
  - `vpnManifestPath(configDir)` returns `<configDir>/vpn/manifest.json`
  - `readVpnManifest` returns `null` when the file does not exist
  - `writeVpnManifest` writes a valid manifest JSON and `readVpnManifest` reads it back
  - `validateDownloaderNetwork` rejects an object missing `mode`; accepts a valid `downloaderNetwork` block
- Run `bun run ci` and confirm all new tests fail (module does not exist yet)
- Commit: `test(P29.03): vpn-state types and file helpers [red]`

## Green

Create `src/vpn-state.ts`:

```ts
// File path helpers
export function vpnDir(configDir: string): string;
export function activeProfilePath(configDir: string): string; // <vpnDir>/active-profile.ovpn
export function credentialsPath(configDir: string): string; // <vpnDir>/credentials
export function vpnManifestPath(configDir: string): string; // <vpnDir>/manifest.json

// Manifest shape
export type VpnManifest = {
  uploadedAt: string; // ISO 8601
  provider: string; // e.g. "custom_openvpn"
  hasCredentials: boolean;
};

// Manifest I/O
export async function readVpnManifest(
  configDir: string,
): Promise<VpnManifest | null>;
export async function writeVpnManifest(
  configDir: string,
  manifest: VpnManifest,
): Promise<void>;

// downloaderNetwork config shape (non-secret posture only — no credentials)
export type DownloaderNetworkMode = 'direct' | 'vpn_bridge';
export type DownloaderNetworkStatus =
  | 'pending_apply'
  | 'verified'
  | 'unreachable';

export type DownloaderNetworkConfig = {
  mode: DownloaderNetworkMode;
  provider?: string; // e.g. "custom_openvpn"
  profile?: string; // e.g. "active"
  status?: DownloaderNetworkStatus;
};

// Validation
export function validateDownloaderNetwork(
  raw: unknown,
): DownloaderNetworkConfig; // throws ConfigError on invalid
```

- Extend `NetworkPostureState` in `src/auth-state.ts` to add `'vpn_bridge_active'` alongside existing states (or confirm it is already present — `vpn_bridge_pending` exists; `vpn_bridge_active` is the post-verify state)
- Add `downloaderNetwork?: DownloaderNetworkConfig` to `AppConfig` in `src/config.ts`; add validation in `validateConfig`
- Emit a structured log line in `writeVpnManifest`: `[vpn] manifest written — provider: <provider>, hasCredentials: <bool>`
- Commit: `feat(P29.03): vpn-state types and file path helpers [green]`

## Refactor

- Ensure path helpers follow the same pattern as existing helpers in `src/auth-state.ts` and `src/install-bootstrap.ts` (plain `join` calls, no path construction logic in tests)
- `validateDownloaderNetwork` should throw `ConfigError` (same class used in `src/config.ts`) for consistency

## Review Focus

- **No HTTP surface** — this ticket must not add any API endpoints; those are P29.04
- **`NetworkPostureState` extension** — verify `vpn_bridge_active` is additive and does not break existing `acknowledgeNetworkPosture` callers or tests
- **`AppConfig` extension** — `downloaderNetwork` is optional; existing configs without it must pass validation unchanged
- **Log line on manifest write** — must be present; this is the first observable artifact of VPN config being saved; P29.06 validation will grep for it
- Credential file content is a gluetun-format plain-text file (`username\npassword\n`) — the shape is not defined here (P29.04 owns the write), but the path helper must be consistent

## Rationale

> Append here (do not edit above) when behavior or trade-offs change during implementation.

Red first: [what test failed first]
Why this path: [why this implementation was the smallest acceptable]
Alternative considered: [one rejected alternative and why]
Deferred: [what was intentionally left out of this ticket]
Contract note: record any deviation from the ticket metadata contract here, including missing/incorrect `Type:` or non-compliant `Scope:` fields, and why it happened.
