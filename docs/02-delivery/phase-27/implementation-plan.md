# Phase 27 Implementation Plan

Phase 27 turns the Synology story from a hand-built Docker runbook into a DSM-first appliance install path. A DSM-first owner uses Package Center or Container Manager — no SSH, no Docker CLI, no manual JSON edits.

## Epic

- `Phase 27 Synology DSM-First Stack and Cold Start`

Follow the shared guidance in [`docs/02-delivery/phase-implementation-guidance.md`](../phase-implementation-guidance.md) when shaping or revising tickets for this phase.

## Product contract

- [`docs/01-product/phase-27-synology-dsm-first-stack-and-cold-start.md`](../../01-product/phase-27-synology-dsm-first-stack-and-cold-start.md)

## Grill-Me decisions locked for this phase

- **SPK spike gates the installer shape.** P27.01 must produce a finding before P27.04 is written or started. If `.spk` hooks cannot orchestrate Docker containers on DSM 7.1, the install path falls back to a guided File Station + Docker GUI image import/mount flow — still fully GUI-only. Multiple Docker GUI image or volume mount steps are allowed when they are documented and do not require SSH, Docker CLI, or hand-edited files.
- **Daemon generates secrets on first startup.** Install root exists and subdirectory tree is created on daemon first startup (create-if-absent). Secrets (daemon write token, etc.) are generated at first startup, skipped if already present. The installer does not do crypto.
- **First-run health checks extend `/onboarding`.** No new route. Layout server gains `installHealthState`. Install health panel in `/onboarding` must pass before config steps are shown. Surface is unauthenticated in P27; P28 gates it behind owner login.
- **DSM 7.2+ Compose artifact ships in the bundle.** Artifact is authored and included in the release zip. Validation status is explicitly marked pending until a DSM 7.2+ tester verifies it. DSM 7.2+ screenshots are marked pending.
- **Screenshots gate phase close.** All required DSM 7.1 screenshots must be captured on the real DS918+ before P27 closes. Codex + Computer Use captures them in P27.08.
- **Install root is create-if-absent, never wiped.** Reinstall and package repair are safe by default. Existing config, data, and secrets are left untouched.

## Stack

- Bun + TypeScript daemon/API in `src/`
- SvelteKit 2 + Svelte 5 + TypeScript in `web/`
- Docker Compose for the three-service Synology stack
- Synology `.spk` package format for DSM 7.1 Docker install
- DS918+ / DSM 7.1.1-42962 Update 9 as the validated baseline
- Codex + Computer Use for spike validation and screenshot capture (DSM at `https://100.108.117.42:5001/`)

## Ticket Order

1. `P27.01 SPK Docker Orchestration Spike` ← **finding gates P27.04 shape**
2. `P27.02 Daemon First-Startup Bootstrap`
3. `P27.03 Synology Stack Compose Contract`
4. `P27.04 SPK Installer and DSM Icon` ← requires P27.01 finding + P27.03
5. `P27.05 Install Health Daemon Endpoint` ← requires P27.02
6. `P27.06 First-Run Health UI` ← requires P27.05
7. `P27.07 Release Bundle Assembly` ← requires P27.03 + P27.04
8. `P27.08 Exit Validation and Screenshots` ← phase gate, requires P27.04 + P27.06 + P27.07
9. `P27.09 Onboarding UX Follow-up` ← requires P27.08; three UX gaps surfaced during validation
10. `P27.10 Docs and Phase Exit` ← docs-only, requires P27.09

## Ticket Files

- `ticket-01-spk-docker-spike.md`
- `ticket-02-daemon-first-startup-bootstrap.md`
- `ticket-03-synology-stack-compose-contract.md`
- `ticket-04-spk-installer-and-dsm-icon.md`
- `ticket-05-install-health-daemon-endpoint.md`
- `ticket-06-first-run-health-ui.md`
- `ticket-07-release-bundle-assembly.md`
- `ticket-08-exit-validation-and-screenshots.md`
- `ticket-09-onboarding-ux-followup.md`
- `ticket-10-docs-and-phase-exit.md`

## Exit Condition

On the DS918+ DSM 7.1 validated baseline, a DSM-first owner can install Pirate Claw through Package Center, complete any required Docker image/import/volume steps through the DSM GUI, launch it from DSM Main Menu or `http://<nas-ip>:8888`, and see passing install health checks — without SSH, terminal commands, manual JSON edits, manual `.env` edits, or owner-visible secrets. All required screenshots are captured and committed. The release bundle includes the DSM 7.2+ Compose artifact with explicit validation status.

## Review Rules

Review and merge in ticket order.

Do not start the next ticket until:

- tests/checks for the current ticket are green
- ticket rationale is updated for behavior/tradeoff changes
- the DSM-first owner contract (no terminal, no JSON edits) is preserved

**Special gate after P27.01:** review the spike finding before writing or beginning P27.04. If the finding is a fallback (File Station + Docker GUI import), P27.04 scope must be updated to match before implementation starts.

## Explicit Deferrals

- owner account setup and web-session auth (Phase 28)
- OpenVPN bridge and `gluetun` topology (Phase 29)
- WireGuard support (v2)
- direct Docker socket / Container Manager mutation from the web app
- arbitrary custom install paths
- BYO Transmission browser setup
- exposing Transmission web UI by default
- DSM 7.2+ Container Manager path validation (pending external tester)

## Stop Conditions

Pause for review if:

- the spike shows that any required install step needs SSH or CLI
- install health checks require exposing daemon or Transmission ports to the LAN
- the SPK format requires owner-visible secrets in the compose file or config JSON
- the fallback flow requires SSH, Docker CLI, hand-edited files, or owner-visible secrets; multiple GUI-only File Station, Docker image tarball import, image, or volume mount steps are allowed when documented

## Phase Closeout

- **Retrospective: required**
- **Why:** P27 introduces a new install surface (SPK format, appliance path) that is unknown territory, creates a durable technical boundary, and will generate learning that shapes P28/P29 delivery assumptions.
- **Trigger:** architecture/process impact + durable-learning risk
- **Artifact:** `notes/public/phase-27-retrospective.md`
- **Scope:** the final docs ticket (P27.09) must include retrospective writing.

## Developer approval gate

**Do not begin implementation** until this implementation plan and all Phase 27 ticket docs are merged to `main` and explicitly approved for delivery.

## Delivery status

Planning/decomposition only. Implementation has not started.
