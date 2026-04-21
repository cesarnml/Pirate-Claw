# Phase 22: Browser-Only Setup and Installer Flow

**Delivery status:** Not started — product definition only; no `docs/02-delivery/phase-22/` implementation plan until tickets are approved.

Phase 22 turns the Phase 21 bootstrap contract into a complete browser-only setup flow. The operator should be able to move from a valid starter state to a working daemon configuration entirely through the web UI.

## TL;DR

**Goal:** go from fresh install to working ingestion setup with no SSH and no hand-edited files.

**Ships:** onboarding and config flow rewritten around the new starter-state contract; dependency-ordered setup sequence; shared setup primitives between onboarding and `/config`; explicit readiness and restart-needed state; compatibility-vs-recommended-baseline setup language for Transmission; explicit optional Plex compatibility contract; browser-managed Plex authentication; bundled-Transmission VPN setup as a first-run choice.

**Defers:** advanced target authoring, collector-shelf polish on Movies/Shows, and broader UX refinement beyond the minimum working setup.

## Phase Goal

Phase 22 should leave Pirate Claw in a state where:

- a non-technical operator can finish first-run setup entirely from the browser
- onboarding no longer depends on a copied template or hidden installer knowledge
- the Config page and onboarding share the same underlying writable setup primitives
- Pirate Claw is truly ingestion-ready when onboarding says it is done
- the setup flow treats a compatible pre-existing Transmission instance as valid, even when it is not Pirate Claw's recommended bundled deployment
- optional Plex integration is explicit about the minimum supported PMS version instead of being implied by stale NAS package defaults
- Plex auth no longer depends on the operator manually inspecting XML or browser developer tools to extract an `X-Plex-Token`
- if the operator chooses Pirate Claw's bundled Transmission path, the required VPN/downloader network choice is captured during onboarding rather than left as a hand-edited deployment detail

## Required Setup Sequence

Phase 22 should present setup in the order that actually matters operationally:

1. connectivity basics
2. auth/secrets
3. media target directories
4. first feed
5. first matching target rule
6. completion summary and handoff

The flow may combine adjacent steps if the ticket breakdown finds a cleaner boundary, but it must preserve this dependency order.

## Committed Scope

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
- any authentication token required for optional first-run integrations must be obtainable through a supported browser/API flow, not by asking the operator to inspect raw XML/JSON payloads by hand

### Transmission Compatibility Contract

- Pirate Claw must distinguish **compatible Transmission endpoint** from **recommended deployment baseline**
- a reachable, authenticated Transmission RPC endpoint is sufficient to satisfy downloader compatibility, even if the operator already runs Transmission outside Pirate Claw's bundled VPN-wrapped container profile
- the bundled Transmission + VPN deployment remains the recommended default, but it is not the only valid setup path
- when the operator chooses the bundled Transmission path, onboarding/config must collect the VPN/downloader topology choices needed to make that path real
- onboarding/config should surface whether the configured downloader is:
  - `compatible`
  - `compatible_custom`
  - `recommended`
  - `not_reachable`
- a custom/operator-managed Transmission deployment may produce advisory warnings, but it must not be blocked solely because it is not Pirate Claw-managed

### Bundled Downloader Setup

- if Pirate Claw offers a bundled Transmission client, the accompanying VPN/network bridge requirements are part of product setup, not hidden deployer knowledge
- onboarding should make the bundled-vs-custom downloader choice explicit
- choosing the bundled downloader path should surface the required VPN layer and network relationship as first-class setup inputs
- the operator should not need to hand-edit container/network files to complete the bundled downloader path promised by the browser-only setup contract

### Optional Plex Compatibility Contract

- Plex integration remains optional for setup completion unless a later ticket explicitly promotes it to a first-run requirement
- when Plex integration is enabled, Pirate Claw should treat the **current published Plex Media Server API `1.2.0`** as the compatibility target
- the official Plex developer docs state PMS API `1.2.0` is supported in **Plex Media Server `>= 1.43.0`**
- Plex's official developer docs now recommend **JWT authentication** for new apps
- setup UX should validate PMS reachability separately from PMS version compatibility
- setup UX should surface a clear advisory when Plex is installed but too old for the documented API contract
- the product should not imply that a NAS vendor's package-center default is sufficient if it ships an older PMS than the API contract requires
- the product should stop relying on the operator manually eyeballing an `X-Plex-Token` out of Plex Media Server metadata responses
- browser-only setup should use Plex's supported authentication flow so Pirate Claw can obtain the token it needs without requiring raw file edits or manual token extraction

### Plex Authentication Contract

- Phase 22 should replace manual token-copy instructions with Plex's supported browser/API authentication flow
- Pirate Claw may still use `X-Plex-Token` when talking to PMS, but the operator should not have to discover that token manually
- the preferred path is Plex's documented JWT-based authentication model for new apps, followed by the normal PMS resource discovery/token handoff
- if a temporary compatibility fallback remains during migration, it should be clearly labeled as legacy and not treated as the long-term browser-only setup story

### Readiness Model

- the UI should show one of: `not_ready`, `ready_pending_restart`, or `ready`
- onboarding should hand off to the normal UI only when the system reaches a true working state
- resumed onboarding and normal config editing must converge on the same readiness logic
- downloader compatibility is a blocking readiness condition; bundled-vs-custom downloader topology is not
- optional Plex version mismatch is an advisory readiness signal unless the operator explicitly enables Plex-dependent features that require the documented PMS API contract
- manual operator token extraction for Plex is not an acceptable "ready" path for a browser-only setup claim

## Exit Condition

A fresh Pirate Claw install can be opened in the browser, configured end-to-end through onboarding/config flows, and left in an ingestion-ready state without the operator using SSH, `vim`, or manual file editing at any point.

## Explicit Deferrals

- advanced feed/rule bulk management
- search-to-add flows powered by TMDB or Plex
- non-essential dashboard/UI polish on Movies/Shows
- multi-user or delegated-operator setup flows
- one-click installer packaging
- automatic provisioning or lifecycle management of a third-party pre-existing Transmission deployment
- automatic PMS upgrade/install orchestration beyond surfacing the compatibility contract and guidance

## Rationale

Phase 17 proved that guided setup and empty-state guidance are useful, but it stopped short of eliminating installer knowledge and manual file concerns. Phase 22 is the real product-completion setup phase: it closes the gap between "starter state exists" and "the operator can actually make Pirate Claw work without leaving the browser."

It also needs to close a product-truth gap: a reference deployment is not the same thing as the compatibility contract. Pirate Claw may recommend its bundled Transmission + VPN path, but setup should still honestly accept a valid pre-existing Transmission client. The same principle applies to Plex. If Pirate Claw claims Plex compatibility against the published PMS API, it must say which PMS versions satisfy that contract and it must not silently rely on stale NAS package-center defaults.

To truly earn the "browser-only setup" claim, the operator must not be asked to bridge the last mile by hand. Manual Plex token extraction from server metadata is still manual setup, just with extra steps. Likewise, a bundled downloader story that still requires hidden VPN/network hand-editing is not a complete onboarding path.
