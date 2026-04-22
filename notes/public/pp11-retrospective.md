# P11 Retrospective

_Phase 11: TMDB Metadata Enrichment — P11.01–P11.06_

---

## Scope delivered

Six stacked PRs across the TMDB enrichment stack. All six slices reached `done`; the PR stack (PRs #94–#99) was open pending developer closeout review at the time of writing.

| PR                                                     | Branch → base              | Title                                                  |
| ------------------------------------------------------ | -------------------------- | ------------------------------------------------------ |
| [#94](https://github.com/cesarnml/Pirate-Claw/pull/94) | `agents/p11-01-…` → `main` | Foundation: TMDB config, client, SQLite cache [P11.01] |
| [#95](https://github.com/cesarnml/Pirate-Claw/pull/95) | `p11-02` → `p11-01`        | Movies vertical slice [P11.02]                         |
| [#96](https://github.com/cesarnml/Pirate-Claw/pull/96) | `p11-03` → `p11-02`        | TV lazy enrich, `/api/shows`, show UI [P11.03]         |
| [#97](https://github.com/cesarnml/Pirate-Claw/pull/97) | `p11-04` → `p11-03`        | `GET /api/candidates` TMDB cache attach [P11.04]       |
| [#98](https://github.com/cesarnml/Pirate-Claw/pull/98) | `p11-05` → `p11-04`        | Background TMDB refresh scheduler [P11.05]             |
| [#99](https://github.com/cesarnml/Pirate-Claw/pull/99) | `p11-06` → `p11-05`        | Docs, roadmap, README exit alignment [P11.06]          |

Merge strategy: `bun run closeout-stack --plan docs/02-delivery/phase-11/implementation-plan.md` after developer approval.

---

## What went well

- **Thin vertical slices matched the plan.** Foundation → movies → TV → candidates → background scheduler → docs followed the grill-me ordering (lazy-first enrichment, scheduler late, split SQLite tables). The implementation plan's decomposition table was followed in practice.
- **Durable artifacts worked as a session bridge.** Ticket files with `## Rationale`, delivery state, handoffs, and review artifacts made it possible to resume without relying on chat memory.
- **Verification stayed in the loop.** `bun run verify`, tests, format, and spellcheck ran before every push; pre-push hooks reinforced the same bar.
- **External review was triaged, not worshipped.** Bot findings (CodeRabbit, Greptile) were addressed when concrete — JSDoc vs `validateRuntime` correction, removing erroneous `apiPort` gating on TMDB deps, TypeScript narrowing for refresh interval. Summary and issue noise was not treated as actionable.
- **Product deferrals stayed stable.** Rating gates, search-to-add, UI config editing, and similar items stayed out of scope per the product doc and plan throughout the phase.

---

## Pain points

- **Ask-mode block mid-run.** A mode switch to ask mode prevented applying patches until the session switched back to agent mode — wasted a turn and duplicated intent. Orchestrated delivery runs should stay in agent mode.
- **Transient TLS failure on `advance`.** `advance` failed once with a connection reset during PR body update; retry succeeded. Long-running flows must tolerate occasional network flakes without treating them as logic errors.
- **`RuntimeConfig` optional fields after `validateRuntime`.** Some fields remain typed as optional after `validateRuntime` always sets them, requiring non-null assertions or awkward narrowing. A small recurring cost on every daemon scheduling ticket.
- **`needs_patch` cycle adds a full loop.** P11.05 landed in `needs_patch` until follow-up commits. The patch → push → `record-review` → `advance` loop is correct but adds wall-clock time when it occurs.

---

## Surprises

- **The stack remained unmerged at retrospective time.** Implementation and orchestrator state reached "stack complete" with all six tickets `done`, but the third son-of-anton control point (developer review and closeout) is a separate gate. This is correct per the ethos — automation does not merge to `main` — but it means the retrospective describes work that was complete from the orchestrator's perspective but not yet visible on `main`.

---

## What we'd do differently

- **Keep agent mode explicit before starting orchestrated delivery.** Verify the session is in agent mode before invoking any `deliver` command. A mode check at the start of a phase run is cheap; discovering the block mid-patch cycle is not.
- **Retry policy for `advance` on network flake.** Document "retry `advance` once on transient GraphQL/TLS error" so operators don't interpret a single network failure as a logic error in orchestrator state.
- **Validated-runtime type.** Post-validation code should not need `!` on fields `validateRuntime` always fills. A narrow return type from `loadConfig` or a `ValidatedRuntimeConfig` type alias would eliminate the recurring narrowing cost.

---

## Net assessment

Phase 11 executed the son-of-anton shape well: bounded execution, durable docs, explicit ticket boundaries, review gates at every PR. The ethos is fully satisfied only after the developer completes the third control point (review and closeout). All five son-of-anton themes held — slices over monoliths, review gates, explicit advancement, durable artifacts, planning control points. The model differences between sessions (if any) were contained by the handoff system.

---

## Follow-up

- **Agent mode check** at the start of orchestrated delivery runs (per phase handoff template).
- **Retry policy documentation** for transient `advance` failures (one retry on GraphQL/TLS errors).
- **`ValidatedRuntimeConfig` type** — narrow return type from `loadConfig` post-validation. Phase 13+ engineering scope.
- **Stack health display** — a final-ticket handoff that shows all PR numbers and bases at a glance (`gh pr list --json number,headRefName,baseRefName,state`).

---

_Created: 2026-04-08._
