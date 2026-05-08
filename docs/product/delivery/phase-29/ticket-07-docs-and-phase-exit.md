# P29.07 Docs and Phase Exit

Size: 2 points
Type: docs
Scope: docs

## Outcome

- `synology-runbook.md` and `synology-install.md` cover VPN setup, apply, and rollback flows for both DSM 7.1 and DSM 7.2+
- `README.md`, `docs/overview/start-here.md`, and `docs/overview/roadmap.md` reflect P29 delivered scope and current project status
- Browser screenshots and DSM screenshots are captured and referenced in the relevant docs
- Phase 29 retrospective is written at `notes/public/phase-29-openvpn-bridge-retrospective.md`
- CI passes; no code changes

## Red

- No automated test — this is a docs-only ticket
- The "failing" state is: P29.06 passed but docs and retrospective are absent
- Commit this ticket file: `docs(P29.07): phase exit docs and retrospective [red]`

## Green

**`docs/synology-install.md`:**

- Add a "VPN Bridge Setup" section after the existing post-install sections
- Steps: navigate to Config → Downloader Network; upload `.ovpn` profile; enter credentials; download VPN compose artifact; apply via DSM (DSM 7.1 path per P29.01 findings, DSM 7.2+ Container Manager path); click "Verify VPN connection"
- Add a "Rollback to Direct Mode" section: download `compose.synology.direct.yml`; apply via DSM GUI; verify shows `direct_mode`
- Add a note: "VPN credentials are stored on the NAS as a mounted file — they never appear in any JSON config or Compose YAML"

**`docs/synology-runbook.md`:**

- Add troubleshooting entries for: VPN bridge unreachable (check gluetun container status + daemon verify logs); credentials not accepted by gluetun (check credentials file format); CSRF form submission fails from secondary origin (confirm `ALLOWED_ORIGINS` env var in compose + daemon restart)
- Reference the `[vpn] verify` log line format so operators know what to grep

**`README.md`:**

- Update feature list / project status to reflect P29 delivered (VPN bridge for bundled Transmission, multi-origin CSRF fix)
- Update DSM version note: validated on DSM 7.1.1 (DS918+); DSM 7.2.1 upgrade in progress for Phase 30

**`docs/overview/start-here.md`:**

- Update delivered scope, current phase status (P29 complete), and next phase (P30 — DSM 7.2.1 baseline)

**`docs/overview/roadmap.md`:**

- Mark P29 as delivered; update P30 status and notes

**Screenshots** (capture on DS918+ or in browser, reference in docs):

- Browser: Downloader Network page (empty state), profile upload form, credentials form, compose download buttons active, VPN apply instructions (DSM 7.1 + DSM 7.2+), verify success badge (`vpn_bridge_active`), verify failure badge + "Try again", rollback state (`direct_mode`)
- DSM: DSM 7.1 apply flow (GUI steps if feasible, or SSH terminal if fallback), DSM 7.2+ Container Manager Project update/import, stop/start project, rollback path

Screenshots saved under `docs/screenshots/phase-29/` and referenced inline in `synology-install.md`.

**Retrospective:**

- Write `notes/public/phase-29-openvpn-bridge-retrospective.md` per the `soa-write-retrospective` skill conventions
- Required sections: What shipped, Locked decisions and how they held up, Surprises / what changed from the plan, DSM 7.1 hardware findings (spike outcome, apply path, any gotchas), CSRF gap closure (what changed from P28, what was harder or easier than expected), VPN credential security posture (file-based vs env — any implementation notes), Durable assumptions for P30+ (what P30 can rely on), Deferred items (why deferred, what would trigger bringing them back)

Commit: `docs(P29.07): synology docs, roadmap, readme, screenshots, retrospective [green]`

## Refactor

- No code to refactor
- If any doc section duplicates content already in `README.md`, prefer a cross-reference over duplication

## Review Focus

- **Retrospective is required** — this ticket does not close without a written retrospective; the retrospective is the primary durable artifact of P29
- **DSM 7.1 findings** — the install guide's DSM 7.1 apply path must match what P29.01 confirmed; no placeholder content or "TBD" remaining
- **`ALLOWED_ORIGINS` troubleshooting entry** — must be present in `synology-runbook.md`; this is the most likely operational failure mode after deploy
- **Screenshot references** — each screenshot file must exist in `docs/screenshots/phase-29/` before the PR merges; broken image links are a merge blocker
- **Roadmap accuracy** — confirm P29 is marked delivered and P30 status is accurate; do not speculate on P30+ scope beyond what is already in the roadmap

## Rationale

> Append here (do not edit above) when behavior or trade-offs change during implementation.

Red first: no automated test; docs ticket is gated by P29.06 hardware validation passing
Why this path: docs and retrospective are written after hardware validation so the install guide reflects confirmed behavior (not speculative steps)
Alternative considered: writing docs alongside P29.05 implementation — rejected because DSM 7.1 apply path steps can only be confirmed after the P29.01 spike and P29.06 validation; speculative docs create operator confusion
Deferred: [what was intentionally left out of this ticket]
Contract note: `Type: docs` is correct; no code changes in this ticket
