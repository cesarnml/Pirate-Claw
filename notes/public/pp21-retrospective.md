# Phase 21 Retrospective

_Phase 21: Bootstrap Contract and Zero Hand-Edited Files — P21.01–P21.05_

---

## Scope delivered

Phase 21 shipped across stacked PRs [#195](https://github.com/cesarnml/Pirate-Claw/pull/195) through [#199](https://github.com/cesarnml/Pirate-Claw/pull/199) on branches `agents/p21-01-ensurestarterconfig-write-valid-starter-config-on-first-boot` through `agents/p21-05-phase-21-retrospective-and-doc-update`. Delivered scope: `ensureStarterConfig` first-boot starter config creation, `GET /api/setup/state`, starter-mode web UI integration via layout data, README/operator contract updates for first boot and Plex version prerequisites, and the phase closeout/doc update pass.

---

## What went well

**`ensureStarterConfig` stayed tightly scoped.** The function had one job, which made it straightforward to test in isolation and easy to call from the startup path without dragging config-validation concerns into unrelated modules.

**`GET /api/setup/state` was the right minimal contract.** The endpoint needed no DB queries or heavyweight runtime checks; reading the starter sentinel from config kept Phase 21 narrow and established a clean bootstrap signal for the UI.

**SvelteKit layout load was the right integration point.** Fetching setup state once per page load and exposing it through layout data gave every route access to the state without per-page duplication or polling complexity.

**The schema adjustment stayed surgical.** Allowing empty TV show arrays via the validator change solved the bootstrap requirement without widening the config contract more than necessary.

**Docs were easy once behavior was real.** The README/operator-contract work landed cleanly because the code path and first-boot behavior had already been made concrete by P21.01–P21.03.

---

## Pain points

**Layout-level type fallout was broader than expected (expected cost).** Adding `setupState` to `+layout.server.ts` triggered type errors across nine test files because their fixtures and `Pick<PageData, ...>` helpers all needed the new field. The fixes were mechanical, but the surface area was larger than the feature itself.

**Strict generated SvelteKit types amplified the fixture churn (expected cost).** The generated `LayoutData` typing is narrow enough that partial test helpers do not quietly absorb a new field; every typed fixture had to acknowledge `setupState` explicitly.

---

## Surprises

**Codex preflight on P21.03 found no issues.** That is worth recording because UI integration tickets often pick up edge-case fixes during review; this one was clean on first pass.

**The `_starter` sentinel carried more of the phase than expected.** A single raw-JSON field ended up being enough to anchor first-boot config creation, setup-state derivation, and the UI entry condition without any heavier persistence or migration mechanism.

---

## What we'd do differently

**Write the durable retrospective directly in `notes/public` instead of embedding it in the ticket doc.** The original choice was understandable because P21.05 was a doc-only closeout ticket, but the repo already has a clear retrospective convention. Keeping the learning artifact inline made it easier to miss during closeout and easier for future agents to overlook.

**Treat layout-data additions as cross-cutting test changes up front.** The original reasoning was that `setupState` was a small UI field addition. In practice, anything added to shared layout data should be assumed to touch a wide ring of typed fixtures and scheduled accordingly.

---

## Net assessment

Phase 21 achieved its goal. A fresh Pirate Claw install now creates a valid starter config on first boot, the browser can distinguish starter versus configured states without file editing, and the operator contract is documented clearly enough to support the Phase 22 onboarding flow. The phase also held its scope line: no live connectivity probing, no browser wizard, and no supervisor work leaked in early.

---

## Follow-up

- **Phase 22 onboarding flow:** reuse `data.setupState === 'starter'` as the entry condition for the browser setup experience.
- **Handle `partially_configured` as a real transition state:** once `_starter` is removed by the first operator write, the browser flow should guide the operator from partially configured to ready without assuming a fresh start.
- **Keep Plex compatibility as a browser concern only when it becomes actionable:** the README note is enough for P21; UI/runtime validation belongs in Phase 22 when the app can surface a useful recovery path.
- **Do not revisit P21 deferrals without a clear scope trigger:** corrupt config recovery and onboarding wizard belong to P22; launchd/Synology supervision belongs to P23.

---

_Created: 2026-04-22. PR stack #195–#199 open._
