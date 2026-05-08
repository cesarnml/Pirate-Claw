# Phase 28 Retrospective — Owner Web Security

## JWT vs. Opaque Session

We chose opaque sessions over JWTs. The primary driver was simplicity: Pirate Claw is a single-owner, single-device app with no need for stateless token delegation, third-party API consumers, or cross-service auth. JWTs add complexity (key rotation, clock skew, revocation) for no gain at this scale.

The chosen approach: BLAKE3-generated random token stored as a session row in SQLite (`owner_sessions`), with the hash of the token written to disk (argon2id). A matching `pc_session` cookie on the browser side. Session lookup is a single DB read per request. Revocation is a row delete. No key material in the config file.

For v1 this is the right call. If P29 introduces machine-to-machine API calls that need to be signed independently of a browser session, JWT or HMAC-signed tokens become a reasonable follow-up, but that case doesn't exist yet.

## Trust-On-First-Visit Design

The trusted-origins system was designed for the Tailscale use case: the operator owns both addresses (LAN and Tailscale IP), both are private, and the friction of acknowledging each one once is acceptable. The first visit from a new origin shows a banner with one click to persist.

What the design does well: it's explicit. There's no silent auto-trust. Operators know which addresses have been cleared.

What P29 planning should revisit: trusted-origins.json and SvelteKit's CSRF protection (`ORIGIN` env var) are separate systems. CSRF is pinned to a single origin at container start. Form-submission flows from a secondary trusted origin (e.g. the Tailscale address when `ORIGIN` is the LAN address) will fail CSRF validation even after the origin is trusted at the app level. The P28 scope stopped at documenting this gap. P29 should either wire `allowedOrigins` from `trusted-origins.json` dynamically, or accept and document secondary-address-as-read-only-with-JSON-fetch-only semantics.

## Direct-Mode Acknowledgement

The direct-mode acknowledgement banner is a Phase 29 placeholder. Its job in P28 is to make the default operational state explicit to the operator: Transmission traffic is not routed through a VPN. Acknowledging it persists a row in SQLite and clears the banner.

It intentionally does not enforce anything. It's informational only. The banner will return if the daemon detects VPN status changes in the future (P29 scope).

P29 planning should revisit: what constitutes "direct mode" in the context of the OpenVPN bridge? If P29 makes VPN-backed Transmission the default for the bundled stack, the acknowledgement logic should flip — the banner should appear when VPN is absent, not just when VPN has never been configured.

## Validation Findings to Carry Into P29

**isStarter layout guard and /setup interaction:** The P28.04 fix excluded `/setup` and `/login` from the `isStarter` splash. This was not in the original design. P29 should assume the auth-page exclusion list may grow and consider whether the routing logic should be config-driven rather than hard-coded.

**GET /logout route:** P28 shipped with `/logout` having only a form action and no `load` function. Direct URL navigation returned 500. Fixed during P28.04 validation. P29 should treat any auth-flow route as requiring both a `load` function and a form action.

**Plex PIN callback redirect:** When Plex auth completes and the PIN callback returns, the browser is sent to `/login` instead of `/onboarding`. The redirect target is wrong. Deferred to P29. Root cause is the callback URL not preserving the originating flow context.

**CSRF/allowedOrigins gap:** Documented above under Trust-On-First-Visit. This is the most significant open design question for P29.

**Fresh install validation:** The full "delete everything, re-install from zip, create owner account, complete onboarding" path was validated on DS918+ / DSM 7.1.1-42962 Update 9 during P28.04. `daemon-api-write-token` and `session-secret` were generated fresh on startup. Owner setup flow worked after the `isStarter` layout guard fix.

## What P29 Planning Should Assume

- Owner auth is the stable baseline. P29 does not need to re-litigate session storage or credential design.
- Trusted origins exist in SQLite and are consulted at request time. P29 can read from them to wire `allowedOrigins` without redesigning the storage layer.
- Direct-mode acknowledgement is in SQLite (`direct_mode_ack` table). P29 can extend the logic without migrating the schema.
- The SvelteKit CSRF gap is real and known. P29 must decide whether to address it (dynamic `allowedOrigins`) or accept the constraint (document secondary addresses as partial-access only).
- Plex PIN callback redirect needs a fix before the P28 auth layer and Plex onboarding flow can coexist cleanly.
