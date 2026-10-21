// ฝั่ง server (Node 18+): ทำ tile ขอบเขตการปกครองเฉพาะประเทศไทยจาก OpenFreeMap
//
//   /boundary-tiles/{z}/{x}/{y}   layer "boundary"  เส้น admin_level 4/6 ตัดให้เหลือเฉพาะในไทย
//                                                     + เส้นตำบล (8) จาก GISTDA ตั้งแต่ซูม 13 (src/tambon.js)
//                                 layer "label"     จุดชื่อจังหวัด/อำเภอ จากที่ตั้งศาลากลาง/ตัวอำเภอ (place.capital)
//                                                     + ชื่อตำบลจาก GISTDA
//
// ทำไมต้องทำที่ server: เส้นระดับ 4/6/8 ของ OpenMapTiles ไม่มี field ประเทศ และทุกเส้นใน tile ถูกรวมเป็น
// feature เดียว filter ฝั่ง MapLibre จึงแยกเส้นไทยออกจากเส้นประเทศเพื่อนบ้านไม่ได้
//
// ใช้:  tileMiddleware() เป็น middleware แบบ connect (req, res, next)
//       Vite: server.middlewares.use(tileMiddleware())   Express: app.use(tileMiddleware())

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import {
  GISTDA_TAMBON_SERVICE,
  OPENFREEMAP_ADMIN_LEVELS,
  OPENFREEMAP_CAPITAL_LEVELS,
  OPENFREEMAP_GLYPHS,
  OPENFREEMAP_TILEJSON,
} from "./config.js";
import { createTambonSource } from "./tambon.js";
import { THAILAND_OUTLINE } from "./thailand.js";

// glyph ที่มากับ package (สร้างด้วย scripts/build-glyphs.mjs) เช่น fonts/Kanit Regular/0-255.pbf
const FONTS_DIR = fileURLToPath(new URL("../fonts/", import.meta.url));

const MAX_ZOOM = 14; // tile ของ OpenFreeMap มีถึง z14 ซูมเกินนั้น MapLibre ขยายเอง
const TILEJSON_TTL = 60 * 60 * 1000; // URL ของ tile มีเลขเวอร์ชันที่เปลี่ยนได้
const CACHE_SIZE = 2000;
const CACHE_CONTROL = "public, max-age=86400";

// ชื่อใน OSM บางจุดเป็นชื่อเทศบาล เช่น "เทศบาลตำบลปาย" → "ปาย"
const NAME_PREFIX = /^(เทศบาลนคร|เทศบาลเมือง|เทศบาลตำบล|อำเภอ|จังหวัด)\s*/;

/* -------------------------------------------------------------------------- */
/* ตัดด้วย polygon                                                            */
/* -------------------------------------------------------------------------- */

// lng/lat → พิกัด Web Mercator 0..1
const mercX = (lng) => (lng + 180) / 360;
const mercY = (lat) => {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
};

function toEdges(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const edges = [];
  for (const rings of polygons) {
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) {
        edges.push([mercX(ring[i - 1][0]), mercY(ring[i - 1][1]), mercX(ring[i][0]), mercY(ring[i][1])]);
      }
    }
  }
  return edges;
}

/**
 * ตัวตัดของ tile หนึ่ง: แปลงขอบ polygon เป็นพิกัดของ tile แล้วเก็บเฉพาะขอบที่เกี่ยว
 * @returns {{ mode: "all"|"none"|"clip", inside: (x, y) => boolean, clip: (line) => number[][][] }}
 */
function tileClipper(edges, z, x, y, extent) {
  const n = 2 ** z;
  const min = -extent * 0.25; // geometry ของ tile ล้นขอบได้ (buffer)
  const max = extent * 1.25;
  const local = [];
  for (const [ax, ay, bx, by] of edges) {
    const e = [(ax * n - x) * extent, (ay * n - y) * extent, (bx * n - x) * extent, (by * n - y) * extent];
    // เก็บขอบที่รังสีแนวนอน (ไปทาง +x) จากจุดใน tile อาจตัดผ่าน
    if (Math.max(e[1], e[3]) < min || Math.min(e[1], e[3]) > max || Math.max(e[0], e[2]) < min) continue;
    local.push(e);
  }

  const inside = (px, py) => {
    let c = false;
    for (const [ax, ay, bx, by] of local) {
      if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) c = !c;
    }
    return c;
  };

  const crossing = local.filter(
    ([ax, ay, bx, by]) => Math.max(ax, bx) >= min && Math.min(ax, bx) <= max && Math.max(ay, by) >= min && Math.min(ay, by) <= max,
  );

  // ค่า t (0..1) บนเส้น p→q ที่ตัดขอบประเทศ เรียงจากใกล้ไปไกล
  const hits = (p, q) => {
    const ts = [];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    for (const [ax, ay, bx, by] of crossing) {
      if (Math.max(ax, bx) < Math.min(p.x, q.x) || Math.min(ax, bx) > Math.max(p.x, q.x)) continue;
      if (Math.max(ay, by) < Math.min(p.y, q.y) || Math.min(ay, by) > Math.max(p.y, q.y)) continue;
      const ex = bx - ax;
      const ey = by - ay;
      const den = dx * ey - dy * ex;
      if (den === 0) continue;
      const t = ((ax - p.x) * ey - (ay - p.y) * ex) / den;
      const u = ((ax - p.x) * dy - (ay - p.y) * dx) / den;
      if (t > 0 && t <= 1 && u >= 0 && u < 1) ts.push(t);
    }
    return ts.sort((a, b) => a - b);
  };

  const clip = (line) => {
    const parts = [];
    let state = inside(line[0].x, line[0].y);
    let cur = state ? [[line[0].x, line[0].y]] : null;
    for (let i = 1; i < line.length; i++) {
      const p = line[i - 1];
      const q = line[i];
      for (const t of hits(p, q)) {
        const point = [p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t];
        if (state) {
          cur.push(point);
          parts.push(cur);
          cur = null;
        } else {
          cur = [point];
        }
        state = !state;
      }
      if (state) cur.push([q.x, q.y]);
    }
    if (cur) parts.push(cur);
    return parts;
  };

  // ไม่มีขอบประเทศผ่าน tile นี้ = ทั้ง tile อยู่ในหรืออยู่นอกประเทศ
  const mode = crossing.length ? "clip" : inside(extent / 2, extent / 2) ? "all" : "none";
  return { mode, inside, clip };
}

/* -------------------------------------------------------------------------- */
/* เขียน Mapbox Vector Tile (เส้นและจุด)                                      */
/* -------------------------------------------------------------------------- */

const zigzag = (n) => (n << 1) ^ (n >> 31);
const command = (id, count) => (id & 0x7) | (count << 3);

function encodeGeometry(type, parts) {
  const out = [];
  let cx = 0;
  let cy = 0;
  if (type === "point") {
    if (!parts.length) return out;
    out.push(command(1, parts.length)); // MoveTo ×n
    for (const [px, py] of parts) {
      const x = Math.round(px);
      const y = Math.round(py);
      out.push(zigzag(x - cx), zigzag(y - cy));
      cx = x;
      cy = y;
    }
    return out;
  }
  for (const line of parts) {
    const pts = [];
    for (const [px, py] of line) {
      const x = Math.round(px);
      const y = Math.round(py);
      if (pts.length && pts.at(-1)[0] === x && pts.at(-1)[1] === y) continue;
      pts.push([x, y]);
    }
    if (pts.length < 2) continue;
    out.push(command(1, 1), zigzag(pts[0][0] - cx), zigzag(pts[0][1] - cy));
    [cx, cy] = pts[0];
    out.push(command(2, pts.length - 1));
    for (const [x, y] of pts.slice(1)) {
      out.push(zigzag(x - cx), zigzag(y - cy));
      cx = x;
      cy = y;
    }
  }
  return out;
}

/**
 * เขียน MVT จากรายการ layer
 * @param {{ name: string, features: { type: "line"|"point", properties: Record<string, string|number>, geometry: number[][] | number[][][] }[] }[]} layers
 *   geometry ของเส้น = [[x, y], ...][] (หลายเส้น), ของจุด = [x, y][] · ค่า properties เป็น string หรือจำนวนเต็มบวก
 * @param {number} [extent=4096]
 * @returns {Uint8Array|null}  null = ไม่มี feature เลย
 */
export function encodeTile(layers, extent = 4096) {
  const pbf = new Pbf();
  let any = false;

  for (const layer of layers) {
    const keys = [];
    const values = [];
    const valueKey = (v) => `${typeof v}:${v}`;
    const encoded = [];
    for (const f of layer.features) {
      const geometry = encodeGeometry(f.type, f.geometry);
      if (!geometry.length) continue;
      const tags = [];
      for (const [k, v] of Object.entries(f.properties)) {
        if (!keys.includes(k)) keys.push(k);
        let vi = values.findIndex((x) => valueKey(x) === valueKey(v));
        if (vi < 0) vi = values.push(v) - 1;
        tags.push(keys.indexOf(k), vi);
      }
      encoded.push({ tags, type: f.type === "point" ? 1 : 2, geometry });
    }
    if (!encoded.length) continue;
    any = true;

    pbf.writeMessage(3, (_, p) => {
      p.writeVarintField(15, 2); // version
      p.writeStringField(1, layer.name);
      for (const f of encoded) {
        p.writeMessage(2, (__, q) => {
          q.writePackedVarint(2, f.tags);
          q.writeVarintField(3, f.type);
          q.writePackedVarint(4, f.geometry);
        });
      }
      for (const k of keys) p.writeStringField(3, k);
      for (const v of values) {
        p.writeMessage(4, (__, q) => (typeof v === "string" ? q.writeStringField(1, v) : q.writeVarintField(5, v)));
      }
      p.writeVarintField(5, extent);
    });
  }
  return any ? pbf.finish() : null;
}

/* -------------------------------------------------------------------------- */
/* tile ขอบเขต                                                                */
/* -------------------------------------------------------------------------- */

/**
 * @param {object} [options]
 * @param {object} [options.within]  Polygon/MultiPolygon ที่จะเก็บไว้ (ค่าเริ่มต้น ขอบประเทศไทยขยาย 1 กม.)
 * @param {string} [options.tilejson]  TileJSON ของ OpenMapTiles
 * @param {number[]} [options.adminLevels]  admin_level ของเส้นที่เก็บ
 * @param {Record<number, string>} [options.capitalLevels]  place.capital → ระดับของป้าย (false = ไม่ทำป้าย)
 * @param {object|false} [options.tambon]  service ตำบลของ GISTDA { url, minzoom, name, area } ใช้แทนเส้นตำบลของ OSM
 *   และเพิ่มป้ายชื่อตำบล หรือ false = ใช้เส้นตำบลของ OSM (ไม่มีป้าย)
 * @param {typeof fetch} [options.fetch]
 * @returns {(z: number, x: number, y: number) => Promise<Uint8Array|null>}  null = tile ว่าง
 */
export function createBoundaryTiles({
  within = THAILAND_OUTLINE,
  tilejson = OPENFREEMAP_TILEJSON,
  adminLevels = Object.values(OPENFREEMAP_ADMIN_LEVELS),
  capitalLevels = OPENFREEMAP_CAPITAL_LEVELS,
  tambon = GISTDA_TAMBON_SERVICE,
  fetch = globalThis.fetch,
} = {}) {
  const edges = toEdges(within);
  const cache = new Map();
  const tambonSource = tambon ? createTambonSource(tambon, fetch) : null;
  const tambonLevel = OPENFREEMAP_ADMIN_LEVELS.Tambon;
  let template = null;
  let templateAt = 0;

  async function tileUrl(z, x, y) {
    if (!template || Date.now() - templateAt > TILEJSON_TTL) {
      const res = await fetch(tilejson);
      if (!res.ok) throw new Error(`TileJSON HTTP ${res.status}`);
      template = (await res.json()).tiles[0];
      templateAt = Date.now();
    }
    return template.replace("{z}", z).replace("{x}", x).replace("{y}", y);
  }

  function boundaryFeatures(layer, clipper) {
    // รวมเส้นตาม admin_level เหมือน OpenMapTiles
    const byLevel = new Map();
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const { admin_level: level, maritime, disputed } = f.properties;
      if (!adminLevels.includes(level) || maritime === 1 || disputed === 1) continue;
      if (tambonSource && level === tambonLevel) continue; // ใช้เส้นตำบลของ GISTDA แทน
      const lines = byLevel.get(level) ?? [];
      for (const line of f.loadGeometry()) {
        if (clipper.mode === "all") lines.push(line.map((p) => [p.x, p.y]));
        else lines.push(...clipper.clip(line));
      }
      byLevel.set(level, lines);
    }
    return [...byLevel].map(([level, lines]) => ({
      type: "line",
      properties: { admin_level: level, maritime: 0, disputed: 0 },
      geometry: lines,
    }));
  }

  function labelFeatures(layer, clipper) {
    const features = [];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const p = f.properties;
      const level = capitalLevels[p.capital];
      if (!level) continue;
      const name = String(p["name:th"] ?? p.name ?? "").replace(NAME_PREFIX, "").trim();
      if (!name) continue;
      const points = f
        .loadGeometry()
        .flat()
        .filter((pt) => clipper.mode === "all" || clipper.inside(pt.x, pt.y))
        .map((pt) => [pt.x, pt.y]);
      if (!points.length) continue;
      features.push({ type: "point", properties: { level, name, rank: p.rank ?? 99 }, geometry: points });
    }
    return features;
  }

  async function build(z, x, y) {
    if (z > MAX_ZOOM) return { tile: null, cacheable: true };
    const res = await fetch(await tileUrl(z, x, y));
    if (res.status === 204 || res.status === 404) return { tile: null, cacheable: true };
    if (!res.ok) throw new Error(`OpenFreeMap HTTP ${res.status}`);
    const vt = new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer())));
    const extent = vt.layers.boundary?.extent ?? vt.layers.place?.extent ?? 4096;

    const clipper = tileClipper(edges, z, x, y, extent);
    if (clipper.mode === "none") return { tile: null, cacheable: true };

    const lines = vt.layers.boundary ? boundaryFeatures(vt.layers.boundary, clipper) : [];
    const labels = vt.layers.place && capitalLevels ? labelFeatures(vt.layers.place, clipper) : [];

    // ตำบลจาก GISTDA: ถ้า service ล่ม ส่ง tile ไปก่อนโดยไม่มีตำบล และไม่เก็บ cache ไว้ให้ลองใหม่ครั้งหน้า
    let cacheable = true;
    if (tambonSource && z >= tambon.minzoom) {
      try {
        const t = await tambonSource(z, x, y, extent);
        lines.push({ type: "line", properties: { admin_level: tambonLevel, maritime: 0, disputed: 0 }, geometry: t.lines });
        for (const l of t.labels) {
          labels.push({ type: "point", properties: { level: "Tambon", name: l.name, rank: l.rank }, geometry: [l.point] });
        }
      } catch (err) {
        console.error(`admin-boundary tambon ${z}/${x}/${y}: ${err.message}`);
        cacheable = false;
      }
    }

    const layers = [
      { name: "boundary", features: lines },
      { name: "label", features: labels },
    ];
    return { tile: encodeTile(layers, extent), cacheable };
  }

  return async (z, x, y) => {
    const key = `${z}/${x}/${y}`;
    if (cache.has(key)) return cache.get(key);
    const { tile, cacheable } = await build(z, x, y);
    if (cacheable) {
      cache.set(key, tile);
      if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
    }
    return tile;
  };
}

/* -------------------------------------------------------------------------- */
/* middleware                                                                  */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* glyph ของป้าย                                                              */
/* -------------------------------------------------------------------------- */

/**
 * glyph (.pbf) สำหรับป้าย: fontstack ที่มากับ package (เช่น "Kanit Regular") อ่านจากไฟล์
 * ที่เหลือ (เช่น "Noto Sans Regular" ของ basemap) ส่งต่อไป upstream
 * @param {object} [options]
 * @param {string} [options.dir]  โฟลเดอร์ fonts/<fontstack>/<range>.pbf
 * @param {string} [options.upstream]  glyph server สำรอง มี {fontstack} และ {range}
 * @param {typeof fetch} [options.fetch]
 * @returns {(fontstack: string, start: number) => Promise<Uint8Array>}  ไม่มี glyph = Uint8Array ว่าง (protobuf ว่างที่ถูกต้อง)
 */
export function createGlyphs({ dir = FONTS_DIR, upstream = OPENFREEMAP_GLYPHS, fetch = globalThis.fetch } = {}) {
  const bundled = new Set(existsSync(dir) ? readdirSync(dir) : []);
  const cache = new Map();

  return async (fontstack, start) => {
    const range = `${start}-${start + 255}`;
    // fontstack อาจมีหลายชื่อคั่นด้วย , ใช้ตัวแรกที่มากับ package (ชื่อมาจาก readdir จึงไม่มี path แปลกปลอม)
    const local = fontstack.split(",").map((s) => s.trim()).find((name) => bundled.has(name));
    if (local) {
      const file = join(dir, local, `${range}.pbf`);
      return existsSync(file) ? new Uint8Array(readFileSync(file)) : new Uint8Array(0);
    }

    const key = `${fontstack}/${range}`;
    if (cache.has(key)) return cache.get(key);
    const url = upstream.replace("{fontstack}", encodeURIComponent(fontstack)).replace("{range}", range);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`glyphs HTTP ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    cache.set(key, buf);
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return buf;
  };
}

/* -------------------------------------------------------------------------- */
/* middleware                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * @param {object} [options]
 * @param {string} [options.path="/boundary-tiles"]  tile อยู่ที่ {path}/{z}/{x}/{y}
 * @param {string} [options.fontsPath="/boundary-fonts"]  glyph อยู่ที่ {fontsPath}/{fontstack}/{start}-{end}.pbf
 * @param {object} [options.boundary]  ส่งต่อให้ createBoundaryTiles()
 * @param {object} [options.glyphs]  ส่งต่อให้ createGlyphs() เช่น { upstream } ของ glyph server อื่น
 * @param {typeof fetch} [options.fetch]
 * @returns {(req, res, next?) => Promise<void>}
 */
export function tileMiddleware({
  path = "/boundary-tiles",
  fontsPath = "/boundary-fonts",
  boundary = {},
  glyphs: glyphOptions = {},
  fetch = globalThis.fetch,
} = {}) {
  const tiles = createBoundaryTiles({ fetch, ...boundary });
  const glyphs = createGlyphs({ fetch, ...glyphOptions });
  const tileRe = new RegExp(`^${path}/(\\d+)/(\\d+)/(\\d+)$`);
  const fontRe = new RegExp(`^${fontsPath}/([^/]+)/(\\d+)-(\\d+)\\.pbf$`);

  const send = (res, status, body, type = "application/x-protobuf") => {
    const headers = { "Content-Type": type };
    if (status === 200 || status === 204) headers["Cache-Control"] = CACHE_CONTROL;
    res.writeHead(status, headers);
    res.end(body ?? undefined);
  };

  return async (req, res, next) => {
    const pathname = new URL(req.url, "http://x").pathname;
    try {
      let m = tileRe.exec(pathname);
      if (m) {
        const tile = await tiles(Number(m[1]), Number(m[2]), Number(m[3]));
        send(res, tile ? 200 : 204, tile && Buffer.from(tile));
        return;
      }
      m = fontRe.exec(pathname);
      if (m) {
        const start = Number(m[2]);
        if (start % 256 !== 0 || Number(m[3]) !== start + 255) return send(res, 404, null, "text/plain");
        send(res, 200, Buffer.from(await glyphs(decodeURIComponent(m[1]), start)));
        return;
      }
    } catch (err) {
      console.error(`admin-boundary ${req.url}: ${err.message}`);
      send(res, 502, null, "text/plain");
      return;
    }
    next?.();
  };
}
