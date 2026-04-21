# Phase 22: Browser-Only Setup and Installer Flow

**Delivery status:** Complete. P22.01–P22.06 delivered. See [phase-22-retrospective.md](../../notes/public/phase-22-retrospective.md).

Phase 22 turns the Phase 21 bootstrap contract into a complete browser-only setup flow. The operator should be able to move from a valid starter state to a working daemon configuration entirely through the web UI.

## TL;DR

**Goal:** go from fresh install to working ingestion setup with no SSH and no hand-edited files.

**Ships:** onboarding and config flow rewritten around the new starter-state contract; dependency-ordered setup sequence; shared setup primitives between onboarding and `/config`; explicit readiness and restart-needed state; compatibility-vs-recommended-baseline setup language for Transmission; `movies` made optional in schema (absence = movies matching disabled); starter config cleaned up to omit phantom defaults.

**Defers:** Plex browser auth (P22.5), advanced target authoring, collector-shelf polish on Movies/Shows, broader UX refinement beyond the minimum working setup, bundled Transmission + VPN container provisioning (post-v1).

## Phase Goal

Phase 22 should leave Pirate Claw in a state where:

- a non-technical operator can finish first-run setup entirely from the browser
- onboarding no longer depends on a copied template or hidden installer knowledge
- the Config page and onboarding share the same underlying writable setup primitives
- Pirate Claw is truly ingestion-ready when onboarding says it is done
- the setup flow treats a compatible pre-existing Transmission instance as valid, even when it is not Pirate Claw's recommended bundled deployment profile

## Starter Config Contract (revised)

The starter config written by `ensureStarterConfig` must carry honest empty/absent state — no phantom defaults that look like operator choices:

- `feeds: []` — empty, operator must add at least one
- `tv.shows: []` — empty, operator must add at least one show (compact format with defaults block is fine)
- `movies` — **omitted entirely** (absence = movies matching disabled; operator adds the block explicitly)
- `tmdb` — **omitted entirely** (already optional, no change)
- `transmission` — placeholder credentials + default localhost URL (not a readiness signal)
- `plex` — placeholder URL + empty token, labeled legacy until P22.5 delivers browser auth

This aligns all target-type fields on a single principle: empty arrays and absent objects both mean "not yet configured." No field uses pre-filled defaults to simulate operator intent.

## Config Schema Changes Required

- `movies` becomes `movies?: MoviePolicy` in `AppConfig` (optional)
- Config loader (`validateConfig`) must accept absent `movies` block without throwing
- Ingestion pipeline skips movie matching when `movies` is absent
- `getSetupState` readiness condition updated (see Readiness Model below)

## Required Setup Sequence

Phase 22 should present setup in the order that actually matters operationally:

1. connectivity basics (Transmission endpoint + auth)
2. auth/secrets (write-access key)
3. media target directories
4. first feed (with `mediaType` declared)
5. first matching target rule (TV show or movies block, based on feed mediaType)
6. completion summary and handoff

The flow may combine adjacent steps if the ticket breakdown finds a cleaner boundary, but it must preserve this dependency order.

## Committed Scope

### Starter Config and Schema Fix

- omit `movies` from starter config; update schema to accept absent `movies`
- align `getSetupState` ready condition: feeds non-empty + each feed's `mediaType` has a corresponding configured target (tv feed → tv.shows non-empty; movie feed → movies present) + transmission URL is a valid non-empty string
- remove the `transmissionCustom` URL-comparison heuristic — URL non-default was a bad proxy for "operator touched this"
- corrupt/malformed config recovery: surface a clear `partially_configured` state and guide the operator to fix it through the browser

### Onboarding

- replace the old Phase 17 "add one feed and one target" wizard assumptions with a flow grounded in the Phase 21 starter contract
- onboarding must handle both `starter` and `partially_configured` installs cleanly
- each step saves incrementally through the same write path the normal Config page uses
- "Done" means Pirate Claw is actually capable of performing ingestion on its next run, not merely that some UI steps were completed

### Config and Secrets UX

- required first-run fields must be enterable in the browser
- no first-run requirement may remain ".env-only" if it blocks the operator from reaching a working setup
- the write-access key must be part of the browser-manageable setup story
- setup state and validation must be explicit enough that the operator can tell what is still blocking readiness
- browser-only setup means **no manual file manipulation by the operator for first-run essentials**

### Transmission Compatibility Contract

- Pirate Claw must distinguish **compatible Transmission endpoint** from **recommended deployment baseline**
- a reachable, authenticated Transmission RPC endpoint is sufficient to satisfy downloader compatibility, even if the operator already runs Transmission outside Pirate Claw's bundled profile
- onboarding/config should surface whether the configured downloader is:
  - `compatible` — reachable, authenticated, operator-managed
  - `compatible_custom` — reachable, authenticated, non-standard config
  - `recommended` — reachable, authenticated, matches bundled profile
  - `not_reachable` — connection failed
- a custom/operator-managed Transmission deployment may produce advisory warnings, but it must not be blocked solely because it is not Pirate Claw-managed
- downloader reachability is a **runtime readiness probe**, not a config-file check

### Bundled Downloader Setup

- the bundled Transmission + VPN container provisioning path is **out of scope for P22**
- P22 surfaces the `compatible / compatible_custom / recommended / not_reachable` status display only (reachability probe)
- actual container/compose generation and VPN topology wiring is deferred to a dedicated post-v1 bundling phase

### Readiness Model

Two separate layers:

**Config completeness** (`getSetupState` — pure file check):

- `starter` — `_starter: true` in config, or config file absent
- `partially_configured` — config exists, parses, but feeds/targets incomplete or corrupt
- `ready` — feeds non-empty + each feed's mediaType has a configured target block + transmission URL is a valid non-empty string

**Runtime readiness** (new probe, owned by P22.04):

- `not_ready` — maps to `starter | partially_configured`
- `ready_pending_restart` — config is `ready` but daemon has not picked up the latest write
- `ready` — daemon is live with current config

These two layers map cleanly: setup wizard drives config completeness; runtime readiness panel shows the live daemon state.

### Optional Plex Compatibility Contract

- Plex integration remains optional; manual token field stays in UI for now, clearly labeled as legacy
- setup UX validates PMS reachability separately from PMS version compatibility
- setup UX surfaces a clear advisory when Plex is installed but too old for the documented API contract (PMS `>= 1.43.0` for API `1.2.0`)
- browser-based Plex JWT auth (replacing manual token extraction) is **deferred to P22.5**

## Exit Condition

A fresh Pirate Claw install can be opened in the browser, configured end-to-end through onboarding/config flows, and left in an ingestion-ready state without the operator using SSH, `vim`, or manual file editing at any point.

## Explicit Deferrals

- Plex browser-based JWT authentication flow (P22.5)
- bundled Transmission + VPN container provisioning (post-v1)
- advanced feed/rule bulk management
- search-to-add flows powered by TMDB or Plex
- non-essential dashboard/UI polish on Movies/Shows
- multi-user or delegated-operator setup flows
- one-click installer packaging
- automatic provisioning or lifecycle management of a third-party pre-existing Transmission deployment
- automatic PMS upgrade/install orchestration beyond surfacing the compatibility contract and guidance

## Rationale

Phase 17 proved that guided setup and empty-state guidance are useful, but it stopped short of eliminating installer knowledge and manual file concerns. Phase 22 is the real product-completion setup phase: it closes the gap between "starter state exists" and "the operator can actually make Pirate Claw work without leaving the browser."

The `movies` schema change and starter config cleanup are prerequisites, not polish. The current starter config pre-fills movies with year/resolution/codec defaults that look like operator choices — they are not. A field that the operator never touched must not read as configured. Omitting `movies` from the starter config and making it optional in the schema gives movies the same honest empty signal as `tv.shows: []`.

The readiness model split (config completeness vs. runtime readiness) is intentional. `getSetupState` stays a pure file check — cheap, synchronous, no network calls. Runtime reachability probes live in a separate layer owned by the setup wizard. The `transmissionCustom` URL-comparison heuristic is removed because it was always wrong: a bundled deployment at the default URL would permanently report `partially_configured` even if fully working.

Plex browser auth is real scope but large enough to deserve its own phase. P22 delivers the browser-only setup claim for everything that does not require OAuth/PIN browser flows. P22.5 closes the Plex auth gap.
