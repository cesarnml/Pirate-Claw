# Phase Implementation Guidance

This note defines the default stance for planning and delivering a phase.

Use it when:

- creating or revising a phase implementation plan
- breaking a phase into tickets
- deciding whether a ticket is small enough to implement safely

## Core Stance

- shape new product phases/epics in Plan Mode before implementation
- use `grill-me` to pressure-test scope and decomposition before accepting the plan
- treat developer approval of the decomposed ticket stack as required before implementation begins
- build one small real behavior at a time
- keep each ticket end to end
- test what the user can observe
- avoid side quests during implementation
- record cleanup ideas separately instead of mixing them into the ticket

## What This Means In Practice

- the developer stays directly engaged in three control points: ideation into concrete phase/epic goals, approval of the decomposed reviewable ticket stack, and final review/approval of delivered stacked PR slices
- after those control points are clear, the agent should be allowed to run autonomously through the bounded phase until blocked
- if those control points are missing for new product-scope expansion, the agent should pause, explain what is missing, and refuse to start implementation until the planning pass and decomposition approval exist
- prefer a thin slice that works through the real system over a broad foundation pass
- keep a ticket small enough to explain clearly in one review
- let tests prove behavior through public interfaces instead of locking onto internal structure
- when a useful refactor appears during feature work, capture it as a follow-up instead of widening the current ticket unless it is required to land safely

## Pressure-Test Fuzzy Plans

If a phase or ticket still feels vague, pressure-test it before implementation.

The default tool for that is the `grill-me` skill.

For new product feature-set expansion, this pressure test is not optional. Son-of-anton uses it to keep AI autonomy bounded by explicit human-approved product goals and reviewable ticket slices.

This should be enforced proportionally: pause and inform for new product-scope implementation when the control points are missing, but do not force the same ceremony on small docs-only, cleanup-only, or tooling-only follow-ups that do not expand the product surface.

Use it to force clarity on:

- the real behavior being delivered
- the smallest acceptable slice
- key tradeoffs and decision points
- what should stay deferred
