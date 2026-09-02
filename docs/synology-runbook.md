# Synology Runbook

This is the advanced operator reference for Pirate Claw on Synology.

**Owner install path:** For first-time installation, use [`docs/synology-install.md`](./synology-install.md) and the validated install guides in `releases/synology-release/version01/`. The owner path stays inside DSM GUI screens and requires no terminal access.

This runbook covers the advanced operator deployment shape — expert-built container topology, NAS-side image rebuilds, Plex diagnostics, and manual config management. It is not the default first-time path for Phase 27 and beyond.

The historical Phase 06 validation artifact still lives at
`docs/product/delivery/phase-06/synology-runbook.md`. Keep that file for the
original validated baseline and ticket rationale trail. Use this top-level
document for current operational guidance.

The Phase 24 daemon supervision reference artifact lives at
[`docs/synology-reference-pirate-claw-container.sh`](./synology-reference-pirate-claw-container.sh).
Treat that file as the source of truth for the reviewed `pirate-claw` container
invocation. The prose in this runbook explains the contract around it; it does
not replace it.

## Scope

This document is for the advanced NAS deployment shape used in the production operator environment:

- Synology `DS918+`
- DSM `7.1.1-42962 Update 9`
- DSM `Docker` package (`Docker`, not `Container Manager`)
- always-on LAN-first operation
- separate `pirate-claw`, `pirate-claw-web`, `transmission`, and `gluetun` containers

## Current Production Snapshot

Observed directly on the live NAS on `2026-04-16`:

- `pirate-claw`, `pirate-claw-web`, and `transmission` were running
- `pirate-claw` restart policy: `always`
- `pirate-claw-web` restart policy: `always`
- `pirate-claw` network mode: `host`
- `pirate-claw-web` network mode: `host`
- `transmission` network mode: `container:<gluetun-id>`
- daemon API reachable on `http://localhost:5555`
- web UI reachable from the separate `pirate-claw-web` container on port `3001`

## Storage Layout

Use these host paths under `/volume1`:

- `/volume1/pirate-claw/config`
- `/volume1/pirate-claw/data`
- `/volume1/transmission/config`
- `/volume1/media/downloads`

Expected durable files and directories:

- `/volume1/pirate-claw/config/pirate-claw.config.json`
- `/volume1/pirate-claw/config/.env`
- `/volume1/pirate-claw/data/pirate-claw.db`
- `/volume1/pirate-claw/data/runtime/`
- `/volume1/pirate-claw/data/runtime/poll-state.json`
- `/volume1/transmission/config/`
- `/volume1/media/downloads/`

## Container Topology

### `pirate-claw`

Purpose:
Runs the Bun daemon and owns the HTTP API.

Observed container contract:

- image: `pirate-claw:latest`
- restart policy: `always`
- network: `host`
- command: `daemon --config /config/pirate-claw.config.json`
- entrypoint: `bun run dist/cli.js`
- repo-owned reference artifact:
  [`docs/synology-reference-pirate-claw-container.sh`](./synology-reference-pirate-claw-container.sh)

Required mounts:

- `/volume1/pirate-claw/config -> /config`
- `/volume1/pirate-claw/data/pirate-claw.db -> /app/pirate-claw.db`
- `/volume1/pirate-claw/data/runtime -> /app/.pirate-claw/runtime`

Critical rule:

- the daemon must receive the whole `/config` directory as a writable bind mount
  if Web UI config saves are enabled
- a single-file writable bind mount for `pirate-claw.config.json` is not enough
  because Pirate Claw writes a sibling temp file and then renames it atomically
- if you want stricter secret hardening, layer a separate read-only `.env` bind
  mount on top of the writable `/config` directory, but the current live NAS now
  runs with the directory mount alone

Reason:

The live daemon supports `PUT /api/config`, `PUT /api/config/feeds`,
`PUT /api/config/tv/defaults`, and `PUT /api/config/movies`. Those writes are
real file writes, not in-memory-only updates, and they use an atomic
temp-file-plus-rename flow.

### Supervision Contract

Under the reviewed Synology baseline, Pirate Claw's daemon supervision contract
is:

- the daemon runs as the `pirate-claw` Docker container created from the
  repo-owned reference artifact
- Docker `--restart always` is the supervisor; the browser UI is not the
  supervisor
- `POST /api/daemon/restart` only asks the daemon process to exit with
  `SIGTERM`; Docker restart policy is what brings the daemon back
- restart-backed operation is supported only when the writable `/config`
  directory and the writable data files (`pirate-claw.db` plus the
  `.pirate-claw/runtime/` tree, including `poll-state.json`) are mounted
  together as the durable Pirate Claw boundary
- the daemon writes restart proof under `.pirate-claw/runtime/restart-proof.json`
  so the browser can distinguish `requested`, `restarting`, `back_online`, and
  bounded `failed_to_return` states instead of stopping at "request sent"
- if the container is started without Docker restart supervision, a restart
  request leaves Pirate Claw stopped until the operator intervenes manually

Phase 24 defines the supported supervisor contract and durable paths. Phase 25
adds the browser-visible round trip on top of that same boundary; the current
product now ships both.

### `pirate-claw-web`

Purpose:
Runs the SvelteKit UI separately from the daemon.

Observed container contract:

- image: `pirate-claw-web:latest`
- restart policy: `always`
- network: `host`
- env:
  - `HOST=0.0.0.0`
  - `PORT=3001`
  - `ORIGIN=http://100.108.117.42:3001` in the current live deployment
  - `PIRATE_CLAW_API_URL=http://localhost:5555`
  - `PIRATE_CLAW_API_WRITE_TOKEN=<same write token the daemon accepts>`

Critical rule:

- when using SvelteKit `adapter-node`, set `ORIGIN` to the actual browser-facing
  origin for the web UI
- `HOST=0.0.0.0` is only the bind address, not a valid browser origin
- without `ORIGIN`, form actions fail with `Cross-site POST form submissions are forbidden`

### `transmission`

Purpose:
Downloader runtime.

Observed container contract:

- image: `linuxserver/transmission:latest`
- restart policy: `always`
- network: `container:<gluetun-id>`

Required mounts:

- `/volume1/transmission/config -> /config`
- `/volume1/media/downloads -> /downloads`

### `gluetun`

Purpose:
Provides the shared network namespace for Transmission in the current live
deployment.

This is part of the current production profile and should be documented
explicitly anywhere the Transmission network mode is described.

## Config And Secrets Contract

Use `/volume1/pirate-claw/config/.env` for secrets that should not live in the
JSON config.

Minimum expected keys in the current deployment:

- `PIRATE_CLAW_API_WRITE_TOKEN`
- `PIRATE_CLAW_TRANSMISSION_USERNAME`
- `PIRATE_CLAW_TRANSMISSION_PASSWORD`

The daemon currently also supports inline Transmission credentials in
`pirate-claw.config.json`, but the recommended operator stance is:

- keep the write token and Transmission credentials in `.env`
- keep `pirate-claw.config.json` for non-secret runtime and policy settings

## Plex Media Server Integration (Phase 18)

Plex enrichment is optional. Add a `plex` block to
`/volume1/pirate-claw/config/pirate-claw.config.json` to enable it.

Compatibility floor for this runbook:

- Pirate Claw's current Plex contract assumes **PMS 1.43.0 or later**
- the reviewed Synology baseline is Pirate Claw itself on Docker plus an
  operator-managed Plex Media Server path
- if Synology Package Center offers an older Plex build than that floor, the
  supported remediation is a newer manual Plex install through Package Center
  using Plex's DSM 7 download

### Choosing `plex.url` (host network vs bridge)

This runbook runs `pirate-claw` with `**--network host**`. In that mode the
daemon shares the NAS network stack, so `**plex.url` should use the host
loopback, not the address you type in a browser on another machine.

Recommended for this deployment:

```json
{
  "plex": {
    "url": "http://127.0.0.1:32400",
    "token": "YOUR_PLEX_TOKEN"
  },
  "runtime": {
    "plexRefreshIntervalMinutes": 360
  }
}
```

`http://localhost:32400` is equivalent to `127.0.0.1` here.

- `token`: your Plex authentication token (see below for how to find it)
- `runtime.plexRefreshIntervalMinutes`: how often the background refresh
  fires; defaults to `360` (6 hours) — it used to live under
  `plex.refreshIntervalMinutes`; set `0` to disable background refresh

The token is redacted in `GET /api/config` responses. If you prefer to keep it
out of the JSON file entirely, set `PIRATE_CLAW_PLEX_TOKEN` in
`/volume1/pirate-claw/config/.env` instead and omit the `token` field.

If you ever run `pirate-claw` on **Docker bridge networking** (not this
runbook’s `docker run`), loopback inside the container is **not** the NAS host.
Use the Docker bridge gateway to reach host services instead; on this NAS that
has been validated as `http://172.17.0.1:32400` (see your bridge network with
`docker network inspect bridge` if the gateway differs).

### What breaks Plex from Pirate Claw (validated 2026-04-17)

Do **not** set `plex.url` to the NAS **Tailscale** or **LAN** address just
because Plex Web opens at `http://<that-ip>:32400` in a browser. From the
`pirate-claw` container on this `DS918+`, `http://100.108.117.42:32400` (example
Tailscale IP) **hangs until timeout**, while `http://127.0.0.1:32400` and
`http://172.17.0.1:32400` return Plex immediately with host networking.

Symptoms when `plex.url` is wrong: daemon logs lines like
`plex request failed: … (The operation was aborted)` or long hangs; background
refresh may finish without useful cache updates; `plexStatus` can stay
`"unknown"` for stale rows.

**Fix:** set `plex.url` to `http://127.0.0.1:32400` (this runbook) or
`http://172.17.0.1:32400` if you use bridge mode, then `docker restart pirate-claw`.

### Verify Plex API reachability from the running container

Uses the mounted config (no pasted token on the command line):

```sh
sudo /usr/local/bin/docker exec pirate-claw bun -e \
  "const c=JSON.parse(await Bun.file('/config/pirate-claw.config.json').text());const u=new URL('/library/sections',c.plex.url);const r=await fetch(u,{headers:{'X-Plex-Token':c.plex.token}});console.log('plex.url',c.plex.url);console.log('GET /library/sections',r.status);"
```

Expected: `GET /library/sections 200`.

Optional raw check with a literal token (replace placeholder):

```sh
sudo /usr/local/bin/docker exec pirate-claw sh -lc \
  'wget -S -O - --timeout=5 "http://127.0.0.1:32400/identity?X-Plex-Token=YOUR_PLEX_TOKEN"'
```

Expected result: `HTTP/1.1 200 OK` with a short XML `MediaContainer` response.

### How To Find Your Plex Token

Recommended method:

1. Sign in to Plex Web at `http://<nas-ip>:32400/web` or `https://app.plex.tv`
   (that `<nas-ip>` is only for the browser; do **not** paste it into
   `plex.url` in Pirate Claw — see **Choosing `plex.url`** above)
2. Open any movie or TV episode in your library
3. Click the `...` menu on that item and choose `Get Info`
4. In the media info dialog, click `View XML`
5. In the new browser tab, look at the URL in the address bar
6. The Plex token is the value after `X-Plex-Token=` at the end of that URL

Fallback methods:

1. Play any item, open the browser developer console, and inspect a Plex API
   request; the token appears as the `X-Plex-Token` query parameter
2. Settings → Account → `<username>` XML link; the token appears in the
   `authToken` attribute

**Do not use a `plex.tv` account/OAuth token here.** A real PMS token is a
short (~20 character) string. If `plex.token` is a long JSON Web Token (three
dot-separated segments, 600+ characters) — for example one produced by the
in-app Plex browser-auth ("Get Info" is not the same thing as the app's own
Plex connect/PIN flow) — Plex Media Server will reject it with `401` even
though `plex.url` and connectivity are correct. Validated 2026-08-26 on the
live NAS: swapping a JWT-shaped token for a genuine `X-Plex-Token` from
**View XML** immediately fixed a `401` on every `/library/sections` call. A
future phase should validate token shape (or exchange an account token for a
real server token) before persisting it, instead of failing opaquely at
request time.

### Config changes that need a daemon restart (validated 2026-08-26)

`PUT /api/config` (and the other config write endpoints) update the daemon's
in-memory `activeConfig` immediately — that's why `GET /api/config` reflects a
web UI save right away with no restart. **This does not extend to the TMDB and
Plex enrichment clients.** Both are constructed once, at daemon boot, from the
config as it existed at startup (`src/cli.ts`, `tmdbMovieEnrichDeps` /
`tmdbShowsEnrichDeps` / `plexMovieEnrichDeps` / `plexShowEnrichDeps`), and nothing
rebuilds them on a later write. Concretely:

- adding `PIRATE_CLAW_TMDB_API_KEY` or a `tmdb.apiKey` value after the daemon
  is already running has no effect on `/api/movies` or `/api/shows`
  enrichment until `docker restart pirate-claw` (or `pirate-claw-daemon` on
  this NAS's container name) — the bound TMDB HTTP client still has no key
- correcting `plex.url` or `plex.token` after the daemon is already running
  has no effect on the _daemon's own_ Plex client until the same restart —
  even though `GET /api/config` already shows the corrected values
- the one-off CLI commands (`plex-refresh`, `plex-audit`) are unaffected by
  this — each invocation loads the config fresh, so they pick up a hand-edited
  or freshly-saved config immediately without touching the running daemon

**Operator rule of thumb:** after any Plex or TMDB config change (via the Web
UI or a direct file edit), restart the daemon container before trusting
`/api/movies` or `/api/shows` enrichment. A future phase should either rebuild
these clients from `configHolder.current` on every config write, or make the
Web UI Config page explicitly say "restart required" for the `tmdb` and
`plex` sections the way it already should for anything else that is
boot-frozen.

### `runtime.plexRefreshIntervalMinutes: 0` does not mean "disabled" for reads

This field used to live at `plex.refreshIntervalMinutes`; it moved to
`runtime.plexRefreshIntervalMinutes` (2026-09-02) to sit alongside the daemon's
other schedule knobs (`tmdbRefreshIntervalMinutes` etc.) instead of being the
one interval buried under the `plex` connection block. The coupling described
below is unchanged by the move — only the key name is.

The `plexRefreshIntervalMinutes: 0` guidance elsewhere in this doc ("set `0`
to disable background refresh") is only true for the **scheduled sweep**
(`plex-refresh` running on a timer inside the daemon loop). It does **not**
disable the **on-demand freshness check** that `/api/movies` and `/api/shows`
run against the SQLite cache on every request:
`isPlexCacheExpired(cachedAt, refreshIntervalMinutes)` computes
`cachedAt + refreshIntervalMinutes * 2 * 60_000 <= now()`. With
`plexRefreshIntervalMinutes: 0` that expression is true the instant any time
has passed, so **every** read treats a perfectly good, freshly-written cache
row as stale and falls back to `plexStatus: "unknown"` — even immediately
after a successful `plex-refresh` that wrote `in_library: 1` rows.

Validated 2026-08-26: `plex_movie_cache` and `plex_tv_cache` both showed
`in_library = 1` for every title right after a clean `plex-refresh` run, but
`/api/movies` and `/api/shows` kept reporting `"unknown"` until the interval
was changed from `0` to a positive value (`30` at the time; the default is now
`360`) **and** the daemon was restarted (see previous section — this value is
also captured once at boot).

**Operator rule of thumb:** never set `runtime.plexRefreshIntervalMinutes: 0`
if you want `/api/movies` / `/api/shows` Plex status to ever show anything
other than `"unknown"`. Use a positive value; `0` should only be used if you
intend to disable Plex status entirely. A future phase should give the on-demand
freshness check and the scheduled-sweep toggle distinct config keys instead of
overloading one number for two different behaviors, and should make `0` mean
"no cache read at all" or "never expire" — whichever is intended — rather than
"always expired."

### TMDB API Key Setup

TMDB enrichment (posters, overviews, ratings on `/api/movies` and
`/api/shows`) is optional and off by default. To enable it, get a free API
key from `https://www.themoviedb.org/settings/api`, then either:

- set `PIRATE_CLAW_TMDB_API_KEY` in `/volume1/pirate-claw/config/.env`
  (preferred — keeps the key out of the JSON config), or
- add a `tmdb.apiKey` value to `pirate-claw.config.json` via the Web UI or a
  direct file edit

Either way, **restart the daemon container afterward** — see **Config changes
that need a daemon restart** above. There is no CLI or API endpoint to trigger
an on-demand TMDB lookup; enrichment happens lazily inside `GET /api/movies`
and `GET /api/shows` once the key is live.

### Verification

After restarting the `pirate-claw` container with the `plex` block configured:

```sh
curl -s http://localhost:5555/api/movies | jq '.[0] | {plexStatus, watchCount, lastWatchedAt}'
```

Expected on first boot (before the first refresh sweep completes):

```json
{ "plexStatus": "unknown", "watchCount": null, "lastWatchedAt": null }
```

Expected after the first refresh sweep:

```json
{
  "plexStatus": "in_library",
  "watchCount": 3,
  "lastWatchedAt": "2026-01-15T21:00:00.000Z"
}
```

or `"missing"` for items not found in the Plex library.

If Plex is unreachable, the daemon logs a warning and continues; existing cache
entries are preserved and API responses return `"unknown"` for expired rows.

### When every title is Plex `"missing"` but Plex Web looks fine

If `GET /library/sections` returns **200** from the container (see above) but
SQLite still shows `**in_library = 0` for every row** in `plex_tv_cache` and
`plex_movie_cache` after refresh, the daemon build is probably **too old to
parse your Plex XML**: movie libraries expose rows as `**<Video type="movie">`**
under `/library/sections/<id>/all`, and global search often nests hits under
`**<Hub>`**. Current `main`ships catalog + hub parsing fixes; **rebuild`pirate-claw:latest`from that tree**, restart the container, then run`plex-refresh` (or wait for the background sweep).

Host-side spot check (no secrets printed):

```sh
sqlite3 /volume1/pirate-claw/data/pirate-claw.db \
  'SELECT COUNT(*), COALESCE(SUM(in_library),0) FROM plex_tv_cache; SELECT COUNT(*), COALESCE(SUM(in_library),0) FROM plex_movie_cache;'
```

When healthy, those `SUM` values should be **> 0** for libraries that actually
contain matched media.

## Runtime Config Contract

The current live config uses:

- `runtime.artifactDir: ".pirate-claw/runtime"`
- `runtime.apiPort: 5555`
- `runtime.tmdbRefreshIntervalMinutes: 360`

That path is relative to the daemon working directory and maps to the mounted
host directory through:

- host: `/volume1/pirate-claw/data/runtime`
- container: `/app/.pirate-claw/runtime`

## Known Drift Reconciled On 2026-04-16

The historical Phase 06 runbook no longer matches the live NAS in several
important ways:

- the canonical runbook used to live under `docs/product/delivery/phase-06/`
- production now includes a separate `pirate-claw-web` container
- production now runs Transmission behind `gluetun`
- the daemon runtime mount uses `/app/.pirate-claw/runtime`, not `/data/runtime`
- the old runbook described the daemon config file mount as read-only, which
  breaks Web UI config writes

## Required Fix For Web UI Saves

If the daemon config file is mounted read-only, authenticated Web UI saves fail
with a `500`.

The correct deployment contract is:

1. mount `/volume1/pirate-claw/config` writable at `/config` in the
   `pirate-claw` container
2. restart `pirate-claw`
3. verify `PUT /api/config` succeeds before trusting the UI
4. optionally re-add a read-only file mount for `/config/.env` if you want
   stronger secret isolation

## Verification Commands

Run on the NAS shell:

```sh
sudo -n /usr/local/bin/docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}'
sudo -n /usr/local/bin/docker inspect pirate-claw --format '{{range .Mounts}}{{.Source}}|{{.Destination}}|{{.Mode}}|RW={{.RW}}{{println}}{{end}}'
sudo -n /usr/local/bin/docker inspect pirate-claw-web --format '{{range .Config.Env}}{{println .}}{{end}}' | grep PIRATE_CLAW_API_URL
curl -si http://localhost:5555/api/config | sed -n '1,20p'
```

Expected checks:

- all required containers are `Up`
- `/config` is writable in the daemon container
- the daemon API returns `200 OK`
- a config write no longer returns `500`

## Deploying new daemon and web images (from a dev machine)

Use this when you want to ship a new `main` tree to the NAS and **rebuild
container images only**. Keep the operator files already on the NAS under
`/volume1/pirate-claw/config/` (`.env`, `pirate-claw.config.json`, `web.env`) —
**never** replace them from a developer laptop during routine upgrades.

**Source of truth:** after initial bootstrap, `pirate-claw.config.json` and the
bounded config surfaces are maintained **on the NAS** via the **Web UI**
(`PUT /api/config`, feeds, movies, TV defaults) or rare **NAS-side** edits (for
fields the UI does not expose yet). Do **not** treat the git repo’s local
`pirate-claw.config.json` / `.env` / `web/.env` as something to `scp` or
`tee` onto the NAS when redeploying images.

### 1. Copy source to the NAS (tar over SSH)

Synology often rejects `rsync` over SSH (`Permission denied` after the server
starts `rsync --server`) and may disable `scp` (`subsystem request failed`).
**Tar over SSH is reliable.**

On the dev machine, from the repo root:

```sh
DEST=cesarnml@100.108.117.42
SSH_PORT=25
BUILD_DIR=/volume1/pirate-claw/runtime/phase18-build

ssh -p "$SSH_PORT" "$DEST" "rm -rf \"$BUILD_DIR\" && mkdir -p \"$BUILD_DIR\""

tar czf - \
  --exclude=node_modules \
  --exclude=web/node_modules \
  --exclude=.git \
  --exclude='.pirate-claw' \
  --exclude=dist \
  . | ssh -p "$SSH_PORT" "$DEST" "cd \"$BUILD_DIR\" && tar xzf -"
```

### 2. NAS config (leave unchanged on upgrades)

The running stack reads secrets and web env from the host paths described in
**Config And Secrets Contract** (typically `.env`, `pirate-claw.config.json`,
and `web.env` under `/volume1/pirate-claw/config/`). For routine image upgrades,
**do not replace those files** from a developer laptop — there is **no** deploy
step that copies repo-root `pirate-claw.config.json`, `.env`, or `web/.env` to
the NAS.

Bootstrap only (new host or missing `web.env`): create the files **on the NAS**
once (editor, `vi`, or one-time `tee` from a trusted machine), then continue
with the build steps. After that, prefer the **Web UI** for ongoing JSON
changes. `web.env` is the env-file passed to `pirate-claw-web` (`--env-file`;
Docker format: `KEY=value` lines only).

#### `transmission.downloadDirs` on the NAS

`transmission.downloadDirs.movie` and `transmission.downloadDirs.tv` must point
at directories **Transmission can actually write** (paths inside the
Transmission container, or a host path shared into both containers the same
way). Example layout used on the live NAS (adjust if your volume layout
differs):

- `movie`: `/downloads/complete/movies`
- `tv`: `/downloads/complete/tv`

After editing `pirate-claw.config.json` on the host, restart the daemon
container: `sudo -n /usr/local/bin/docker restart pirate-claw`.

If `web.env` exists but is missing `ORIGIN`, append it once (adjust the URL if
your browser-facing origin differs):

```sh
ssh -p "$SSH_PORT" "$DEST" \
  'grep -q "^ORIGIN=" /volume1/pirate-claw/config/web.env || echo "ORIGIN=http://100.108.117.42:3001" | sudo -n tee -a /volume1/pirate-claw/config/web.env >/dev/null'
```

### 3. Build `pirate-claw:latest` on the NAS

```sh
ssh -p "$SSH_PORT" "$DEST" \
  "cd \"$BUILD_DIR\" && sudo -n /usr/local/bin/docker build -t pirate-claw:latest ."
```

### 4. Build `pirate-claw-web:latest` on the NAS (Bun workaround)

On DSM, `**bun run build` inside the official multi-stage Dockerfile often
exits with a generic Bun error** during `vite build`. A reliable workaround is
to produce `web/build` and `web/node_modules` with **Node in a one-off
container, then use a tiny runtime-only Dockerfile.

One-off web build:

```sh
ssh -p "$SSH_PORT" "$DEST" \
  "sudo -n /usr/local/bin/docker run --rm -v \"$BUILD_DIR/web:/app\" -w /app node:22-alpine sh -lc 'npm install --ignore-scripts && npx vite build'"
```

Runtime image (write once next to the build tree, then build):

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY web/build ./build
COPY web/package.json ./
COPY web/node_modules ./node_modules
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
EXPOSE 3001
CMD ["node", "build"]
```

Save as `$BUILD_DIR/Dockerfile.web-runtime` on the NAS, then:

```sh
ssh -p "$SSH_PORT" "$DEST" \
  "cd \"$BUILD_DIR\" && sudo -n /usr/local/bin/docker build -f Dockerfile.web-runtime -t pirate-claw-web:latest ."
```

### 5. Recreate containers so new image IDs are picked up

`docker restart` keeps the old image layer; remove and recreate when the tag
was rebuilt.

```sh
ssh -p "$SSH_PORT" "$DEST" "sudo -n /usr/local/bin/docker stop pirate-claw pirate-claw-web"
ssh -p "$SSH_PORT" "$DEST" "sudo -n /usr/local/bin/docker rm pirate-claw pirate-claw-web"

scp -O -P "$SSH_PORT" docs/synology-reference-pirate-claw-container.sh "$DEST:/tmp/pirate-claw-reference.sh"
ssh -p "$SSH_PORT" "$DEST" "chmod +x /tmp/pirate-claw-reference.sh && sudo -n /tmp/pirate-claw-reference.sh"

ssh -p "$SSH_PORT" "$DEST" "sudo -n /usr/local/bin/docker run -d --name pirate-claw-web --restart always --network host \
  --env-file /volume1/pirate-claw/config/web.env \
  pirate-claw-web:latest"
```

Smoke test on the NAS:

```sh
ssh -p "$SSH_PORT" "$DEST" "curl -s -o /dev/null -w 'api:%{http_code}\n' http://127.0.0.1:5555/api/config"
ssh -p "$SSH_PORT" "$DEST" "curl -s -o /dev/null -w 'web:%{http_code}\n' http://127.0.0.1:3001/"
```

## DSM Root Partition Is Tiny — Do Not Install Tools There

Validated 2026-08-27 on the live NAS: DSM's own root filesystem (`/`, backing
device `/dev/md0` on this `DS918+`) is a **2.3GB partition, separate from the
`/volume1` data volume**. It runs close to full under normal DSM + Entware
(`/opt`) operation, and it is easy to push it to `100% / 0 bytes available`
without noticing, because:

- Docker's own image/container storage is **not** the culprit — `docker info`
  reports `Docker Root Dir: /volume1/@docker`, i.e. on the big volume. Image
  builds and running containers do not touch `/`.
- `/opt` (Entware — `opkg`, and anything manually copied into `/opt/bin`) is
  what actually lives on `/dev/md0`. A single native binary install here (for
  example, an operator copying the `gh` CLI release tarball's binary into
  `/opt/bin`) can be tens of megabytes on a partition with very little slack.
- An agent's own scratch/temp directory (for Claude Code specifically: the
  `CLAUDE_CODE_TMPDIR` default path, historically under `/opt/tmp/...`) is
  also on this same tiny partition unless redirected. A single failed or
  partial `bun install`/build attempt staged there — even a _failed_ one that
  gets killed partway through downloading dependencies — can leave 100+MB of
  half-downloaded packages behind.

### What it looks like when this happens

Every shell command starts failing with `ENOSPC: no space left on device`,
including trivial ones (`echo`, `df`) and even background/detached commands —
because the thing that fails first is creating a small bookkeeping file for
the command itself, not the command's own work. `docker build`/`docker run`
keep working during this (they write to `/volume1/@docker`, not `/`), but any
tool that needs to write to `/` or `/opt/tmp` is completely blocked, and this
does not self-resolve — freeing space is the only fix.

### Recovery

```sh
df -h /
du -xh --max-depth=1 / | sort -rh
```

Safe things to remove without touching DSM's own files (`/usr`, `/etc`,
`/var` are DSM-owned; do not delete from those):

```sh
sudo opkg remove --force-depends <package>   # any Entware package installed for operator convenience
sudo rm -f /opt/bin/<binary>                  # any binary copied directly into /opt/bin
rm -rf /opt/tmp/<agent-scratch-dirs>          # stale scratch/temp dirs (see below for the durable fix)
```

### Durable fix: never install to `/opt`, and redirect Claude Code's own scratch space

- Install any future CLI tool (a static binary or an archive's extracted
  binary — `gh`, `jq`, etc.) into `$HOME/.local/bin` instead of `/opt/bin`.
  `$HOME` on this NAS resolves onto `/volume1/homes/...`, not `/`, and
  `$HOME/.local/bin` is already on `PATH` by default in this operator's
  shell config. `bun`'s own installer already does this correctly (installs
  to `$HOME/.bun`) — do not also symlink it into `/opt/bin`.
- Add this to the operator's shell profile (`.zshrc` on this NAS) so Claude
  Code's own scratch/task-tracking files land on the big volume instead of
  `/dev/md0`:

  ```sh
  export CLAUDE_CODE_TMPDIR="$HOME/.claude-tmp"
  ```

  This only takes effect for a **new** session — it does not retroactively
  fix a session whose process already captured its environment at startup.

- If a Docker build needs to copy a large `node_modules` tree (see
  **Deploying new daemon and web images** above) and the working tree has
  uncommitted changes you must not disturb (e.g. another concurrent session's
  in-progress edits), export a clean copy of the committed tree with
  `git archive <ref> | tar -x -C <dest>` into a directory **under
  `/volume1`**, never under `/opt/tmp` — the export itself is small, but
  `bun install`/`bun run build` inside it is not.

## Historical Validation Trail

For the original Phase 06 ticket-by-ticket validation record, use:

- `docs/product/plans/phase-06-synology-runbook.md`
- `docs/product/delivery/phase-06/implementation-plan.md`
- `docs/product/delivery/phase-06/synology-runbook.md`
