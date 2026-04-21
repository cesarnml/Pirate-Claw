# Phase 22 Retrospective

_Phase 22: Browser-Only Setup and Installer Flow — P22.01–P22.06_

---

## Scope delivered

Phase 22 shipped across stacked PRs [#200](https://github.com/cesarnml/Pirate-Claw/pull/200) through [#204](https://github.com/cesarnml/Pirate-Claw/pull/204) on branches `agents/p22-01-starter-config-cleanup-and-movies-optional-schema` through `agents/p22-05-transmission-compatibility-status-display` (plus this doc-only P22.06 close-out).

Delivered scope:
- **P22.01** — `movies` made optional in `AppConfig`. `validateOptionalMoviePolicy` added. `_starter` configs no longer include a `movies` block. Backend + tests updated.
- **P22.02** — `getSetupState` readiness condition rewritten: URL equality replaced with media-type-aware target checking. Six new test cases covering all branches.
- **P22.03** — Dependency-ordered 6-step setup wizard in the onboarding page (Transmission → Write key → Media dirs → Feed → Target → Summary). `PUT /api/config/transmission/download-dirs` added. Summary step gates "Go to Dashboard" on `setupState`.
- **P22.04** — `GET /api/setup/readiness` endpoint: `{ state, configState, transmissionReachable, daemonLive }`. Layout switched from `setup/state` to `setup/readiness`. New `ready_pending_restart` banner: "Restart daemon to apply config changes." Summary step polls readiness client-side.
- **P22.05** — `GET /api/setup/transmission/status`: classifies configured Transmission as `recommended | compatible | compatible_custom | not_reachable`. `TransmissionCompatibilityBadge` shown after connection test in the wizard and on `/config`.

---

## Decisions that shifted during delivery

**`movies` optional schema (P22.01).** The original plan treated `movies` as a permanent optional addition. The implementation correctly added `validateOptionalMoviePolicy` mirroring `validateOptionalTmdb`, and removed the movies block from `ensureStarterConfig`. The `delete base.movies` pattern (vs. destructuring with an underscore prefix) was forced by ESLint's `no-unused-vars` rule — a minor constraint with a clean workaround.

**Readiness condition was URL-equality before P22.02.** The old check (`transmission.url === DEFAULT_TRANSMISSION_URL`) incorrectly treated any non-default URL as not-ready. The P22.02 fix replaced it with the correct logic: feeds non-empty + transmission URL set + per-media-type target present. This was the most important correctness fix in the phase — the old behavior would have broken custom-URL deployments silently.

**`ready_pending_restart` added as an intermediate state (P22.04).** The original P22.03 summary step gated "Go to Dashboard" on `setupState === 'ready'` (config file check only). P22.04 added the runtime readiness layer: `state` in the readiness response is `ready_pending_restart` when config is complete but Transmission is unreachable. This is the right model — config completeness and runtime liveness are orthogonal, and the operator needs to know both.

**Polling approach for summary step.** The summary step uses `$effect` + `setInterval` (3s) to poll `GET /api/setup/readiness` until `state === 'ready'`. A simpler alternative (SSE or WebSocket) was out of scope. The polling interval is short enough to feel responsive and long enough to not be noisy. The `$effect` cleanup handles the interval teardown correctly.

**`Body is unusable: Body has already been read` — twice.** Both the onboarding load (`Promise.all` for config + setup/state) and the config `testConnection` action (`Promise.all` for ping + status) hit this error because `mockResolvedValue` returns the same `Response` object instance for all calls. The fix in both cases was `mockImplementation` with URL routing to return a fresh `Response` per call. This is now an established pattern in this codebase for any server action that calls multiple API endpoints in parallel.

---

## What P22.5 (Plex browser auth) and post-v1 bundling need to know

**The `readinessState` field is already plumbed through the layout.** `+layout.server.ts` fetches `/api/setup/readiness` and returns both `setupState` (from `configState`) and `readinessState`. Any new page or banner can consume `data.readinessState` without additional layout changes.

**The onboarding wizard step system is additive.** Steps are shown/hidden via `$derived` flags in `+page.svelte`. Adding a Plex step (e.g., between media dirs and feeds) means adding a `showPlexStep` derived flag and a corresponding `{:else if}` block. The existing steps do not need to be renumbered — the step labels are hardcoded strings, not computed from an index.

**`TransmissionCompatibilityBadge` is a standalone component.** It takes `compatibility: TransmissionCompatibility` and optional `advisory: string`. It can be dropped into any context that surfaces transmission status.

**`classifyTransmissionUrl` is exported from `src/api.ts`.** Tests can import it directly. The classification is purely URL-based (no network call) — the network result (`reachable: boolean`) is passed in.

**The `_starter` flag in configs is the authoritative signal for starter state.** `getSetupState` checks it first, before any other field. Bundling code that writes a fresh starter config must include `_starter: true`.

---

## Durable learning

**`Promise.all` + `mockResolvedValue` is a footgun.** A `Response` object's body can only be read once. `mockResolvedValue` returns the same object instance on every call, so the second `Promise.all` consumer gets a body-already-read error. Always use `mockImplementation` with URL routing when a server action calls multiple endpoints in parallel.

**Schema optionality for new media types.** Making `movies` optional (rather than always-required with an empty default) was the right call — it keeps the starter config minimal and avoids confusion about unset vs. empty-set semantics. The same pattern should be followed for any future media type.

**`getSetupState` is a pure file check.** Its three-state return (`starter | partially_configured | ready`) is intentionally disconnected from runtime state. The runtime readiness layer (`GET /api/setup/readiness`) is the right place to combine file state + network state. Keep these concerns separated.

---

## Net assessment

Phase 22 delivered the browser-only setup claim. An operator starting from a `_starter: true` config can now complete the full setup flow through the web UI: verify Transmission, enable write access, configure media directories, add a feed, add a target, and reach a `ready` state — all without touching a config file directly. The readiness model correctly distinguishes config completeness from daemon liveness. The compatibility badge gives operators clear signal about their Transmission deployment without blocking custom setups.

The two `Body is unusable` incidents were avoidable with earlier awareness of the `mockResolvedValue` footgun, but both were caught and fixed before merge.

---

## Follow-up

- **P22.5 — Plex browser auth**: Add a Plex configuration step to the onboarding wizard. The step system is ready; the Plex auth flow needs a dedicated ticket.
- **Bundling phase**: The `_starter: true` flag and `ensureStarterConfig` are the integration points for the bundled installer. The starter config must not include a `movies` block.
- **Daemon restart signal**: The `ready_pending_restart` banner instructs the operator to restart the daemon manually. Automated restart (e.g., via `POST /api/daemon/restart`) is already wired but not triggered from the UI — a follow-up UX decision.

---

_Created: 2026-04-21. PR stack #200–#204._
