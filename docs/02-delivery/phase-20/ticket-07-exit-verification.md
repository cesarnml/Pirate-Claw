# P20.07 Docs + Exit Verification

## Goal

Verify Phase 20 is shippable. Confirm the data model clean break is complete, all endpoints work, the UI surfaces all actions correctly, and the phase retrospective is written.

## Depends On

P20.05 (context menu UI), P20.06 (queue button)

## Scope

### 1. Grep clean check

```sh
grep -r "lifecycleStatus\|CandidateLifecycleStatus" src/ web/src/
```

Must return zero matches.

### 2. DB migration smoke test

- Fresh DB: start daemon, verify `lifecycle_status` column absent, `pirate_claw_disposition` column present
- Pre-Phase-20 DB (with `lifecycle_status` column): start daemon, verify migration runs silently, no errors, column dropped

### 3. Endpoint smoke tests (manual)

| Endpoint                                           | Test                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `POST /api/transmission/torrent/pause`             | Valid downloading hash → 200; non-downloading hash → 400                                    |
| `POST /api/transmission/torrent/resume`            | Valid paused hash → 200; non-paused hash → 400                                              |
| `POST /api/transmission/torrent/remove`            | Downloading candidate → 200, disposition written; completed candidate → 200, no disposition |
| `POST /api/transmission/torrent/remove-and-delete` | Any active candidate → 200, disposition = deleted                                           |
| `POST /api/transmission/torrent/dispose`           | Missing candidate + valid disposition → 200; non-missing → 400                              |
| `POST /api/candidates/:id/requeue`                 | Failed candidate → 200, torrent fields written; non-eligible → 400                          |

### 4. UI verification

- Right-click on `downloading` row: Pause, Remove, Remove + Delete Data visible
- Right-click on `paused` row: Resume, Remove, Remove + Delete Data visible
- Right-click on `completed` row: Remove, Remove + Delete Data visible
- Missing candidates show Mark Removed / Mark Deleted inline buttons
- Queue button in FeedEventLogCard: in-flight, success, failure states all work

### 5. Typecheck

```sh
bun run typecheck
```

Must pass clean.

### 6. Retrospective

Fill in the retrospective section of `docs/01-product/phase-20-dashboard-torrent-actions.md`.

## Exit Condition

All checks above pass. Phase 20 is closed.
