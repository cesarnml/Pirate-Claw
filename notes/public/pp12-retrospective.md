# P12 Retrospective

_Phase 12: Dashboard Design System and Read-Only UI — P12.01–P12.08_

---

## Scope delivered

Eight stacked PRs (`P12.01–P12.08`) delivering a design system migration (shadcn-svelte: Card, Table, Badge, Button, Alert) and full read-only UI across all routes: Candidates, Home, Shows list, Show detail, Movies, Config, and the docs exit ticket. Work in git worktrees per ticket, AI review polling with Greptile / CodeRabbit / SonarQube.

---

## What went well

- **Clear ticket boundaries.** Foundation → Candidates → Home → Shows → Show detail → Movies → Config → Docs gave a predictable order and kept each PR reviewable.
- **Consistent UI vocabulary.** Once shadcn primitives landed in P12.01–P12.02, later tickets composed the same patterns rather than inventing new styling. The design system investment paid off immediately within the phase.
- **Orchestrator as forcing function.** `post-verify-self-audit` and `open-pr` created a repeatable rhythm: verify locally, update ticket rationale, then publish. Reduced "forgot to document why" drift across 8 tickets.
- **Review artifacts were actionable.** Greptile inline comments on a11y and CSS safety mapped cleanly to targeted patches (`[a&]` hover selectors, `sr-only` table headers, https-only backdrop URLs, `aria-label` on badges). High signal-to-noise from the review pass.
- **Docs-only exit ticket skipped review window.** Matching the repo skill guidance — static analysis has nothing to find in markdown. Saved wall-clock time on the final ticket.
- **Colocated tests stayed stable.** `candidates.test.ts`, `dashboard.test.ts`, `shows.test.ts`, `movies.test.ts`, `config.test.ts` patterns required only markup and selector updates, not behavior rewrites, across the migration.

---

## Pain points

- **shadcn-svelte bootstrap friction.** Non-interactive `init` blocks on preset prompts in headless environments. The workaround (manual `components.json` + `bun x shadcn-svelte@latest add … -y`) works but is undiscoverable. Each operator reaches the same workaround independently.
- **Real wall-clock review waits across 8 tickets.** 6–10+ minutes per ticket × 8 tickets is a full session's worth of wall time. Necessary for the review gate, but the cumulative weight is real.
- **Orchestrator state vs disk vs GitHub drift.** `loadState` syncs ticket status from repo inference (merged branches → `done`). The on-disk `state.json` can lag what `deliver status` shows after sync. `poll-review` and `record-review` failed with confusing messages when PR state did not match inferred status. Mitigation: always run `deliver status` after sync; use `repair` or `reconcile-late-review` when diverged.
- **Worktrees not created automatically.** Later tickets had no worktree until `git worktree add -b …` from the parent branch tip. The plan lists worktree paths but `deliver` does not create them pre-emptively. Operators must know to do this before `deliver start`.
- **cspell vs docs.** "shadcn" in ticket rationale tripped spellcheck until `cspell.json` gained the word. A minor friction point that hits every code-heavy PR that introduces a new product name.

---

## Surprises

- **P12.04 "preserve server load if present" ambiguity.** The ticket said "preserve server load if present" but the route had no `+page.server.ts` yet. The ticket actually required a new load function for the Shows list route. This was only visible at implementation time — the ticket spec used language that implied no new API work when API work was in scope. Specs should be explicit: "add `+page.server.ts`" rather than "preserve if present."
- **shadcn-svelte Alert renders `role="status"`, not `role="alert"`.** The `default` variant of shadcn-svelte's Alert component uses `role="status"`. Tests using `getByRole('alert')` fail silently — they select nothing instead of throwing. This surfaced first as a phantom test failure and took investigation to isolate.

---

## What we'd do differently

- **Document the approved shadcn bootstrap path.** Manual `components.json` + `bun x shadcn-svelte@latest add … -y` is the known-working headless path for this repo. Add this to `docs/03-engineering/` or the phase handoff template so no one fights the interactive `init` again.
- **Specify new `+page.server.ts` files explicitly in ticket specs.** When a ticket introduces a new server load function, say so explicitly. "Preserve if present" implies conditional scope and creates ambiguity at implementation time.

---

## Net assessment

Phase 12 delivered a coherent design system migration across all dashboard routes. Strong reviewability (small stacked PRs), stable UI patterns, and actionable AI review feedback. Main friction was shadcn bootstrap tooling, real-time review wait accumulation across 8 tickets, and occasional orchestrator state drift requiring manual repair. The design system investment held across all downstream tickets — no late-phase pattern divergence.

---

## Follow-up

- **Document bootstrap path.** Add the manual `components.json` + add path to `docs/03-engineering/` or phase handoff template.
- **Orchestrator error messages.** When `record-review` fails because synced status is already `done`, emit a hint: "Ticket already complete per Git sync; use `deliver status`."
- **Review batching.** Where safe, batch trivial Greptile/CodeRabbit fixes across one follow-up commit to reduce push → poll cycles. Do not mix unrelated product concerns.
- **Ticket rationale + cspell pre-flight.** If a ticket doc mentions new product names, run `bun run spellcheck` before push or add words to `cspell.json` in the same PR.

---

_Created: 2026-04-08._
