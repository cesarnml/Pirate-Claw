# Phase 12 retrospective — dashboard design system & read-only UI

Retrospective artifact under `notes/public/`. Not product documentation.

## Context

Phase 12 was executed as a **ticketed stacked PR** delivery (`bun run deliver --plan docs/02-delivery/phase-12/implementation-plan.md`) across **P12.01–P12.08**, with work in **git worktrees** (`pirate_claw_p12_01` … `pirate_claw_p12_08`), AI review polling (`poll-review`), and periodic **Greptile / CodeRabbit / SonarQube** feedback driving follow-up commits.

---

## What went well

- **Clear ticket boundaries** — Foundations → Candidates → Home → Shows list → Show detail → Movies → Config → Docs exit gave a predictable order and kept PRs reviewable.
- **Consistent UI vocabulary** — Once shadcn primitives (Card, Table, Badge, Button, Alert) landed in P12.01–P12.02, later tickets mostly **composed** the same patterns instead of inventing new styling each time.
- **Orchestrator as forcing function** — `post-verify-self-audit` and `open-pr` created a repeatable rhythm: verify locally, update ticket rationale, then publish. That reduced “forgot to document why” drift.
- **Review artifacts were actionable** — Inline comments (especially Greptile on a11y and CSS safety) maps well to small, targeted patches (e.g. `[a&]` hover selectors, `sr-only` table headers, https-only backdrop URLs, `aria-label` on badges).
- **Docs-only exit ticket (P12.08)** — Skipping a long `poll-review` window for markdown-only changes matches the repo skill guidance and saved wall-clock time.
- **Tests stayed colocated** — `candidates.test.ts`, `dashboard.test.ts`, `shows.test.ts`, `movies.test.ts`, `config.test.ts` patterns remained stable enough that migrations were mostly **markup + selector** updates, not behavior rewrites.

---

## Pain points

- **shadcn-svelte bootstrap friction** — Non-interactive `init` could block on preset prompts; the stack fell back to **manual** `components.json` + `add … -y`. That works but is easy to get wrong for newcomers; docs should point to the “happy path” explicitly.
- **Long `poll-review` windows** — Real wall-clock waits (~6–10+ minutes per ticket) add up across eight tickets. Necessary for bot reviews, but painful for a single session.
- **Orchestrator state vs disk vs GitHub** — `loadState` **syncs** ticket status from repo inference (e.g. merged branches → `done`). The on-disk `state.json` snapshot could **lag** what `deliver status` shows after sync. Commands like `poll-review` / `record-review` occasionally failed with confusing messages when PR state or inferred status did not match expectations (e.g. “no in-review ticket with an open PR”). **Mitigation**: trust `deliver status` after sync; use `repair` / `reconcile-late-review` when GH and local state diverge.
- **Missing worktrees until branched** — Later tickets (e.g. P12.07) did not have a worktree until **`git worktree add -b …`** from the parent branch tip. The plan lists paths, but automation does not create them; the operator must know to add worktrees or rely on `deliver start` behavior when available.
- **Docker / full image builds** — Full `docker build` was heavy; ticket copy aligned with **P10.01-style** deferral (Vite/build proves Dockerfile stage) to avoid blocking verify loops.
- **Cspell vs docs** — Introducing “shadcn” in ticket rationale tripped spellcheck until **`cspell.json`** gained the word; easy fix but easy to miss on first doc edit in a code-heavy PR.

---

## How we can improve (process & repo)

1. **Phase handoff template** — Add a one-pager: “create worktree from base branch,” “run `bun install` in root + web if fresh,” “if `deliver poll-review` fails, check `deliver status` and PR open/merged state.”
2. **shadcn-svelte** — Document the approved bootstrap path for this repo (manual `components.json` + `bun x shadcn-svelte@latest add … -y`) so no one fights the interactive `init` in CI or headless environments.
3. **Review batching** — Where safe, batch trivial Greptile/CodeRabbit fixes across one follow-up commit to reduce push → poll cycles (without mixing unrelated product concerns).
4. **Orchestrator UX** — When `record-review` fails because synced status is already `done`, emit a hint: “Ticket already complete per Git sync; use `deliver status`.”
5. **Ticket rationale + cspell** — Pre-flight: if a ticket doc mentions product names (“shadcn”), run `bun run spellcheck` before push or add words to `cspell.json` in the same PR.
6. **Shows list data** — P12.04 added `+page.server.ts` where the route was previously placeholder-only; call out in planning that **new load functions** are in scope when the ticket says “preserve server load **if present**” — otherwise teams may assume “no server file” means “no API work.”

---

## Summary

Phase 12 delivered a **coherent design system migration** with strong **reviewability** (small stacked PRs) and **repeatable UI patterns**. The main costs were **time in review polling**, **tooling/setup edges** (shadcn init, worktrees), and **orchestrator state mental load** when GitHub and local state diverged. Investing in **documented bootstrap paths** and **clearer orchestrator messages** would reduce friction for Phase 13+.
