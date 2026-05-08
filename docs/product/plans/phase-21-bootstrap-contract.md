# Phase 21: Bootstrap Contract and Zero Hand-Edited Files

**Delivery status:** Not started — product definition only; no `docs/product/delivery/phase-21/` implementation plan until tickets are approved.

Phase 21 replaces the old bootstrap assumption from Phase 17. The operator should never have to create, copy, or hand-edit `pirate-claw.config.json` or `.env` to get Pirate Claw into a valid first-run state.

## TL;DR

**Goal:** a fresh install can reach a valid Pirate Claw starter state without the operator touching files by hand.

**Ships:** explicit starter-config contract; first-run detection; automatic starter config creation by the system; bootstrap-safe daemon/API/web behavior for `starter`, `partially configured`, and `ready` states.

**Defers:** browser-only setup flow polish; Synology supervision/restart completion; advanced setup beyond the minimum viable contract.

## Phase Goal

Phase 21 should leave Pirate Claw in a state where:

- the operator never has to create or edit config or env files manually to begin setup
- the system can create a valid starter config automatically on first boot or first setup entry
- daemon and web code treat bootstrap as an explicit product state instead of assuming a copied template already exists
- the UI can distinguish `starter`, `partially configured`, and `ready` states cleanly

## Product Stance

The product requirement is **not** "the daemon must run forever without any config file existing."

The requirement is:

- the operator must never be the bootstrap mechanism
- the system must create the initial valid config state

An automatically generated starter config is acceptable and preferred if it preserves the operator promise while minimizing architectural churn.

## Minimum Setup Contract

Phase 21 establishes the minimum fields Pirate Claw must be able to bootstrap safely:

- Transmission RPC URL
- Plex Media Server URL
- default runtime config

Everything else may remain incomplete at starter-state time and be filled in later by onboarding/config flows:

- first RSS feed
- first matching target rule
- Transmission username/password
- target directories for `movie` and `tv`
- write-access key

## Committed Scope

### Bootstrap State Model

Pirate Claw should model setup state explicitly:

- `starter`: config exists only at the system-generated baseline; product is not ingestion-ready
- `partially_configured`: operator has filled some required fields, but Pirate Claw is not yet ingestion-ready
- `ready`: minimum working setup is complete and daemon can ingest normally

### Daemon and Config Contract

- define a valid starter config shape the system can write automatically
- remove the assumption that the operator copied `pirate-claw.config.example.json` manually
- support first-run detection when config is missing or still equivalent to starter state
- keep the current config validation path authoritative; starter generation must produce a config that passes validation or a deliberately recognized starter-safe variant
- preserve the current file-backed config architecture rather than introducing an entirely separate ephemeral setup store

### API and Web Contract

- API reads must remain available in bootstrap mode so the web app can render setup state
- bootstrap mode must not pretend the system is healthy/ready when required setup is still missing
- config and onboarding surfaces must consume a shared setup-state signal rather than re-deriving "empty install" from ad hoc field checks

## Exit Condition

A fresh install can be started by the system without the operator touching config or env files manually, and the browser can load a meaningful setup state that clearly shows Pirate Claw is in starter mode rather than fully configured.

## Explicit Deferrals

- redesigned browser onboarding sequence
- write-token UX beyond what is required to bootstrap the starter state
- Synology restart/supervision behavior
- one-click package installers or NAS marketplace packaging
- replacing file-backed config with a database-backed settings model

## Rationale

Phase 17 improved onboarding, but its bootstrap contract was still operator-driven: copy a starter config, then begin setup. That is good enough for an internal tool and not good enough for the product goal now in view: "simple little admin, never touch a file with vim/ssh; we got you." Phase 21 turns that requirement into an explicit system contract before any UI flow tries to build on top of it.
