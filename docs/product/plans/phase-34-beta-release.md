# Phase 34: Beta Release

**Delivery status:** Not started — product definition only; no `docs/product/delivery/phase-34/` implementation plan until tickets are approved.

Phase 34 is a named beta release milestone between the polish pass (Phase 33) and the v1 ceremony (Phase 35). It resolves integration gaps and regressions from Phases 28–33, cuts a tagged beta, and gives the product a public checkpoint before v1 is stamped.

## TL;DR

**Goal:** ship a tagged beta that is stable enough for real-world use, resolves cross-phase integration debt from Phases 28–33, and gives the roadmap an honest checkpoint before v1.

**Ships:** tagged beta release, resolved integration gaps from Phases 28–33, and any regression fixes needed for the beta to be credibly usable.

**Defers:** new functionality, new install paths, new enrichment sources, v1 schema versioning and release ceremony (Phase 35).

## Phase Goal

Phase 34 should leave Pirate Claw in a state where:

- no known reliability regressions from Phases 28–33 remain open
- the Phase 28 security layer, Phase 29 VPN bridge, Phase 30 Mac install, Phase 31 DSM 7.2.1 install, Phase 32 enrichment chain, and Phase 33 polish work correctly together across both supported platforms
- a tagged beta release exists on the repository that a real operator could install and use
- Phase 35 v1 ceremony begins from a stable, battle-tested baseline — not from an untested integration point

## Committed Scope

_Scope is derived from the actual state of the product after Phase 33 ships._

This phase must not be pre-loaded with speculative work. If Phases 28–33 land cleanly, Phase 34 may be short — primarily the beta tag and any minor integration fixes. It is a checkpoint, not a feature phase.

Minimum committed scope:

- tagged beta release on `main`
- any blocking integration issues across the two supported install platforms resolved
- beta CHANGELOG entry

## Explicit Deferrals

- new features or install paths
- v1 schema versioning, VERSIONING.md, and `1.0.0` package bump (Phase 35)
- v1 release ceremony (Phase 35)

## Exit Condition

A tagged beta release exists. Both the Mac and Synology install paths are stable and correct with owner security, VPN bridge, and enrichment enabled. Phase 35 v1 ceremony can proceed from this baseline without known reliability blockers.

## Rationale

Shipping a beta before v1 gives the roadmap an honest integration checkpoint. The stabilization concern is real — four new install surfaces, a security layer, a VPN bridge, and enrichment expansion across two platforms will produce some integration surface — but naming it "beta release" rather than just "stabilization" means it ships something concrete: a tagged, usable baseline that people can actually run before the v1 stamp lands.
