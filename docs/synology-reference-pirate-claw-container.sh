#!/bin/sh
set -eu

# Repo-owned reference artifact for the Phase 24 Synology daemon supervision
# contract. This is the reviewed daemon topology the docs refer to when they
# say "restart-backed Synology operation".
#
# Assumptions:
# - Synology Docker package on a host that exposes /usr/local/bin/docker
# - host networking for the daemon container
# - writable bind mounts for the config directory and the Pirate Claw data files
# - Docker restart policy is the supervisor, not the browser UI itself
#
# Writable durability boundary:
# - /volume1/pirate-claw/config -> /config
# - /volume1/pirate-claw/data/pirate-claw.db -> /app/pirate-claw.db
# - /volume1/pirate-claw/data/runtime -> /app/.pirate-claw/runtime
# - /volume1/pirate-claw/data/poll-state.json -> /app/poll-state.json
#
# Restart contract:
# - Pirate Claw exits on SIGTERM.
# - Docker's restart policy must bring the container back.
# - /api/daemon/restart requests only the SIGTERM side of that contract.

DOCKER_BIN="${DOCKER_BIN:-/usr/local/bin/docker}"
IMAGE="${IMAGE:-pirate-claw:latest}"
NAME="${NAME:-pirate-claw}"
CONFIG_DIR="${CONFIG_DIR:-/volume1/pirate-claw/config}"
DATA_DIR="${DATA_DIR:-/volume1/pirate-claw/data}"

exec "$DOCKER_BIN" run -d \
  --name "$NAME" \
  --restart always \
  --network host \
  -v "$CONFIG_DIR:/config" \
  -v "$DATA_DIR/pirate-claw.db:/app/pirate-claw.db" \
  -v "$DATA_DIR/runtime:/app/.pirate-claw/runtime" \
  -v "$DATA_DIR/poll-state.json:/app/poll-state.json" \
  "$IMAGE" \
  daemon --config /config/pirate-claw.config.json
