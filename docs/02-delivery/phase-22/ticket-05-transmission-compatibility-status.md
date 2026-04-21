# P22.05 Transmission Compatibility Status Display

## Goal

Surface a `compatible | compatible_custom | recommended | not_reachable` compatibility status for the configured Transmission endpoint so the operator knows whether their downloader satisfies the Pirate Claw contract, without blocking a custom deployment.

## Scope

### API

Extend `GET /api/setup/readiness` (P22.04) or add `GET /api/setup/transmission/status`:

Response shape:

```ts
{
  compatibility: 'recommended' | 'compatible' | 'compatible_custom' | 'not_reachable';
  url: string;
  reachable: boolean;
  advisory?: string;
}
```

Classification logic (probe-only, no provisioning):

- `not_reachable` — RPC ping failed or timed out
- `recommended` — reachable + URL matches known bundled profile default (`http://localhost:9091/transmission/rpc` or configured bundled URL)
- `compatible` — reachable + authenticated + non-bundled URL, standard port
- `compatible_custom` — reachable + authenticated + non-standard config (non-default port, non-standard RPC path, etc.)

A custom/operator-managed deployment at `compatible` or `compatible_custom` is **not blocked**. Advisory text is surfaced but setup continues.

### Web (`web/src/`)

- Transmission step in the setup wizard (P22.03) shows the compatibility badge after the reachability ping
- `/config` Transmission section shows the same badge
- `not_reachable` shows a warning; `compatible_custom` shows an advisory note; `compatible` and `recommended` show a green confirmation

## Out Of Scope

- Container provisioning or VPN topology wiring (post-v1)
- Automatic Transmission configuration changes

## Exit Condition

The compatibility status badge renders correctly in the wizard and on `/config` for all four states. A custom operator-managed Transmission at a non-default URL shows `compatible` or `compatible_custom` and is not blocked. `not_reachable` shows a warning but does not prevent the operator from saving the config.

## Rationale

Pirate Claw's recommended deployment is bundled Transmission + VPN, but many operators run their own Transmission. The compatibility display makes the distinction explicit without gatekeeping. An operator who knowingly runs a custom setup should see an advisory, not a hard error. The four-state vocabulary (`recommended | compatible | compatible_custom | not_reachable`) gives the UI enough signal to communicate nuance without requiring the backend to know anything about how Transmission was deployed.
