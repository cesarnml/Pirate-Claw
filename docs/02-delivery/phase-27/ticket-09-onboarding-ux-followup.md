# P27.09 Onboarding UX Follow-up

## Goal

Fix three UX gaps surfaced during P27.08 exit validation that block a clean first-run experience
but do not affect core functionality.

## Issues

### 1. Plex returnTo lands on dashboard instead of onboarding

After completing the Plex browser sign-in flow, the user is redirected to `/config` (the
default `returnTo`) instead of back to `/onboarding`. The user loses their place in the
onboarding wizard and has to navigate back manually.

Fix: pass `returnTo=/onboarding` in the onboarding page's Plex connect link.

### 2. Onboarding stuck when config already has data

If the daemon is restarted with an existing config that has feeds and shows but `_starter: true`
(e.g. after a mid-flow container rebuild), the onboarding summary shows the old data as
complete but `readiness: not_ready`. The user cannot re-trigger config writes through the UI
to clear `_starter` — the steps appear already done and offer no re-entry path.

Fix: onboarding steps should remain interactive even when pre-populated, so the user can
re-save to trigger a write and advance state.

### 3. No back-to-dashboard affordance on onboarding

The onboarding page has no navigation link back to the dashboard. Users who want to exit
mid-wizard must use the browser back button or navigate via the sidebar.

Fix: add a "Back to dashboard" or "Skip setup" link at the top of the onboarding page.

## Out of Scope

- Auth gating (P28).
- Any changes to the install health flow.

## Exit Condition

All three issues resolved and verified on the NAS.

## Rationale

Surfaced during P27.08 exit validation run on DS918+ / DSM 7.1.1.
