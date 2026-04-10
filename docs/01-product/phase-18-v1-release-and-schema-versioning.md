# Phase 18: v1.0.0 Release and Schema Versioning

**Delivery status:** Not started — product definition only; no `docs/02-delivery/phase-18/` implementation plan until tickets are approved.

Phase 18 is the formal v1.0.0 milestone. It stamps the config and database with versioning, establishes the breaking change policy, and cuts the first tagged release. No new features, no new API endpoints, no new auth enforcement — Phase 13 already delivered the security model.

## Phase Goal

Phase 18 should leave Pirate Claw in a state where:

- the running daemon, config file, and SQLite database are all stamped with a schema version that future operators and tooling can inspect
- the breaking change policy is documented: major version bump = new config/db schema pair; no cross-version migration path is guaranteed
- `package.json` version is `1.0.0` and a tagged release exists on the repository
- existing installs are not broken by any of the above — an unversioned config or DB from before Phase 18 is treated as v1 automatically

## Committed Scope

### Config file versioning

- `pirate-claw.config.json` gains an optional top-level `"schemaVersion": 1` field
- `loadConfig` in `src/config.ts`: if `schemaVersion` is absent, treat as v1 (no error, no warning); if present and greater than the current expected version, log a warning and refuse to start with a clear message ("config schema version N is not supported by this binary; upgrade pirate-claw or restore a compatible config")
- on every successful `PUT /api/config` write (any section), the current `schemaVersion` is stamped into the written file — operators who save via the UI get the stamp automatically; operators who only edit by hand do not need to add it manually

### Database schema versioning

- use SQLite `PRAGMA user_version` — built in, no extra table needed
- on first startup after Phase 18 ships: if `user_version` is `0` (the default for all existing DBs), set it to `1` — this is non-destructive and silent
- future breaking DB changes increment `user_version`; the startup check refuses to run if the DB version is ahead of what the binary knows
- the existing ad-hoc `ALTER TABLE ADD COLUMN` guards in `src/repository.ts` are preserved as the migration mechanism for non-breaking additive changes; `user_version` only changes on breaking schema changes

### Release

- `package.json` version bumped to `1.0.0`
- `web/package.json` version bumped to `1.0.0`
- tagged release on `main` with a CHANGELOG entry covering Phase 13–18 deliverables
- `VERSIONING.md` added to the repo root documenting the breaking change policy (see below)

### Breaking change policy (`VERSIONING.md`)

```
## Versioning Policy

Major version = config schema version + DB schema version shipped as a pair.

A new major version may change the shape of pirate-claw.config.json and/or
the SQLite database schema in ways that are not backward-compatible.

There is no guaranteed cross-version migration path. When upgrading across
a major version:

1. Export your show/movie targets and feed URLs from the dashboard Config page
   or directly from your config file.
2. Upgrade the binary.
3. The daemon will refuse to start if it detects a config or DB schema version
   mismatch. Follow the release notes for the upgrade path for that version.
4. Re-import your targets via the dashboard or by editing the new config format.

Within a major version, additive changes (new optional config fields, new DB
columns) are backward-compatible and do not require operator action.
```

## Explicit Deferrals

- automated migration tooling between major versions (manual re-import is the policy)
- audit logs, plugin or extension support (not in v1)
- new auth enforcement beyond what Phase 13 delivered (bearer token + localhost bind)
- any new user-visible features — Phase 18 is infrastructure and release only

## Exit Condition

The repo has a `v1.0.0` tag. A fresh install sees `"schemaVersion": 1` in the config after first write and `PRAGMA user_version = 1` in the DB. An operator upgrading from a pre-Phase-18 install sees no errors — the unversioned config is silently treated as v1, and the DB is silently stamped on first startup.

## Rationale

Config and DB schema are always shipped as a compatible pair with each major version. There is no strong incentive to support durable upgrades across major versions on a personal NAS tool — operators have full control of their install, data volumes are small, and re-import from the UI (Phase 14/16) is fast. The versioning system exists to make incompatibilities explicit and loud, not to automate migrations. A single PRAGMA integer and an optional config field accomplish this with minimal code.
