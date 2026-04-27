#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_DIR="$ROOT_DIR/tools/synology-release"
OUTPUT_DIR="$ROOT_DIR/.pirate-claw/synology-release"
BUILD_ROOT="$OUTPUT_DIR/build"
VERSION="$(bun -e "console.log(require('./package.json').version)" 2>/dev/null)"
BUNDLE_NAME="pirate-claw-synology-v${VERSION}"
BUNDLE_DIR="$BUILD_ROOT/$BUNDLE_NAME"
ZIP_PATH="$OUTPUT_DIR/${BUNDLE_NAME}.zip"
IMAGE_DIR="$OUTPUT_DIR/images"
DAEMON_IMAGE_TAR="$IMAGE_DIR/pirate-claw-image-v${VERSION}.tar"
WEB_IMAGE_TAR="$IMAGE_DIR/pirate-claw-web-image-v${VERSION}.tar"
TRANSMISSION_IMAGE_TAR="$IMAGE_DIR/transmission-image-v${VERSION}.tar"

rm -rf "$BUILD_ROOT"
mkdir -p \
  "$BUNDLE_DIR/images" \
  "$BUNDLE_DIR/screenshots/dsm-7.1-docker" \
  "$BUNDLE_DIR/screenshots/dsm-7.2-container-manager" \
  "$OUTPUT_DIR"

if [[ ! -f "$DAEMON_IMAGE_TAR" || ! -f "$WEB_IMAGE_TAR" || ! -f "$TRANSMISSION_IMAGE_TAR" ]]; then
  "$ROOT_DIR/tools/synology-release/build-image-tarballs.sh"
fi

cp "$DAEMON_IMAGE_TAR" "$BUNDLE_DIR/images/pirate-claw-image-v${VERSION}.tar"
cp "$WEB_IMAGE_TAR" "$BUNDLE_DIR/images/pirate-claw-web-image-v${VERSION}.tar"
cp "$TRANSMISSION_IMAGE_TAR" "$BUNDLE_DIR/images/transmission-image-v${VERSION}.tar"
cp "$ROOT_DIR/compose.synology.cm.yml" "$BUNDLE_DIR/compose.synology.cm.yml"
cp "$SOURCE_DIR/README-synology-install.md" "$BUNDLE_DIR/README-synology-install.md"
cp "$SOURCE_DIR/install-dsm-7.1-docker.md" "$BUNDLE_DIR/install-dsm-7.1-docker.md"
cp "$SOURCE_DIR/install-dsm-7.2-container-manager.md" "$BUNDLE_DIR/install-dsm-7.2-container-manager.md"
cp "$SOURCE_DIR/screenshots/dsm-7.1-docker/"* \
  "$BUNDLE_DIR/screenshots/dsm-7.1-docker/"
cp "$SOURCE_DIR/screenshots/dsm-7.2-container-manager/README.md" \
  "$BUNDLE_DIR/screenshots/dsm-7.2-container-manager/README.md"

rm -f "$ZIP_PATH"
(cd "$BUNDLE_DIR" && zip -qr "$ZIP_PATH" .)

echo "$ZIP_PATH"
