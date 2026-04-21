# P22.01 Starter Config Cleanup and `movies` Optional Schema

## Goal

Remove the phantom `movies` defaults from the starter config and make `movies` optional in the `AppConfig` schema so all unconfigured target types carry an honest "not yet set" signal — absent objects for single-policy blocks, empty arrays for lists.

## Scope

### `src/config.ts`

- Change `movies: MoviePolicy` to `movies?: MoviePolicy` in `AppConfig`
- Update `validateConfig` to accept an absent `movies` key without throwing (`requireRecord` → optional read)
- Add `validateOptionalMoviePolicy` (mirrors `validateOptionalTmdb` pattern) — returns `undefined` when key absent, validates shape when present

### `src/bootstrap.ts`

- Remove the `movies` block from the object written by `ensureStarterConfig`
- No other changes to `ensureStarterConfig`

### `src/pipeline.ts`

- Guard the movie-match path: when `config.movies` is `undefined`, skip movie item matching entirely (return no-match or skip, consistent with how absent TV shows behaves)

### Tests

- `test/bootstrap.test.ts`: assert written starter config has no `movies` key
- `test/config.test.ts`: add case — config without `movies` key passes `validateConfig`; `config.movies` is `undefined`
- `test/pipeline.test.ts`: add case — pipeline does not throw when `config.movies` is absent; movie items are skipped

## Out Of Scope

- `getSetupState` readiness condition update (P22.02)
- UI changes (P22.03+)

## Exit Condition

`ensureStarterConfig` writes no `movies` key. A config file without `movies` passes `validateConfig`. The pipeline skips movie matching when `config.movies` is `undefined`. All existing tests remain green.

## Rationale

The starter config previously pre-filled `movies` with year/resolution/codec defaults. Those values were computed at install time, not chosen by the operator — but they looked like valid config to the validator and to any UI that reads the config. Omitting `movies` entirely gives it the same honest empty signal as `tv.shows: []`: the operator hasn't configured this yet. Making it optional in the schema is the minimum change required; the pipeline guard is a direct consequence.
