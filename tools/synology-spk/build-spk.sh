#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_DIR="$ROOT_DIR/tools/synology-spk"
BUILD_DIR="$ROOT_DIR/.pirate-claw/synology-spk/build"
OUTPUT_DIR="$ROOT_DIR/.pirate-claw/synology-spk"
PACKAGE_DIR="$BUILD_DIR/package"
TARGET_DIR="$BUILD_DIR/target"
SPK_PATH="$OUTPUT_DIR/pirate-claw.spk"

rm -rf "$BUILD_DIR"
mkdir -p \
  "$PACKAGE_DIR/scripts" \
  "$PACKAGE_DIR/conf" \
  "$TARGET_DIR/ui/images" \
  "$TARGET_DIR/synology" \
  "$OUTPUT_DIR"

cp "$SOURCE_DIR/INFO" "$PACKAGE_DIR/INFO"
cp "$SOURCE_DIR/scripts/"* "$PACKAGE_DIR/scripts/"
cp "$SOURCE_DIR/conf/"* "$PACKAGE_DIR/conf/"
cp "$SOURCE_DIR/ui/config" "$TARGET_DIR/ui/config"
cp "$SOURCE_DIR/ui/index.html" "$TARGET_DIR/ui/index.html"
cp "$ROOT_DIR/compose.synology.yml" "$TARGET_DIR/synology/compose.synology.yml"
chmod 755 "$PACKAGE_DIR/scripts/"*

bun - "$PACKAGE_DIR" "$TARGET_DIR/ui/images" <<'BUN'
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const packageDir = process.argv[2];
const imageDir = process.argv[3];

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(size) {
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x += 1) {
      const i = 1 + x * 4;
      const inMark =
        (x > size * 0.22 && x < size * 0.42 && y > size * 0.2 && y < size * 0.78) ||
        (x > size * 0.42 && x < size * 0.72 && y > size * 0.2 && y < size * 0.36) ||
        (x > size * 0.42 && x < size * 0.72 && y > size * 0.46 && y < size * 0.62);
      row[i] = inMark ? 255 : 16;
      row[i + 1] = inMark ? 255 : 94;
      row[i + 2] = inMark ? 255 : 132;
      row[i + 3] = 255;
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 24, 32, 48, 64, 72, 256]) {
  fs.writeFileSync(path.join(imageDir, `icon_${size}.png`), png(size));
}

fs.writeFileSync(path.join(packageDir, 'PACKAGE_ICON.PNG'), png(64));
fs.writeFileSync(path.join(packageDir, 'PACKAGE_ICON_256.PNG'), png(256));
BUN

tar -C "$TARGET_DIR" -czf "$PACKAGE_DIR/package.tgz" .
tar -C "$PACKAGE_DIR" -cf "$SPK_PATH" \
  INFO \
  package.tgz \
  scripts \
  conf \
  PACKAGE_ICON.PNG \
  PACKAGE_ICON_256.PNG

echo "$SPK_PATH"
