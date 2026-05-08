# P29.01 DSM 7.1 VPN Apply Spike

Size: 1 point
Type: chore
Scope: spike

## Outcome

- The question "can DSM 7.1 Docker GUI recreate a container with a new `--network` configuration without terminal access?" is answered definitively
- The answer is documented in the Rationale section of this ticket
- The DSM 7.1 apply path for P29.05 is determined: either GUI-apply copy or SSH-steps fallback copy

## Red

- No automated test — this is a pure research spike with no code changes
- The "failing" state is: P29.05 UI copy for DSM 7.1 is unknown and therefore unwritable
- Commit this ticket file to the branch as the only artifact: `chore(P29.01): dsm71 vpn apply spike [red]`

## Green

- Physically test on DS918+ DSM 7.1.1: attempt to stop a running container, edit its network settings (add a `--network` flag), and restart — using only the DSM Docker GUI, no terminal
- If **GUI apply is feasible**: document the exact GUI steps (Package Center → Docker → Container → Edit → Network tab or equivalent), record which DSM package version was used, confirm the container comes back up on the new network
- If **GUI apply requires terminal**: document what the GUI cannot do, confirm SSH steps work as a fallback (`docker stop`, `docker rm`, `docker run --network gluetun-bridge ...`), and record the exact commands
- Record the answer in the Rationale section below
- Commit: `chore(P29.01): dsm71 vpn apply spike — [gui-feasible|ssh-fallback] [green]`

## Refactor

- No code to refactor
- If any doc references to DSM 7.1 apply path are ambiguous in the product plan, update them to match the finding — `docs/product/plans/phase-29-*.md` only; do not touch other docs

## Review Focus

- The answer must be unambiguous: GUI-feasible or SSH-fallback — no "maybe" or "partially"
- If GUI apply is partially possible (e.g. can change some settings but not network), treat that as SSH-fallback for P29.05 copy purposes
- The exact DSM package version and GUI path must be recorded so the finding is reproducible
- This spike gates P29.05 DSM 7.1 UI copy — the PR for P29.05 must reference this finding

## Rationale

> Append here (do not edit above) when behavior or trade-offs change during implementation.

Red first: no automated test; spike is gated by hardware access
Why this path: DSM 7.1 GUI capabilities are not documented for network reconfiguration; the answer requires physical device testing
Alternative considered: assuming SSH fallback without testing — rejected because the product plan explicitly commits to GUI apply if feasible; operators should not need terminal access for the happy path
Deferred: DSM 7.2+ apply path is out of scope for this spike; DSM 7.2+ uses Container Manager Project update which is well-documented
Contract note: `Type: chore` is correct for a research-only ticket with no code artifact
