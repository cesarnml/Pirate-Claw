# P27.06 First-Run Health UI

## Goal

Extend the web app to fetch and display install health state on first run, blocking the config onboarding steps until all checks pass.

## Scope

- Extend `+layout.server.ts` to fetch `GET /api/setup/install-health` and expose `installHealthState` alongside the existing `setupState` and `readinessState`.
- In `/onboarding`, render an install health panel above the existing config steps when `installHealthState` is not fully healthy:
  - Show each failing check with its name and DSM-language remediation message (no terminal commands).
  - Show a passing summary when all checks pass.
  - Config onboarding steps (feeds, TV targets, download dirs, etc.) are not shown until install health is fully passing.
- When install health passes, the panel collapses or hides and the existing config onboarding flow proceeds as before.
- A "Re-check" action allows the owner to re-run health checks after following a remediation step.
- Surface is unauthenticated in P27; P28 will gate the entire `/onboarding` route behind owner login.
- No new route. No new URL.

## Out Of Scope

- Owner auth gating (P28).
- Direct downloader network acknowledgement (P28).
- Any new config onboarding steps beyond what already exists.

## Exit Condition

A fresh install that fails one or more health checks shows the install health panel with DSM-language remediation. After all checks pass, the panel clears and config onboarding steps are accessible. A passing install goes directly to config onboarding steps without a blocking panel.

## Rationale

The onboarding health panel treats install health as a Synology-runtime gate only when the loaded config declares `runtime.installRoot`. That preserves the existing local and non-Synology onboarding flow while the Phase 27 Synology compose stack can require Docker image import, folder mounts, write access, generated token, and Transmission path checks to pass before the owner reaches feed and target configuration.

The "Re-check" action reloads `/onboarding`, which re-runs the shared layout health fetch without adding a new route or action. Remediation text comes from the daemon health response so DSM-facing operator guidance stays centralized with the health checks.
