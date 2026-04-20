# P21.01 ensureStarterConfig: Write Valid Starter Config on First Boot

## Goal

Introduce `ensureStarterConfig(path)` so the system writes a valid starter config automatically when none exists, eliminating the need for the operator to create or copy any file before first boot.

## Scope

- Add `ensureStarterConfig(path: string): Promise<void>` in `src/config.ts` (or a new `src/bootstrap.ts` — whichever keeps `config.ts` cohesive)
- If the file at `path` does not exist, write a valid `AppConfig`-shaped JSON with:
  - `_starter: true` at the top level
  - `transmission.url`: `"http://localhost:9091/transmission/rpc"`
  - `transmission.username`: `"admin"`, `transmission.password`: `"admin"`
  - `plex.url`: `"http://localhost:32400"`, `plex.token`: `""`, `plex.refreshIntervalMinutes`: `30`
  - `movies.years`: `[currentYear - 1, currentYear]` (computed at write time via `new Date().getFullYear()`)
  - `movies.resolutions`: `["1080p"]`, `movies.codecs`: `["x264"]`, `movies.codecPolicy`: `"prefer"`
  - `tv`: `[]`
  - `feeds`: `[]`
  - `runtime`: omitted (defaults applied by `validateRuntime`)
- If the file already exists, do nothing
- Call `ensureStarterConfig(path)` in the daemon startup sequence and API startup sequence, before `loadConfig`
- Add unit tests covering: missing file (writes starter), existing file (no-op), written config passes `validateConfig` without modification

## Out Of Scope

- Any change to `validateConfig` — it must remain unmodified
- Setup state derivation (P21.02)
- Web UI changes (P21.03)
- Corrupt config recovery (P22)

## Exit Condition

A fresh install with no config file starts successfully, the config file is created with `_starter: true`, and the written JSON passes `validateConfig` unchanged. An existing config file is never overwritten.

## Rationale

- `validateConfig` already ignores unknown top-level keys, so `_starter: true` passes through cleanly with zero validator changes.
- Dummy Transmission credentials (`"admin"/"admin"`) are safe because `linuxserver/transmission` ships with auth disabled; these values work against auth-disabled Transmission and are operator-editable through the browser in P22.
- Dynamic movie years prevent a hardcoded 2026 config silently missing new releases in future installs.
- Keeping write ownership in the startup caller (not inside `loadConfig`) preserves `loadConfig` as a pure load-and-validate function with no side effects.
