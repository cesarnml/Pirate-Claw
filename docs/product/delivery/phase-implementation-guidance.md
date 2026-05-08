# Phase Implementation Guidance

This note defines the default stance for planning and delivering a phase. Use it when creating or revising a phase implementation plan, breaking a phase into tickets, or deciding whether a ticket is small enough to implement safely.

## Core Stance

New product phases and epics move through three required developer control points before any code is written:

1. **Ideation** — the developer shapes the phase goal through an explicit planning pass. Use `grill-me` to pressure-test scope and decomposition.
2. **Ticket approval** — the developer approves the decomposed ticket stack as thin, reviewable slices before implementation begins. This is the gate that keeps AI autonomy bounded by explicit human product intent.
3. **Slice review** — the developer reviews and approves each delivered PR before it advances or merges.

Between those control points, the agent runs autonomously through the bounded phase.

For implementation itself:

- build one small real behavior at a time
- keep each ticket end to end — it should touch the full vertical stack, not just a layer
- test what the user can observe through public interfaces, not internal structure
- avoid side quests; record useful refactors as follow-ups rather than widening the current ticket
- end multi-ticket product phases with a docs/phase-exit slice unless the phase is itself docs-only or there is a good reason not to

## Using `grill-me`

If a phase or ticket still feels vague, stop and pressure-test it before implementation. That is what `grill-me` is for.

Plan Mode can help structure the conversation but is not a required repo policy control point. The required control points are the planning pass, `grill-me` pressure-testing, and developer ticket approval — not the conversation mode label.

Enforce this proportionally. The planning gate applies to new product-scope expansion. Docs-only, cleanup-only, and tooling-only changes that do not expand the product surface can skip it.

Use `grill-me` to force clarity on:

- the real behavior being delivered
- the smallest acceptable slice
- key tradeoffs and decision points
- what should stay deferred

## Phase Closeout Decision

Before finalizing a phase plan, decide retrospective status explicitly.

Record:

- `Retrospective: required`
- `Retrospective: skip`
- `Why:` one sentence
- `Trigger:` `product-impact`, `architecture/process impact`, `durable-learning risk`, or `none`

Default:

- engineering epics: `required`
- product phases: `skip` unless the phase materially changes operator workflow, introduces a durable product/technical boundary, generates likely follow-up learning, or meaningfully changes later phase assumptions

## Implementation Plan Contract

Every new phase plan should include `## Phase Closeout`:

- whether a retrospective is `required` or `skip`
- where the artifact goes if required (`notes/public/<phase>-retrospective.md`)
- whether the final docs/phase-exit ticket must include retrospective writing in scope
