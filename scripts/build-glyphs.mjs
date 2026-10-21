// สร้าง glyph แบบ SDF (ไฟล์ .pbf ที่ MapLibre ใช้วาดป้าย) จากไฟล์ฟอนต์ TTF/OTF
//
//   npm i -D opentype.js
//   node scripts/build-glyphs.mjs <font.ttf> "<fontstack>" [outDir=fonts]
//   เช่น node scripts/build-glyphs.mjs Kanit-Regular.ttf "Kanit Regular"
//
// ได้ไฟล์ fonts/<fontstack>/<start>-<end>.pbf เฉพาะช่วง 256 ตัวอักษรที่ฟอนต์มีตัวอักษรอยู่
// ค่าตาม glyph server มาตรฐาน (fontnik): ขนาด 24 px, buffer 3 px, รัศมี 8 px, cutoff 0.25
// MapLibre ไม่ทำ complex shaping สระบน/วรรณยุกต์ของไทยจึงวางตามตำแหน่งในตัวฟอนต์เอง (เหมือน Noto)

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Pbf from "pbf";

export const SIZE = 24;
export const BUFFER = 3;
export const RADIUS = 8;
export const CUTOFF = 0.25;
// เส้นฐาน: top ใน .pbf = ความสูงเหนือ baseline (px) − ค่านี้
// ได้จากการเทียบ glyph Noto Sans ที่สร้างเองกับของ OpenFreeMap (A, H, g, x, j, . ตรงกันทุกตัว)
export const TOP_OFFSET = 26;

/* ---------------------------------------------------------------- เรขาคณิต */

// เส้นโครง glyph → รายการเส้นตรง [x1, y1, x2, y2] (หน่วย px, แกน y ชี้ขึ้น) โค้งถูกแบ่งเป็นเส้นตรงสั้นๆ
function flatten(path) {
  const segs = [];
  let sx = 0;
  let sy = 0;
  let x = 0;
  let y = 0;
  const line = (nx, ny) => {
    segs.push([x, y, nx, ny]);
    x = nx;
    y = ny;
  };
  for (const c of path.commands) {
    if (c.type === "M") {
      x = sx = c.x;
      y = sy = -c.y;
    } else if (c.type === "L") {
      line(c.x, -c.y);
    } else if (c.type === "Q") {
      const [x0, y0] = [x, y];
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const mt = 1 - t;
        line(mt * mt * x0 + 2 * mt * t * c.x1 + t * t * c.x, mt * mt * y0 + 2 * mt * t * -c.y1 + t * t * -c.y);
      }
    } else if (c.type === "C") {
      const [x0, y0] = [x, y];
      for (let i = 1; i <= 12; i++) {
        const t = i / 12;
        const mt = 1 - t;
        line(
          mt ** 3 * x0 + 3 * mt * mt * t * c.x1 + 3 * mt * t * t * c.x2 + t ** 3 * c.x,
          mt ** 3 * y0 + 3 * mt * mt * t * -c.y1 + 3 * mt * t * t * -c.y2 + t ** 3 * -c.y,
        );
      }
    } else if (c.type === "Z") {
      if (x !== sx || y !== sy) line(sx, sy);
    }
  }
  return segs;
}

function distToSegSq(px, py, [ax, ay, bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}

// TrueType ใช้กฎ non-zero winding
function winding(px, py, segs) {
  let w = 0;
  for (const [ax, ay, bx, by] of segs) {
    if (ay <= py) {
      if (by > py && (bx - ax) * (py - ay) - (px - ax) * (by - ay) > 0) w++;
    } else if (by <= py && (bx - ax) * (py - ay) - (px - ax) * (by - ay) < 0) w--;
  }
  return w;
}

/* ---------------------------------------------------------------- glyph */

/** glyph หนึ่งตัว → { id, bitmap, width, height, left, top, advance } หรือ null ถ้าฟอนต์ไม่มี */
export function renderGlyph(font, codepoint) {
  const glyph = font.charToGlyph(String.fromCodePoint(codepoint));
  if (!glyph || glyph.index === 0) return null;
  const scale = SIZE / font.unitsPerEm;
  const advance = Math.floor(glyph.advanceWidth * scale); // glyph server มาตรฐานปัดลง
  const segs = flatten(glyph.getPath(0, 0, SIZE));
  if (!segs.length) return { id: codepoint, bitmap: new Uint8Array(0), width: 0, height: 0, left: 0, top: -TOP_OFFSET, advance };

  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [ax, ay, bx, by] of segs) {
    minX = Math.min(minX, ax, bx);
    maxX = Math.max(maxX, ax, bx);
    minY = Math.min(minY, ay, by);
    maxY = Math.max(maxY, ay, by);
  }
  // ปัดเศษขอบกรอบแบบเดียวกับ glyph server มาตรฐาน (ส่วนที่ล้นไม่เกินครึ่ง px ยังอยู่ใน buffer)
  const left = Math.round(minX);
  const top = Math.round(maxY);
  const width = Math.round(maxX) - left;
  const height = top - Math.round(minY);
  const w = width + 2 * BUFFER;
  const h = height + 2 * BUFFER;

  const bitmap = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    const py = top + BUFFER - j - 0.5;
    for (let i = 0; i < w; i++) {
      const px = left - BUFFER + i + 0.5;
      let d2 = Infinity;
      for (const s of segs) d2 = Math.min(d2, distToSegSq(px, py, s));
      const inside = winding(px, py, segs) !== 0;
      const d = inside ? -Math.sqrt(d2) : Math.sqrt(d2); // บวก = นอกตัวอักษร
      bitmap[j * w + i] = Math.max(0, Math.min(255, Math.round(255 - 255 * (d / RADIUS + CUTOFF))));
    }
  }
  return { id: codepoint, bitmap, width, height, left, top: top - TOP_OFFSET, advance };
}

/* ---------------------------------------------------------------- .pbf */

export function encodeGlyphs(fontstack, start, glyphs) {
  const pbf = new Pbf();
  pbf.writeMessage(1, (_, p) => {
    p.writeStringField(1, fontstack);
    p.writeStringField(2, `${start}-${start + 255}`);
    for (const g of glyphs) {
      p.writeMessage(3, (__, q) => {
        q.writeVarintField(1, g.id);
        if (g.bitmap.length) q.writeBytesField(2, g.bitmap);
        q.writeVarintField(3, g.width);
        q.writeVarintField(4, g.height);
        q.writeSVarintField(5, g.left);
        q.writeSVarintField(6, g.top);
        q.writeVarintField(7, g.advance);
      });
    }
  });
  return pbf.finish();
}

export function decodeGlyphs(buf) {
  const glyphs = [];
  new Pbf(buf).readFields((tag, _, pbf) => {
    if (tag !== 1) return;
    pbf.readMessage((t, __, p) => {
      if (t !== 3) return;
      const g = {};
      p.readMessage((f, ___, q) => {
        if (f === 1) g.id = q.readVarint();
        else if (f === 2) g.bitmap = q.readBytes();
        else if (f === 3) g.width = q.readVarint();
        else if (f === 4) g.height = q.readVarint();
        else if (f === 5) g.left = q.readSVarint();
        else if (f === 6) g.top = q.readSVarint();
        else if (f === 7) g.advance = q.readVarint();
      }, g);
      glyphs.push(g);
    }, null);
  }, null);
  return glyphs;
}

/* ---------------------------------------------------------------- CLI */

// รันเป็นคำสั่งเท่านั้น (import จาก test ได้โดยไม่สร้างไฟล์)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [fontFile, fontstack, outDir = "fonts"] = process.argv.slice(2);
  if (!fontFile || !fontstack) {
    console.error('ใช้: node scripts/build-glyphs.mjs <font.ttf> "<fontstack>" [outDir]');
    process.exit(1);
  }
  const { default: opentype } = await import("opentype.js");
  const font = opentype.loadSync(fontFile);
  const dir = join(outDir, fontstack);
  mkdirSync(dir, { recursive: true });

  // ช่วง 256 ตัวที่ฟอนต์มีตัวอักษรอยู่
  const starts = new Set();
  for (let i = 0; i < font.glyphs.length; i++) {
    for (const u of font.glyphs.get(i).unicodes ?? []) if (u <= 0xffff) starts.add(Math.floor(u / 256) * 256);
  }
  let files = 0;
  let count = 0;
  for (const start of [...starts].sort((a, b) => a - b)) {
    const glyphs = [];
    for (let cp = start; cp < start + 256; cp++) {
      const g = renderGlyph(font, cp);
      if (g) glyphs.push(g);
    }
    if (!glyphs.length) continue;
    writeFileSync(join(dir, `${start}-${start + 255}.pbf`), encodeGlyphs(fontstack, start, glyphs));
    files++;
    count += glyphs.length;
  }
  console.log(`${fontstack}: ${count} glyph ใน ${files} ไฟล์ → ${dir}`);
}
