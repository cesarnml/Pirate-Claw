# P16 Retrospective

_Phase 16: Config Editing, Hot Reload, and Daemon Controls — P16.01–P16.09_

---

## Scope delivered

Phase 16 shipped across stacked PRs [#133](https://github.com/cesarnml/Pirate-Claw/pull/133) through [#141](https://github.com/cesarnml/Pirate-Claw/pull/141). Delivered scope: `POST /api/daemon/restart`, `POST /api/transmission/ping`, `tvDefaults` in `GET /api/config`, toast-based save feedback, Transmission card enhancements, TV defaults pre-population fix, runtime/TV-shows form split, collapsible config cards, read-only audit, and phase-exit docs/runbook updates. The product outcome landed: `/config` is now the unified editable surface the Phase 16 product doc described.

---

## What went well

- **API-first ordering held.** P16.01 established the missing daemon and Transmission endpoints plus the `tvDefaults` response shape before the UI tickets touched them. That kept the later web work mostly additive instead of reopening API contracts mid-phase.
- **The page-level UX payoff was real.** Toasts, section-local saves, restart affordance, and Transmission visibility combine into a much more coherent operator flow than the prior mixed-alert form. This phase had a clear “before/after” product outcome, not just incremental plumbing.
- **External AI review still found meaningful correctness issues.** The P16.07 payload-shape fix and the P16.08 dependency/accordion animation fixes were real catches, not process noise. The review loop paid for itself on this phase.
- **The handoff/state model was strong enough to recover from a session handoff.** Even after the prior Claude run hit the five-hour limit, the current ticket state, handoff artifacts, and review artifacts were enough to resume P16.08 and finish the phase without reconstructing context from chat.

---

## Pain points

- **Ticket boundary discipline drifted early.** P16.02 absorbed work that the plan had explicitly reserved for later card tickets, which made P16.04 almost ceremonial. This was avoidable waste: the phase outcome survived, but the review surface quality dropped.
- **Docs/state surfaces lagged the actual shipped state.** By P16.09, multiple repo docs still described Phase 16 as future work. That created unnecessary cleanup at phase exit and made `start-here.md` materially misleading during active delivery.
- **Worktree/doc topology is still awkward for ticketed docs work.** The Phase 16 implementation-plan doc was authoritative in the main checkout but missing from the ticket worktree branch state during P16.09. That forces extra caution on delivery-tooling and docs-exit tickets.
- **Docs-only review skip signaling was confusing in practice.** The policy existed, but `open-pr` still printed the generic review window for a docs-only PR, which made the operator experience look wrong even when `docOnly` state was present underneath.

---

## Surprises

- **P16.04 did not really stand on its own.** The RSS Feeds toast work was effectively pre-delivered in P16.02, leaving P16.04 with a one-line 409-guard cleanup. That is the clearest signal that the stack stopped being honest at the slice level even though the phase still shipped.
- **The PR-title regression was narrower than it looked.** Most of the stack used the correct Conventional-Commit-style PR titles, but P16.02 and P16.03 leaked bare ticket titles. That suggests a path or timing bug in title derivation/application, not a general repo-policy failure.
- **Docs-only policy clarity was not the problem.** The docs and skill guidance were already explicit that docs-only PRs skip external review. The mismatch was between policy and operator-facing output, not between policy and understanding.
- **The Synology runbook already had the right conceptual requirement but not the Phase 16 wording.** The runbook did not need a new operational concept, only a clearer daemon-supervisor statement tied directly to `POST /api/daemon/restart`.

---

## What we'd do differently

- **Keep cross-card infrastructure narrower in the earliest UI ticket.** P16.02 should have stopped at toaster plumbing, alert removal, and restart-offer infrastructure. Wiring every card’s toast callbacks there saved a little implementation time but weakened the stack’s reviewability.
- **Treat phase-exit docs as living state, not a final sweep.** `README.md`, `start-here.md`, `roadmap.md`, and `docs/README.md` should be updated incrementally when a phase materially changes the shipped surface, not only at the very end.
- **Harden delivery tooling around misleading-but-not-fatal states.** When policy says docs-only PRs skip the review window, the very first operator-facing message should say that. The same principle applies to PR-title generation: if upstream input is malformed, the orchestrator should degrade to a safe policy-compliant fallback rather than echoing bad input.

---

## Net assessment

Phase 16 achieved its stated product goal. The browser config surface is now meaningfully closer to “no SSH for day-to-day operation,” and the missing daemon-control and feedback pieces are in place. The main miss was not product scope; it was slice quality. The phase outcome is good, but the stack quality was uneven enough that it exposed two standalone delivery-tooling follow-ups immediately afterward.

---

## Follow-up

- **Standalone tooling fix:** make docs-only PRs advertise the skip path immediately in `open-pr` output rather than the generic 6/12-minute review window. Opened as [#142](https://github.com/cesarnml/Pirate-Claw/pull/142).
- **Standalone tooling fix:** enforce a Conventional-Commit fallback in PR-title generation so malformed upstream subjects cannot leak bare ticket titles into PRs. Opened as [#143](https://github.com/cesarnml/Pirate-Claw/pull/143).
- **Planning/process follow-up:** when a ticket is intentionally “infrastructure only,” restate the out-of-scope boundaries aggressively in the implementation prompt so the first implementation PR does not absorb adjacent ticket scope.
- **Delivery-state follow-up:** resolve why authoritative delivery-plan docs can be absent from the ticket worktree lineage during docs-exit tickets, because that adds unnecessary operator/tool friction at exactly the point where the phase should be simplest.

---

_Created: 2026-04-13. PR #141 open; follow-up tooling PRs #142 and #143 open._
