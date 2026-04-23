# P18.04 Docs, index updates, exit verification

## Goal

Close Phase 18: verify the full exit condition against the product doc, update
all overview and index documents to reflect delivered scope, and write the
required retrospective.

## Scope

- **Exit verification:** confirm that an operator with Plex configured sees
  `plexStatus: "in_library"` and non-null `watchCount` on library items;
  confirm that an operator without Plex configured sees `plexStatus: "unknown"`
  and `watchCount: null` with no errors; confirm daemon starts and refreshes
  without crashing when Plex is unreachable
- **`docs/00-overview/roadmap.md`:** mark Phase 18 delivered; update active
  phase pointer
- **`docs/00-overview/start-here.md`:** update delivered scope, commands, and
  status to reflect the new `plex` config block and enriched API fields
- **`README.md`:** update any user-visible feature list or command reference
  that Phase 18 changes
- **`docs/README.md`:** add Phase 18 plan and delivery doc paths to the index
- **Retrospective:** write `notes/public/phase-18-retrospective.md` per
  `.agents/skills/write-retrospective/SKILL.md`; cover the matching strategy
  decision, the pirate-claw-first refresh pattern, the "display-only in v1"
  constraint, and what would change if the Plex library grows or the tracked
  item count grows significantly

## Out Of Scope

- Any new behavior or bug fixes (those belong in a follow-up ticket or phase)
- Plex deferrals listed in the product doc

## Exit Condition

All Phase 18 overview docs reflect delivered state. `notes/public/phase-18-retrospective.md`
exists with the required sections. The phase is marked complete in the roadmap.

## Rationale

Retrospective is marked `required` in the implementation plan because Phase 18
introduces a durable optional external-service boundary with decisions (matching
strategy, cache TTL policy, pirate-claw-first refresh pattern, display-only v1
constraint) that future phases will revisit. Recording the learning now prevents
context loss before Phase 28 (v1 release) or any future media-library provider
expansion.
