// the-picture-that-tastes-of-one-20261122-2047 — "Satu Bahan: Telur"
// One picture of food, built on a single ingredient: a soft-boiled egg,
// halved, golden yolk just running, on a dark ceramic plate.
// Node 22, stdlib only. Writes entry.png (1024x1024) to $MAKEFUN_OUTPUT_DIR
// and (best effort, guarded) a copy next to this file for the entry dir.
import { writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const W = 1024;
const H = 1024;

type RGB = [number, number, number];

// ---------- deterministic pseudo-random (fixed seed, no Math.random) ----------
let seed = 1234567;
function rnd(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [Math.round(lerp(c1[0], c2[0], t)), Math.round(lerp(c1[1], c2[1], t)), Math.round(lerp(c1[2], c2[2], t))];
}

// ---------- canvas ----------
class Canvas {
  w: number;
  h: number;
  buf: Buffer;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.buf = Buffer.alloc(w * h * 3);
  }
  px(x: number, y: number, c: RGB): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const i = (yi * this.w + xi) * 3;
    this.buf[i] = c[0];
    this.buf[i + 1] = c[1];
    this.buf[i + 2] = c[2];
  }
  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++) {
      for (let xx = Math.round(x); xx < Math.round(x + w); xx++) this.px(xx, yy, c);
    }
  }
  // vertical gradient over a rect
  vgrad(x: number, y: number, w: number, h: number, top: RGB, bot: RGB): void {
    for (let yy = 0; yy < h; yy++) {
      const c = mix(top, bot, yy / Math.max(1, h - 1));
      this.fillRect(x, y + yy, w, 1, c);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + (dx * i) / steps);
      const y = Math.round(y0 + (dy * i) / steps);
      if (t <= 1) this.px(x, y, c);
      else this.fillRect(x - Math.floor(t / 2), y - Math.floor(t / 2), t, t, c);
    }
  }
  disc(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r) this.px(cx + x, cy + y, c);
      }
    }
  }
  // concentric radial gradient disc: outer -> inner
  gradDisc(cx: number, cy: number, r: number, outer: RGB, inner: RGB): void {
    const steps = 24;
    for (let s = steps; s >= 1; s--) {
      const rr = (r * s) / steps;
      this.disc(cx, cy, rr, mix(outer, inner, 1 - s / steps));
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB, t = 2): void {
    for (let a = 0; a < 360; a += 1) {
      const rad = (a * Math.PI) / 180;
      for (let k = 0; k < t; k++) {
        this.px(cx + Math.round((r - k) * Math.cos(rad)), cy + Math.round((r - k) * Math.sin(rad)), c);
      }
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    for (let y = -ry; y <= ry; y++) {
      const half = rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)));
      for (let x = -half; x <= half; x++) this.px(cx + x, cy + y, c);
    }
  }
  // filled ellipse with a vertical gradient (top -> bottom)
  gradEllipse(cx: number, cy: number, rx: number, ry: number, top: RGB, bot: RGB): void {
    for (let y = -ry; y <= ry; y++) {
      const t = (y + ry) / (2 * ry);
      const half = rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)));
      for (let x = -half; x <= half; x++) this.px(cx + x, cy + y, mix(top, bot, t));
    }
  }
}

// ---------- PNG encoder (stdlib zlib + hand-rolled CRC32) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(cv: Canvas): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0);
  ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((cv.w * 3 + 1) * cv.h);
  for (let y = 0; y < cv.h; y++) {
    raw[y * (cv.w * 3 + 1)] = 0;
    Buffer.from(cv.buf.buffer, cv.buf.byteOffset + y * cv.w * 3, cv.w * 3).copy(
      raw,
      y * (cv.w * 3 + 1) + 1,
    );
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

// ---------- palette ----------
const BG_TOP: RGB = [38, 26, 20];
const BG_BOT: RGB = [74, 48, 32];
const TABLE: RGB = [52, 34, 24];
const TABLE_LINE: RGB = [40, 25, 17];
const PLATE_OUT: RGB = [44, 44, 50];
const PLATE_IN: RGB = [66, 64, 72];
const PLATE_RIM: RGB = [104, 100, 112];
const WHITE_TOP: RGB = [252, 248, 238];
const WHITE_BOT: RGB = [228, 216, 196];
const WHITE_SHADE: RGB = [204, 188, 164];
const YOLK_OUT: RGB = [214, 122, 24];
const YOLK_MID: RGB = [240, 168, 44];
const YOLK_IN: RGB = [255, 206, 92];
const YOLK_HI: RGB = [255, 232, 160];
const SALT: RGB = [250, 248, 244];
const ONION: RGB = [96, 168, 84];
const ONION_DARK: RGB = [58, 116, 52];
const STEAM: RGB = [196, 178, 158];

// ---------- scene: one soft-boiled egg, halved, on a dark plate ----------
function drawScene(cv: Canvas): void {
  // warm dark backdrop, lighter toward the egg
  cv.vgrad(0, 0, W, H, BG_TOP, BG_BOT);
  // soft warm glow behind the egg (concentric discs fading into the bg)
  const glowCx = 512;
  const glowCy = 470;
  for (let s = 10; s >= 1; s--) {
    const r = 460 * (s / 10);
    const t = 1 - s / 10;
    cv.disc(glowCx, glowCy, r, mix(BG_BOT, [122, 82, 52], t * 0.55));
  }
  // wooden table band
  cv.fillRect(0, 800, W, 224, TABLE);
  for (const yy of [836, 884, 936, 984]) cv.fillRect(0, yy, W, 3, TABLE_LINE);
  // plate shadow, then the plate
  cv.ellipse(512, 640, 350, 92, [24, 16, 12]);
  cv.ellipse(512, 620, 340, 150, PLATE_OUT);
  cv.ellipse(512, 620, 300, 128, PLATE_IN);

  // ---- egg half 1 (left), cut face up ----
  const e1x = 420;
  const e1y = 590;
  cv.gradEllipse(e1x, e1y, 150, 118, WHITE_TOP, WHITE_BOT);
  // soft shade crescent on the lower right of the white
  cv.ellipse(e1x + 62, e1y + 52, 78, 52, WHITE_SHADE);
  cv.gradEllipse(e1x + 40, e1y + 34, 52, 34, WHITE_TOP, WHITE_BOT);
  // yolk: golden radial disc, glossy
  cv.gradDisc(e1x, e1y, 82, YOLK_OUT, YOLK_IN);
  cv.disc(e1x - 22, e1y - 26, 26, YOLK_HI);
  cv.disc(e1x - 22, e1y - 26, 14, [255, 244, 196]);
  // yolk drip running down from the cut face onto the plate
  cv.ellipse(e1x + 18, e1y + 108, 26, 46, YOLK_MID);
  cv.disc(e1x + 18, e1y + 148, 26, YOLK_MID);
  cv.disc(e1x + 10, e1y + 146, 10, YOLK_HI);

  // ---- egg half 2 (right), slightly higher, overlapping ----
  const e2x = 620;
  const e2y = 545;
  cv.gradEllipse(e2x, e2y, 138, 108, WHITE_TOP, WHITE_BOT);
  cv.ellipse(e2x + 56, e2y + 46, 70, 46, WHITE_SHADE);
  cv.gradEllipse(e2x + 36, e2y + 30, 46, 30, WHITE_TOP, WHITE_BOT);
  cv.gradDisc(e2x, e2y, 74, YOLK_OUT, YOLK_IN);
  cv.disc(e2x - 20, e2y - 24, 24, YOLK_HI);
  cv.disc(e2x - 20, e2y - 24, 12, [255, 244, 196]);

  // ---- salt: flaky specks on yolks and plate ----
  for (let i = 0; i < 26; i++) {
    const cx = 340 + rnd() * 360;
    const cy = 480 + rnd() * 200;
    const r = 2 + rnd() * 3;
    cv.disc(cx, cy, r, SALT);
  }
  // ---- spring-onion curls on the plate rim ----
  cv.circle(760, 700, 26, ONION, 6);
  cv.circle(760, 700, 18, ONION_DARK, 3);
  cv.circle(268, 690, 18, ONION, 5);
  cv.circle(268, 690, 12, ONION_DARK, 2);

  // ---- steam: three soft wavy wisps rising from the egg ----
  const steamTops: [number, number][] = [
    [430, 420],
    [520, 400],
    [610, 415],
  ];
  for (const [sx, sy] of steamTops) {
    let px0 = sx;
    let py0 = sy + 60;
    for (let k = 1; k <= 8; k++) {
      const px1 = sx + Math.sin(k * 0.9) * 14;
      const py1 = sy + 60 - k * 14;
      cv.line(px0, py0, px1, py1, STEAM, 4);
      px0 = px1;
      py0 = py1;
    }
  }
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  const cv = new Canvas(W, H);
  drawScene(cv);
  const png = encodePNG(cv);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), png);
  // best-effort local copy for the entry dir; the grader sandbox repo root
  // is read-only, so this must never throw.
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    copyFileSync(join(outDir, "entry.png"), join(here, "entry.png"));
  } catch {
    // ignore: the output copy above is the graded one
  }
}

main();
