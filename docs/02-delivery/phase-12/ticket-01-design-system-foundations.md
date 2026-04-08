# P12.01 Design System Foundations

## Goal

Install and wire **shadcn-svelte** (and required Tailwind/theme integration), replace global styling and the app shell so every route runs inside a shared design-system layout. **Add `Movies` to the global nav** (it is linked from the home page today but not from [`web/src/routes/+layout.svelte`](../../../web/src/routes/+layout.svelte)).

## Scope

- Add shadcn-svelte and peer dependencies under `web/`; configure components (for example under `web/src/lib/components/ui/` per project conventions).
- Theme and CSS tokens aligned with the Stitch reference **approximation** — update [`web/src/app.css`](../../../web/src/app.css) and related config as needed.
- Refactor [`web/src/routes/+layout.svelte`](../../../web/src/routes/+layout.svelte): header, navigation, main landmark, focus-visible behavior using shared primitives.
- Global nav links: Home (`/`), Candidates (`/candidates`), Shows (`/shows`), **Movies (`/movies`)**, Config (`/config`).
- Preserve [`web/src/lib/server/api.ts`](../../../web/src/lib/server/api.ts) and server-only env discipline for `PIRATE_CLAW_API_URL`.
- Update [`web/src/routes/layout.test.ts`](../../../web/src/routes/layout.test.ts) for the new nav structure and any changed selectors.
- Verify `bun run --cwd web build` succeeds and `docker build` using [`web/Dockerfile`](../../../web/Dockerfile) from repo root still succeeds (adjust Dockerfile only if the build pipeline requires it).

## Out Of Scope

- Migrating individual page bodies beyond what the layout applies globally (P12.02–P12.07).
- Daemon API or loader changes.

## Exit Condition

`bun run --cwd web dev` starts; all five nav destinations resolve; layout tests pass; production build and Docker image build succeed.

## Rationale

_To be filled during implementation — summarize toolchain choices, any shadcn-svelte init flags, and Docker/build notes._
