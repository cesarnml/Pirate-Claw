# P21.01 ensureStarterConfig: Write Valid Starter Config on First Boot

## Goal

Introduce `ensureStarterConfig(path)` so the system writes a valid starter config automatically when none exists, eliminating the need for the operator to create or copy any file before first boot.

## Scope

- Add `ensureStarterConfig(path: string): Promise<void>` in `src/bootstrap.ts`
- If the file at `path` does not exist, write a valid `AppConfig`-shaped JSON with:
  - `_starter: true` at the top level
  - `transmission.url`: `"http://localhost:9091/transmission/rpc"`
  - `transmission.username`: `"admin"`, `transmission.password`: `"admin"`
  - `plex.url`: `"http://localhost:32400"`, `plex.token`: `""`, `plex.refreshIntervalMinutes`: `30`
  - `movies.years`: `[currentYear - 1, currentYear]` (computed at write time via `new Date().getFullYear()`)
  - `movies.resolutions`: `["1080p"]`, `movies.codecs`: `["x264"]`, `movies.codecPolicy`: `"prefer"`
  - `tv`: compact format with empty shows: `{ "defaults": { "resolutions": ["1080p"], "codecs": ["x264"] }, "shows": [] }`
  - `feeds`: `[]`
  - `runtime`: omitted (defaults applied by `validateRuntime`)
- If the file already exists, do nothing
- Call `ensureStarterConfig(path)` in the daemon startup sequence and API startup sequence, before `loadConfig`
- Change `requireCompactTvShows` in `src/config.ts` to accept an empty array (currently throws on `length === 0`)
- Add unit tests covering: missing file (writes starter), existing file (no-op), written config passes `validateConfig` without modification, empty compact TV is valid

## Out Of Scope

- Setup state derivation (P21.02)
- Web UI changes (P21.03)
- Corrupt config recovery (P22)

## Exit Condition

A fresh install with no config file starts successfully, the config file is created with `_starter: true`, and the written JSON passes `validateConfig` unchanged. Empty compact TV `shows: []` is valid. An existing config file is never overwritten.

## Rationale

- `validateConfig` already ignores unknown top-level keys, so `_starter: true` passes through cleanly.
- Allowing empty `tv.shows` in compact format is the honest bootstrap contract: "you have no shows yet" is a truthful state. No placeholder data, no fake watched content. The validator change is minimal — one guard in `requireCompactTvShows`.
- Compact TV with empty shows gives the operator the correct defaults template without injecting fake domain data into their config.
- Both `ensureStarterConfig` and `getSetupState` (P21.02) live in `src/bootstrap.ts`, keeping `src/config.ts` as a pure load/validate module with no startup side-effects.
- Dummy Transmission credentials (`"admin"/"admin"`) are safe because `linuxserver/transmission` ships with auth disabled; these values work against auth-disabled Transmission and are operator-editable through the browser in P22.
- Dynamic movie years prevent a hardcoded 2026 config silently missing new releases in future installs.
