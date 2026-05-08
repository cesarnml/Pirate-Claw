# P19.08 Docs, index updates, exit verification

## Goal

Update all operator-facing and internal docs to reflect the delivered Phase 19
scope, verify the phase exit condition is met end to end, and write the required
retrospective.

## Scope

- **`README.md`:** update the dashboard description to reflect the new sidebar
  navigation, Obsidian Tide visual language, consolidated 4-route structure, and
  surfaced movie backdrops / Plex chips
- **`docs/overview/start-here.md`:**
  - Update "Current Repo State" to reflect Phase 19 as delivered
  - Remove `/candidates` and `/candidates/unmatched` from the described
    dashboard surface
  - Add the new visual and navigation surface to "Current delivered surface"
  - Move Phase 19 from "next phase" to delivered; update "Phase 20 and beyond"
    deferrals as needed
- **`docs/overview/roadmap.md`:** mark Phase 19 delivered; update active
  phase pointer
- **`docs/README.md`:** add the Phase 19 product doc and delivery doc directory
  to the doc map if not already listed
- **Exit verification:** confirm the phase exit condition from the product doc
  is met:
  - Obsidian Tide visual language applied across all routes
  - Left sidebar functional on desktop and mobile
  - Candidates and Unmatched no longer top-level routes; data present in
    Dashboard
  - Movie backdrops render on Movies grid
  - Plex chips appear on TV Shows, TV Show Detail, and Movies when Phase 18
    is configured
  - All existing read and write functionality continues to work
- **`notes/public/phase-19-retrospective.md`:** write the retrospective using
  `.agents/skills/write-retrospective/SKILL.md`

## Out Of Scope

- Any code changes — this ticket is docs and verification only

## Exit Condition

All listed docs are updated and accurate. The retrospective is committed to
`notes/public/phase-19-retrospective.md`. The phase exit condition from the
product doc is confirmed met.

## Rationale

Standard docs/exit ticket per phase-implementation-guidance. Retrospective is
`required` for Phase 19: the sidebar structure, view consolidation, and design
token system are durable decisions that will constrain future phases.
