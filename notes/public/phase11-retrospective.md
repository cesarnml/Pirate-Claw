# Phase 11 retrospective — TMDB metadata enrichment

**Date:** 2026-04-08  
**Scope:** Delivery stack P11.01–P11.06 (`docs/02-delivery/phase-11/implementation-plan.md`), product contract `docs/01-product/phase-11-tmdb-metadata-enrichment.md`.

## Open PR inspection (Phase 11 stack)

As of the retrospective write-up, **all six Phase 11 slices remain open** on GitHub, in ticket order, stacked on the previous branch (none merged to `main` yet):

| PR                                                     | Branch → base              | Title (abbrev.)                                        |
| ------------------------------------------------------ | -------------------------- | ------------------------------------------------------ |
| [#94](https://github.com/cesarnml/pirate_claw/pull/94) | `agents/p11-01-…` → `main` | Foundation: TMDB config, client, SQLite cache [P11.01] |
| [#95](https://github.com/cesarnml/pirate_claw/pull/95) | `p11-02` → `p11-01`        | Movies vertical slice [P11.02]                         |
| [#96](https://github.com/cesarnml/pirate_claw/pull/96) | `p11-03` → `p11-02`        | TV lazy enrich, `/api/shows`, show UI [P11.03]         |
| [#97](https://github.com/cesarnml/pirate_claw/pull/97) | `p11-04` → `p11-03`        | `GET /api/candidates` TMDB cache attach [P11.04]       |
| [#98](https://github.com/cesarnml/pirate_claw/pull/98) | `p11-05` → `p11-04`        | Background TMDB refresh scheduler [P11.05]             |
| [#99](https://github.com/cesarnml/pirate_claw/pull/99) | `p11-06` → `p11-05`        | Docs, roadmap, README exit alignment [P11.06]          |

**Implication:** Implementation and orchestrator state reached “stack complete,” but **the third Son-of-Anton control point** (final human review and merge of delivered slices) is **still in front of the developer**. Merge strategy remains `bun run closeout-stack --plan docs/02-delivery/phase-11/implementation-plan.md` after approval (per `AGENTS.md` and orchestrator docs).

---

## What went well

- **Thin vertical slices matched the plan.** The hybrid ordering (foundation → movies → TV → candidates → background scheduler → docs) kept each PR focused and reviewable; the implementation plan’s grill-me table (lazy-first enrichment, scheduler late, split SQLite tables) was followed in practice.
- **Durable artifacts worked as a session bridge.** Ticket files with `## Rationale`, `.agents/delivery/phase-11/state.json`, handoffs, and review JSON/text under `.agents/delivery/phase-11/reviews/` made it possible to resume without relying on chat memory.
- **Verification stayed in the loop.** `bun run verify`, tests, format, and spellcheck were run before pushes; pre-push hooks reinforced the same bar.
- **External review was triaged, not worshipped.** Bot findings (CodeRabbit, Greptile) were addressed when concrete (e.g. P11.05: JSDoc vs `validateRuntime`, removing erroneous `apiPort` gating on TMDB deps, TS narrowing for refresh interval); summary/issue noise was not treated as the review.
- **Product deferrals stayed stable.** Rating gates, search-to-add, UI config editing, and similar items stayed out of scope per the product doc and plan.

---

## Pain points encountered

- **Environment / workflow friction.** A mid-run **ask mode** block prevented applying patches until the session was switched back to agent mode — wasted a turn and duplicated intent.
- **Orchestrator / GitHub brittleness.** **`advance` failed once** with a transient TLS/connection reset while updating a PR body; retry succeeded. Long-running flows should expect occasional network failures.
- **Type system vs validation reality.** `RuntimeConfig` still types some fields optional after `validateRuntime` always sets them, forcing **non-null assertions** or awkward narrowing (seen on P11.05 daemon scheduling). This is a small recurring tax.
- **`needs_patch` review state.** P11.05 landed in `needs_patch` until follow-up commits; that is correct, but it adds another loop: patch → push → `record-review` → `advance`. Worth expecting one full cycle per slice when bots disagree with the first cut.
- **Stack not on `main` yet.** Docs and behavior on the default branch remain behind the stacked branches until **closeout**; contributors reading only `main` may think Phase 11 is still “planning only” until merge.

---

## How we can improve next time

1. **Keep agent mode explicit** for orchestrated multi-ticket runs so mechanical edits are never blocked by mode.
2. **Consider a validated-runtime type** (or narrow return type from `loadConfig`) so post-validation code does not need `!` on fields `validateRuntime` always fills.
3. **Retry policy:** document or script “retry `advance` once on GraphQL/network flake” so operators do not interpret a single failure as a logic error.
4. **After closeout:** update `main`-visible docs in one place if any drift remains between stack tip and default branch.
5. **Optional:** add a short **“stack health”** check (e.g. `gh pr list` or dashboard) in the handoff for the final ticket so the developer sees all six PRs and bases at a glance.

---

## Delivery vs `docs/03-engineering/son-of-anton.md`

The doctrine file promises: **slice-based work**, **review gates**, **explicit advance**, **durable context**, **planning pass + grill-me for product expansion**, and **three developer control points** (ideation, approved decomposition, final slice approval).

| Theme                                                       | How Phase 11 measured up                                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Slices over monoliths**                                   | Strong. Six PRs followed the ticket order; each mapped to a vertical or foundation slice.                                                                    |
| **Review gates**                                            | Strong at the AI/CI layer (verify, bots); **human merge gate is pending** — all PRs still open.                                                              |
| **Explicit advancement**                                    | Strong. Orchestrator `advance`, `record-review`, and state transitions made progression auditable.                                                           |
| **Durable artifacts**                                       | Strong. Plans, tickets, rationale, handoffs, and review artifacts — aligned with “answer not only in chat.”                                                  |
| **Planning + grill-me**                                     | Reflected in the implementation plan’s decomposition table; not optional ceremony for this phase.                                                            |
| **Human owns direction and merge**                          | Preserved: automation did not merge to `main`; closeout remains a developer step.                                                                            |
| **“I delivered this with AI help” vs “hoped it was right”** | **Partially realized until merge.** The workflow supports defensible delivery; **final proof is still the ordered review and `closeout-stack` onto `main`.** |

**Bottom line:** Phase 11 **executed the Son-of-Anton shape well** (bounded execution, durable docs, explicit ticket boundaries). The ethos is **fully satisfied only after** the developer completes the third control point and the stack lands on `main`.

---

## Product promise vs plan

- **Exit condition** in the product doc (posters, ratings, show metadata, graceful degrade) was **tracked in P11.06** with an explicit checklist in the ticket rationale and README/roadmap/start-here updates.
- **Deferrals** were not silently expanded; background refresh was placed after read paths per plan.

---

## References

- Product: `docs/01-product/phase-11-tmdb-metadata-enrichment.md`
- Plan: `docs/02-delivery/phase-11/implementation-plan.md`
- Ethos: `docs/03-engineering/son-of-anton.md`
- Orchestrator: `docs/03-engineering/delivery-orchestrator.md`
