# Pirate Claw

Pirate Claw is a local media intake app for people who run their own Plex and Transmission setup. It watches your RSS feeds, finds movies and TV episodes that match your rules, queues approved downloads in Transmission, and gives you a browser dashboard for setup, monitoring, and day-to-day control.

It is built for a personal NAS or always-on Mac. The app stays local, works with your existing media stack, and is designed so a normal owner can install it, connect services, and manage intake from the browser.

## What Pirate Claw Delivers

Pirate Claw turns a folder of feed links and media preferences into a managed queue:

- **Guided first boot**: open the browser, connect Transmission and Plex, add feeds, and define what you want to track without hand-editing config files.
- **TV and movie matching**: match feed items against title, season, episode, year, resolution, codec, and per-show preferences.
- **Transmission control**: queue approved items, inspect active downloads, retry failed submissions, pause or resume torrents, and remove downloads when needed.
- **Plex awareness**: see whether matched titles are already in your library, whether episodes have been watched, and when Plex last reported them.
- **Dashboard-first operation**: manage feeds, TV targets, movie policy, Plex connection, runtime controls, failed enqueue retries, and torrent lifecycle actions from the web UI.
- **Always-on deployment**: run continuously on a Synology NAS or Mac so short-lived feeds are checked on schedule.
- **Local ownership**: Pirate Claw stores state locally in SQLite and talks directly to your Transmission and Plex services. It is not a hosted indexing service.

## Who It Is For

Pirate Claw is a good fit if you:

- run Plex Media Server and Transmission at home
- use RSS feeds as your intake source
- want repeatable rules instead of manually scanning feeds
- prefer a local tool over a hosted service
- are comfortable operating a home server, NAS, or always-on Mac

It is not a media server, indexer, VPN provider, or file-renaming system. It manages intake and download lifecycle around the services you already run.

## How It Works

Pirate Claw runs as a local daemon with a browser dashboard:

1. You add RSS feeds for TV and movies.
2. You define the shows, movies, and quality preferences you care about.
3. Pirate Claw polls feeds on a schedule and normalizes each candidate.
4. Matching candidates are deduplicated and sent to Transmission.
5. The dashboard shows queue status, downloader state, Plex library state, and any items that need attention.

Transmission remains the downloader. Plex remains the media library. Pirate Claw coordinates the intake workflow between them.

## Getting Started

The recommended setup path is browser-first. A fresh install starts in starter mode, creates the needed local config, and guides setup from the dashboard.

### Synology NAS

Use the Synology owner install guide:

- [docs/synology-install.md](./docs/synology-install.md)

The Synology path is designed for DSM-first installation. You start the Pirate Claw stack, open `http://<nas-ip>:8888`, and complete setup in the browser.

### Mac

Use the Mac always-on runbook:

- [docs/mac-runbook.md](./docs/mac-runbook.md)

For a first local run from the repo:

```bash
bun install
bun run daemon
```

In another terminal, start the dashboard:

```bash
bun install --cwd web
bun run --cwd web dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Prerequisites

Pirate Claw expects:

- Transmission with RPC access enabled
- Plex Media Server 1.43.0 or later
- RSS feeds for the media sources you want to monitor
- Bun when running from source

For Synology installs, use the Synology guide for the supported container and package flow. For Mac installs, use the Mac runbook for the supported `launchd` path.

## Daily Use

Most owner tasks happen in the dashboard:

- add or remove feeds
- add TV shows and movie preferences
- connect or reconnect Plex
- inspect matched TV and movie candidates
- watch active Transmission progress
- retry failed queue attempts
- pause, resume, remove, or delete managed torrents
- restart the local daemon and confirm it came back online

The CLI is still available for local operation and troubleshooting:

```bash
pirate-claw daemon
pirate-claw run
pirate-claw status
pirate-claw retry-failed
pirate-claw reconcile
pirate-claw plex-refresh
pirate-claw config show
```

## Configuration

The browser setup flow is the primary path. Pirate Claw writes and updates `pirate-claw.config.json` for you.

Manual configuration remains available for advanced users. Start from:

- [pirate-claw.config.example.json](./pirate-claw.config.example.json)

The main configuration areas are:

- feeds
- TV defaults and show-specific overrides
- movie quality policy
- Transmission connection and download directories
- Plex connection
- daemon runtime settings

## Privacy And Network Boundary

Pirate Claw is intended to run on your own trusted network. Its state is local, and its core integrations are your configured RSS feeds, Transmission, Plex, and optional metadata lookups.

If you expose Pirate Claw outside your home network, put it behind the same care you would use for any owner-only home service.

## More Documentation

- [docs/README.md](./docs/README.md): documentation index
- [docs/00-overview/start-here.md](./docs/00-overview/start-here.md): project state and contributor orientation
- [docs/00-overview/roadmap.md](./docs/00-overview/roadmap.md): phase history and future planning notes
- [docs/synology-install.md](./docs/synology-install.md): Synology owner install guide
- [docs/mac-runbook.md](./docs/mac-runbook.md): Mac always-on runbook

## Development

For contributors working from source:

```bash
bun test
bun run verify
bun run ci
```

Delivery workflow details live in [docs/03-engineering/delivery-orchestrator.md](./docs/03-engineering/delivery-orchestrator.md).

## License

See [LICENSE](./LICENSE).
