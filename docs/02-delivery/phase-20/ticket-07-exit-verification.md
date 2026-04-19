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

| Endpoint                                           | Test                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| `POST /api/transmission/torrent/pause`             | Valid downloading hash → 200; non-downloading hash → 400                         |
| `POST /api/transmission/torrent/resume`            | Valid paused hash → 200; non-paused hash → 400                                   |
| `POST /api/transmission/torrent/remove`            | Downloading, paused, or completed candidate → 200, `removed` disposition written |
| `POST /api/transmission/torrent/remove-and-delete` | Any active candidate → 200, disposition = deleted                                |
| `POST /api/transmission/torrent/dispose`           | Missing candidate + valid disposition → 200; non-missing → 400                   |
| `POST /api/candidates/:id/requeue`                 | Failed candidate → 200, torrent fields written; non-eligible → 400               |

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

Write `notes/public/phase-20-retrospective.md` using `.agents/skills/write-retrospective/SKILL.md` (required sections: Scope delivered, What went well, Pain points, Surprises, What we'd do differently, Net assessment, Follow-up). Update the retrospective section of `docs/01-product/phase-20-dashboard-torrent-actions.md` to a pointer link to that file.

### 7. Doc updates

Each doc must reflect Phase 20 as delivered, not pending:

- **`README.md`**
  - Change "Phases 01–19 are implemented" → "Phases 01–20 are implemented" (operator intro paragraph and any summary line)
  - Add the six new torrent action endpoints to the API reference table (`POST /api/transmission/torrent/pause`, `resume`, `remove`, `remove-and-delete`, `POST /api/transmission/torrent/dispose`, `POST /api/candidates/:id/requeue`)
  - Update the "Implemented" / "Planned" summary paragraph: move torrent lifecycle actions and queue button from Planned/future to Implemented; update the Planned entry to whatever Phase 21 is

- **`docs/00-overview/start-here.md`**
  - Update "Current Repo State" and "Current delivered surface" to include Phase 20: torrent lifecycle actions via context menu (pause, resume, remove, remove+delete), missing-candidate disposition resolution, Queue button for manual requeue, and the `pirateClawDisposition` data model
  - Move Phase 20 from "next" to delivered; advance the active-phase pointer
  - Update "last verified" date

- **`docs/00-overview/roadmap.md`**
  - Mark Phase 20 (Dashboard Torrent Actions) as delivered; add PR stack reference (#181–#187)
  - Advance the active-phase pointer to Phase 21
  - Update "last verified" date

- **`docs/README.md`**
  - Add `phase-20-dashboard-torrent-actions.md` to the product-doc map if not already listed
  - Add `docs/02-delivery/phase-20/` directory entry if not already listed

## Exit Condition

All checks above pass. Phase 20 is closed.
