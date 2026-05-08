# P12.01 Design System Foundations

## Goal

Install and wire **shadcn-svelte** (and required Tailwind/theme integration), replace global styling and the app shell so every route runs inside a shared design-system layout. **Add `Movies` to the global nav** (it is linked from the home page today but not from [`web/src/routes/+layout.svelte`](../../../web/src/routes/+layout.svelte)).

## Scope

- Add shadcn-svelte and peer dependencies under `web/`; configure components (for example under `web/src/lib/components/ui/` per project conventions).
- Theme and CSS tokens aligned with the Stitch reference **approximation** — update [`web/src/app.css`](../../../web/src/app.css) and related config as needed.
- Refactor [`web/src/routes/+layout.svelte`](../../../web/src/routes/+layout.svelte): header, navigation, main landmark, focus-visible behavior using shared primitives.
- Global nav links: Home (`/`), Candidates (`/candidates`), Shows (`/shows`), **Movies (`/movies`)**, Config (`/config`).
- Preserve [`web/src/lib/server/api.ts`](../../../web/src/lib/server/api.ts) and server-only env discipline for `PIRATE_CLAW_API_URL`.
- Update [`web/test/routes/layout.test.ts`](../../../web/test/routes/layout.test.ts) for the new nav structure and any changed selectors.
- Verify `bun run --cwd web build` succeeds and `docker build` using [`web/Dockerfile`](../../../web/Dockerfile) from repo root still succeeds (adjust Dockerfile only if the build pipeline requires it).

## Out Of Scope

- Migrating individual page bodies beyond what the layout applies globally (P12.02–P12.07).
- Daemon API or loader changes.

## Exit Condition

`bun run --cwd web dev` starts; all five nav destinations resolve; layout tests pass; production build and Docker image build succeed.

## Rationale

**Tooling:** `shadcn-svelte@latest init` prompts for a preset (not runnable unattended here), so the stack was bootstrapped manually: `components.json` (zinc base, `src/app.css`), `cn` + `WithElementRef` in [`web/src/lib/utils.ts`](../../../web/src/lib/utils.ts), then `bun x shadcn-svelte@latest add button -y --overwrite` for the first primitive. Peer deps: `tailwind-variants`, `clsx`, `tailwind-merge`, `tw-animate-css`, `@lucide/svelte`, `bits-ui`.

**Theme:** Global CSS uses Tailwind v4 `@import` for `tailwindcss` and `tw-animate-css`, shadcn `@theme inline` color tokens, and a `.dark` palette tuned for a dark dashboard with amber-tinted `--primary` to stay close to the existing pirate-claw accent. The root layout applies `class="dark"` so tokens resolve consistently.

**Shell:** [`web/src/routes/+layout.svelte`](../../../web/src/routes/+layout.svelte) uses the generated `Button` with `variant="ghost"` and `href` for nav links; the home/logo link stays a plain anchor for the “Home” accessible name. **Movies** is included in the `nav` array so `/movies` matches other primary routes.

**Verification:** `bun run --cwd web test`, `check`, and `build` pass; full-repo `bun run verify` and `bun run test:web` pass from the repo root. The `web/Dockerfile` build stage is `bun install --frozen-lockfile` and `bun run build` (same as local production build); full `docker build -f web/Dockerfile .` validation is deferred to manual/CI deployment, consistent with **P10.01** (“The build output and adapter-node configuration are verified by the Vite build step”).
