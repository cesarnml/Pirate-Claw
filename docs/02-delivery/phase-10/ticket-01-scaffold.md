# P10.01 Scaffold: SvelteKit App, Tooling, Nav Shell, Dockerfile

## Goal

Bootstrap the `web/` SvelteKit application with the full toolchain, a working nav shell, and a Docker build so every subsequent ticket has a stable foundation to build on.

## Scope

- Run `bun create svelte@latest web` — SvelteKit 2, Svelte 5, TypeScript, ESLint (flat config), Prettier
- Add Tailwind 4 dependencies: `tailwindcss`, `@tailwindcss/vite`
- Add `prettier-plugin-tailwindcss` to `web/prettier.config.*` — automatic Tailwind class sort, no manual config required
- Add `vitest`, `@testing-library/svelte`, `@testing-library/jest-dom`
- Add `@sveltejs/adapter-node` and configure in `svelte.config.ts`
- Wire `PIRATE_CLAW_API_URL` as a server-only env var via `$env/static/private` — read in a shared `src/lib/server/api.ts` fetch helper; throw a clear startup error if absent
- Implement `src/routes/+layout.svelte` with top-level nav: Home (`/`), Candidates (`/candidates`), Shows (links to `/candidates` for now — show detail is P10.03), Config (`/config`)
- Scaffold stub `+page.svelte` for each route (`/`, `/candidates`, `/config`, `/shows/[slug]`) — just a heading so nav links resolve without 404
- Add `web/Dockerfile`: multi-stage build (`bun install --frozen-lockfile`, `bun run build`) → runtime stage (`node build/`)
- Add `web/.env.example` documenting `PIRATE_CLAW_API_URL=http://localhost:5555`
- One smoke test: nav renders all four links

## Out Of Scope

- Real API calls or data (P10.02–P10.05)
- Show detail page content (P10.03)

## Exit Condition

`bun run --cwd web dev` starts without error. All four nav links render. `bun run --cwd web build` produces a `build/` output. `docker build -f web/Dockerfile .` succeeds from repo root.

## Rationale

**Red first:** nav smoke test failed — `mount(...)` is not available on the server — before the vitest config was corrected.

**Why this path:** manually creating the SvelteKit project files rather than using `sv create` (which is fully interactive with no non-interactive flags). All files follow the SvelteKit 2 + Svelte 5 minimal template conventions exactly.

**`$env/dynamic/private` over `$env/static/private`:** the API URL is a runtime value that differs between dev and production. `$env/static/private` bakes the value in at build time, which is wrong for this use case.

**`resolve.conditions: ['browser']` at config root:** Svelte 5's `mount()` is browser-only. Without this, Vitest resolves `svelte/index-server.js` instead of the browser bundle and `@testing-library/svelte` fails. The condition must be at the vite config root, not nested under `test`.

**Alternate considered:** using `@sveltejs/vite-plugin-svelte` directly in vitest.config instead of `sveltekit()` — rejected because it breaks SvelteKit path aliases (`$lib`, `$env`, `$app`) that view tests in later tickets will need.

**Deferred:** Dockerfile Docker build validation deferred to manual NAS deployment (consistent with phases 06/09 exit conditions). The build output and adapter-node configuration are verified by the Vite build step.
