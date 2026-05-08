# Phase 23: Plex Browser Auth and Credential Lifecycle

**Delivery status:** Not started — product definition only; no `docs/product/delivery/phase-23/` implementation plan until tickets are approved.

Phase 23 closes the last major manual setup gap left after Phase 22. An operator should be able to connect Plex from the browser using Plex's current recommended auth flow, persist the resulting device identity, and stay connected with best-effort silent renewal instead of being pushed back into manual token extraction.

## TL;DR

**Goal:** replace manual Plex token entry with browser-managed Plex auth that is durable enough for normal operator use.

**Ships:** browser redirect/PIN-based Plex auth flow; server-owned device identity and key material; persisted Plex credential in the existing `plex.token` field; setup/config UI for connect, connected, expired, and reconnect-needed states; best-effort silent renewal before expiry and on expiry recovery when stored device identity still works.

**Defers:** Plex server discovery/selection, multi-account switching, delegated-user flows, deep auth diagnostics, and hard guarantees around uninterrupted background renewal.

## Phase Goal

Phase 23 should leave Pirate Claw in a state where:

- the operator no longer needs to extract or paste a Plex token manually
- Plex can be connected from onboarding or `/config` using a browser-mediated Plex sign-in flow
- Pirate Claw persists enough device identity to attempt renewal without prompting the user every few days
- expired or failed Plex auth surfaces clearly in the browser with a one-click reconnect path
- the existing Plex enrichment surface keeps working without a new config schema for JWT-specific fields

## Product Stance

Phase 23 is not a full Plex account-management subsystem.

The requirement is narrower:

- replace the legacy manual token workflow with a browser-first operator flow
- make the auth state durable enough that normal operators are not forced into frequent reconnect friction
- keep failure states explicit when silent renewal does not succeed

That means Phase 23 includes best-effort silent renewal, but does **not** promise that every expiry can be recovered invisibly forever.

## Auth Contract

Phase 23 follows Plex's current recommended browser-oriented auth contract:

- Pirate Claw creates a server-side Plex auth session with a stable client/device identifier
- Pirate Claw sends the browser through Plex's hosted auth flow
- Plex returns the operator to Pirate Claw
- Pirate Claw exchanges the completed auth session for a Plex credential and stores it
- Pirate Claw uses the returned credential exactly as today's Plex integration uses `plex.token` in `X-Plex-Token`

The returned credential is stored in the existing `plex.token` field. Phase 23 does **not** introduce a parallel `plex.jwt` or versioned auth block.

## Persisted Identity Contract

Best-effort silent renewal requires more than the returned access token.

Phase 23 therefore adds a durable server-owned identity record that includes:

- a stable Plex client/device identifier
- the device key material or equivalent renewal identity required by the chosen Plex auth flow
- enough metadata to detect current connection state and last successful auth time

This identity is product state, not operator-authored config. It must not require the operator to hand-edit JSON or re-copy secrets between files.

## Committed Scope

### Browser Auth Flow

- add a server-owned Plex auth start endpoint that creates an auth session and redirect target
- add a browser return/callback path that finalizes the Plex auth session after Plex sign-in
- make the flow available from onboarding and `/config`
- support operator cancellation and expired auth-session recovery with clear retry guidance

### Plex Credential Persistence

- continue storing the current usable Plex credential in `plex.token`
- preserve the existing `plex.url` field as an explicit operator-managed PMS URL
- write auth results through the existing config-writing path rather than inventing a second Plex settings store

### Silent Renewal

- attempt renewal before or at credential expiry using stored device identity
- treat renewal as best-effort: success is silent; failure flips UI state to reconnect-needed
- never block the rest of Pirate Claw setup or runtime on renewal success
- if renewal cannot complete, keep the last failure visible and offer reconnect from the browser

### UI State Model

The browser should be able to show at least:

- `not_connected`
- `connecting`
- `connected`
- `renewing`
- `expired_reconnect_required`
- `error_reconnect_required`

These states are separate from Plex Media Server reachability or PMS version compatibility. Auth health and server compatibility are related but not the same thing.

### Setup Flow Placement

- onboarding gets a dedicated Plex step after write-access is available and before the final summary
- `/config` gets the same connect / reconnect / disconnect affordance and current auth-state display
- existing legacy manual token input is removed from the primary operator path once browser auth lands

## Exit Condition

An operator can connect Plex from the browser without manually extracting a token, Pirate Claw persists enough device identity to attempt silent credential renewal, and the UI clearly distinguishes connected, renewing, and reconnect-required states when auth changes over time.

## Explicit Deferrals

- Plex server discovery or server-picker UX after sign-in
- automatic PMS URL inference from the Plex account
- multi-account switching or "connect a different Plex account" management flows beyond reconnect
- guaranteed seamless renewal across every failure mode
- deep auth-debug views for raw Plex auth payloads, device keys, or callback traces
- using Plex auth state as an ingestion gate
- Synology restart/supervision guarantees for persisted auth state beyond what Phase 23 owns

## Rationale

Phase 22 proved that browser-only setup is viable everywhere except Plex auth. Leaving Plex on a legacy manual token path would preserve the sharpest edge in the setup story right after the rest of the product stopped requiring SSH or file editing.

At the same time, a pure "connect in browser, then reconnect manually every time the token expires" plan would knowingly reintroduce operator friction. The right middle ground is to keep the phase centered on browser auth while expanding it to include persisted device identity and best-effort silent renewal. That delivers a materially smoother operator experience without turning Phase 23 into a full-blown account-management platform.
