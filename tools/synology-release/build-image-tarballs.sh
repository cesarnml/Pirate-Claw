#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/.pirate-claw/synology-release/images"
VERSION="$(bun -e "console.log(require('./package.json').version)" 2>/dev/null)"
PLATFORM="${PIRATE_CLAW_DOCKER_PLATFORM:-linux/amd64}"

mkdir -p "$OUTPUT_DIR"

if ! docker version >/dev/null 2>&1; then
  echo "Docker is required to build Synology image tarballs." >&2
  echo "Start Docker locally, then run this script again." >&2
  exit 1
fi

docker build \
  --platform "$PLATFORM" \
  -t pirate-claw:latest \
  -t "pirate-claw:${VERSION}" \
  -f "$ROOT_DIR/Dockerfile" \
  "$ROOT_DIR"

docker build \
  --platform "$PLATFORM" \
  -t pirate-claw-web:latest \
  -t "pirate-claw-web:${VERSION}" \
  -f "$ROOT_DIR/web/Dockerfile" \
  "$ROOT_DIR"

docker pull --platform "$PLATFORM" lscr.io/linuxserver/transmission:latest

# Remove any stale phase27 tags sharing the same digest so they don't bleed
# into the saved tarballs. `docker rmi` on a tag only removes the tag.
for stale in pirate-claw-phase27:latest "pirate-claw-phase27:${VERSION}" \
             pirate-claw-web-phase27:latest "pirate-claw-web-phase27:${VERSION}"; do
  docker rmi "$stale" 2>/dev/null || true
done

docker save -o "$OUTPUT_DIR/pirate-claw-image-v${VERSION}.tar" pirate-claw:latest
docker save -o "$OUTPUT_DIR/pirate-claw-web-image-v${VERSION}.tar" pirate-claw-web:latest
docker save -o "$OUTPUT_DIR/transmission-image-v${VERSION}.tar" lscr.io/linuxserver/transmission:latest

echo "$OUTPUT_DIR"
