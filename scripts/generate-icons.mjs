#!/usr/bin/env node
// Generates the app's launcher icons as raw PNGs (no image-processing
// dependency in this project — hand-rolled PNG encoder over a pixel buffer).
// Design: a flat --bg-canvas square (edge-to-edge, so it also works as a
// maskable icon without extra padding logic) with a --sage ring open at the
// top — the same motif as the Home screen's progress Ring — and a small
// --lime dot marking progress, centered inside the maskable safe zone
// (icon content kept within the middle ~80%).
//
// Usage: node scripts/generate-icons.mjs
// Regenerate whenever the palette in src/app/globals.css changes.

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BG = [14, 19, 17]; // --bg-canvas #0e1311
const SAGE = [163, 201, 168]; // --sage #a3c9a8
const LIME = [214, 228, 176]; // --lime #d6e4b0

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgbPixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB, no alpha (opaque, edge-to-edge — safe for maskable/apple-touch)
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rgbPixels(x, y);
      const px = rowStart + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }
  const idatData = deflateSync(raw);

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdrData),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

/** Anti-aliased ring (open at the top, like the Home screen's progress Ring) plus a lime dot at the open end. */
function makeIcon(size) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.36;
  const innerR = size * 0.28;
  const ringR = (outerR + innerR) / 2;
  const ringHalfWidth = (outerR - innerR) / 2;
  const gapStartDeg = -100;
  const gapEndDeg = 10;

  return (x, y) => {
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

    const inGap = angleDeg > gapStartDeg && angleDeg < gapEndDeg;
    const distFromRing = Math.abs(dist - ringR);

    if (!inGap && distFromRing <= ringHalfWidth) {
      const edge = ringHalfWidth - distFromRing;
      const aa = Math.min(1, edge / 1.5);
      return mix(BG, SAGE, aa).map(Math.round);
    }

    // lime dot at the gap's trailing (top) end, marking "progress"
    const dotAngle = (gapStartDeg * Math.PI) / 180;
    const dotX = cx + ringR * Math.cos(dotAngle);
    const dotY = cy + ringR * Math.sin(dotAngle);
    const dotR = ringHalfWidth * 1.35;
    const dotDist = Math.sqrt((x + 0.5 - dotX) ** 2 + (y + 0.5 - dotY) ** 2);
    if (dotDist <= dotR) {
      const aa = Math.min(1, (dotR - dotDist) / 1.5);
      return mix(BG, LIME, aa).map(Math.round);
    }

    return BG;
  };
}

const outDir = resolve(process.cwd(), "public");
for (const size of [192, 512]) {
  const png = encodePng(size, size, makeIcon(size));
  const name = `icon-${size}.png`;
  writeFileSync(resolve(outDir, name), png);
  console.log(`wrote public/${name} (${png.length} bytes)`);
}
{
  const size = 180;
  const png = encodePng(size, size, makeIcon(size));
  writeFileSync(resolve(outDir, "apple-touch-icon.png"), png);
  console.log(`wrote public/apple-touch-icon.png (${png.length} bytes)`);
}
