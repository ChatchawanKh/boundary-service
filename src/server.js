// ฝั่ง server (Node 18+): ทำ tile ขอบเขตการปกครองของไทยจากข้อมูล GISTDA (กรมการปกครอง)
//
//   /boundary-tiles/{z}/{x}/{y}            layer "boundary"  เส้น admin_level 4/6/8 = จังหวัด/อำเภอ/ตำบล
//                                          layer "label"     จุดชื่อ field level = Province | Amphoe | Tambon
//   /boundary-fonts/{fontstack}/{range}.pbf glyph ของป้าย (Kanit จาก fonts/ ที่เหลือส่งต่อ upstream)
//
// ข้อมูลโหลดจาก ArcGIS MapServer ของ GISTDA ครั้งเดียว (มี cache บนดิสก์) แล้วตัด tile จากหน่วยความจำ
// วิธีสร้างเส้นและป้ายอยู่ใน src/gistda.js
//
// ใช้:  tileMiddleware() เป็น middleware แบบ connect (req, res, next)
//       Vite: server.middlewares.use(tileMiddleware())   Express: app.use(tileMiddleware())

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Pbf from "pbf";
import { OPENFREEMAP_GLYPHS } from "./config.js";
import { buildAdminIndexAsync, createTileBuilder, loadAdminData } from "./gistda.js";

// glyph ที่มากับ package (สร้างด้วย scripts/build-glyphs.mjs) เช่น fonts/Kanit Regular/0-255.pbf
const FONTS_DIR = fileURLToPath(new URL("../fonts/", import.meta.url));

const MAX_ZOOM = 14; // source ฝั่งหน้าเว็บมีถึง z14 ซูมเกินนั้น MapLibre ขยายเอง
const CACHE_SIZE = 2000;
// tile: ให้เบราว์เซอร์ถามทุกครั้ง (ได้ 304 ถ้าไม่เปลี่ยน) ข้อมูลหรือโค้ดเปลี่ยนแล้วรีสตาร์ต เห็นของใหม่ทันที
// ไม่ค้าง tile เก่าจากรุ่นก่อนที่ URL เดียวกัน · glyph ไม่เปลี่ยนตามข้อมูล cache ได้นาน
const TILE_CACHE_CONTROL = "no-cache";
const GLYPH_CACHE_CONTROL = "public, max-age=86400";
const RETRY_AFTER = 60 * 1000; // โหลดข้อมูลไม่สำเร็จ รอเท่านี้ก่อนลองใหม่

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
    const keys = new Map();
    const values = new Map(); // `${typeof}:${value}` → index
    const valueList = [];
    const encoded = [];
    for (const f of layer.features) {
      const geometry = encodeGeometry(f.type, f.geometry);
      if (!geometry.length) continue;
      const tags = [];
      for (const [k, v] of Object.entries(f.properties)) {
        if (!keys.has(k)) keys.set(k, keys.size);
        const vk = `${typeof v}:${v}`;
        if (!values.has(vk)) {
          values.set(vk, valueList.length);
          valueList.push(v);
        }
        tags.push(keys.get(k), values.get(vk));
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
      for (const k of keys.keys()) p.writeStringField(3, k);
      for (const v of valueList) {
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
 * @param {object} [options]  ส่งต่อให้ loadAdminData(): { service, cacheDir, maxAge, concurrency }
 * @param {Function} [options.load]  แทนตัวโหลดข้อมูล (ใช้ใน test) คืน { provinces, amphoes, tambons }
 * @param {object} [options.minzoom]  ซูมต่ำสุดที่ใส่แต่ละระดับลงใน tile (ค่าเริ่มต้น SERVER_MINZOOM)
 * @param {typeof fetch} [options.fetch]
 * @returns {((z: number, x: number, y: number) => Promise<Uint8Array|null>) & { ready: () => Promise<object> }}
 *   null = tile ว่าง · ready() รอโหลดและสร้างเครือข่ายเส้นเสร็จ คืนสถิติ
 */
export function createBoundaryTiles({ load, minzoom, fetch = globalThis.fetch, ...loadOptions } = {}) {
  const cache = new Map();
  let building = null;
  let failedAt = 0;

  // โหลดครั้งแรกที่มีคนขอ tile (หรือเรียก ready()) ถ้าพังให้ลองใหม่หลัง RETRY_AFTER
  const ready = () => {
    if (!building && Date.now() - failedAt > RETRY_AFTER) {
      const started = Date.now();
      building = (load ? load() : loadAdminData({ fetch, ...loadOptions }))
        .then(async (data) => {
          const index = await buildAdminIndexAsync(data, loadOptions.service?.fields);
          return { tile: createTileBuilder(index, minzoom), stats: { ...index.stats, ms: Date.now() - started, builtAt: Date.now() } };
        })
        .catch((err) => {
          building = null;
          failedAt = Date.now();
          throw err;
        });
    }
    return building ?? Promise.reject(new Error("admin-boundary: โหลดข้อมูลไม่สำเร็จ รอลองใหม่"));
  };

  const tiles = async (z, x, y) => {
    if (z > MAX_ZOOM) return null;
    const key = `${z}/${x}/${y}`;
    if (cache.has(key)) return cache.get(key);
    const { tile } = await ready();
    const { boundary, label } = tile(z, x, y);
    const buf = encodeTile([
      { name: "boundary", features: boundary },
      { name: "label", features: label },
    ]);
    cache.set(key, buf);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
    return buf;
  };
  tiles.ready = async () => (await ready()).stats;
  return tiles;
}

/* -------------------------------------------------------------------------- */
/* glyph ของป้าย                                                              */
/* -------------------------------------------------------------------------- */

/**
 * glyph (.pbf) สำหรับป้าย: fontstack ที่มากับ package (เช่น "Kanit Regular") อ่านจากไฟล์
 * ที่เหลือ (เช่นฟอนต์ของแผนที่ฐาน) ส่งต่อไป upstream
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
 * @param {object} [options.boundary]  ส่งต่อให้ createBoundaryTiles() เช่น { cacheDir, service }
 * @param {object} [options.glyphs]  ส่งต่อให้ createGlyphs() เช่น { upstream } ของแผนที่ฐานอื่น
 * @param {boolean} [options.preload=true]  เริ่มโหลดข้อมูลทันที ไม่ต้องรอคนแรกขอ tile
 * @param {typeof fetch} [options.fetch]
 * @returns {((req, res, next?) => Promise<void>) & { ready: () => Promise<object> }}
 */
export function tileMiddleware({
  path = "/boundary-tiles",
  fontsPath = "/boundary-fonts",
  boundary = {},
  glyphs: glyphOptions = {},
  preload = true,
  fetch = globalThis.fetch,
} = {}) {
  const tiles = createBoundaryTiles({ fetch, ...boundary });
  const glyphs = createGlyphs({ fetch, ...glyphOptions });
  const tileRe = new RegExp(`^${path}/(\\d+)/(\\d+)/(\\d+)$`);
  const fontRe = new RegExp(`^${fontsPath}/([^/]+)/(\\d+)-(\\d+)\\.pbf$`);

  if (preload) {
    tiles
      .ready()
      .then((s) => console.log(`admin-boundary: พร้อม ${s.tambons} ตำบล ${s.lines} เส้น (${(s.ms / 1000).toFixed(1)} วินาที)`))
      .catch((err) => console.error(`admin-boundary: โหลดข้อมูล GISTDA ไม่สำเร็จ: ${err.message}`));
  }

  const send = (res, status, body, type = "application/x-protobuf", extra = {}) => {
    res.writeHead(status, { "Content-Type": type, ...extra });
    res.end(body ?? undefined);
  };

  const handler = async (req, res, next) => {
    const pathname = new URL(req.url, "http://x").pathname;
    try {
      let m = tileRe.exec(pathname);
      if (m) {
        // ETag = เวลาที่สร้างเครือข่ายเส้น: รีสตาร์ตหรือโหลดข้อมูลใหม่แล้วทุก tile เปลี่ยน
        const etag = `"${(await tiles.ready()).builtAt.toString(36)}"`;
        const cacheHeaders = { "Cache-Control": TILE_CACHE_CONTROL, ETag: etag };
        if (req.headers?.["if-none-match"] === etag) return send(res, 304, null, undefined, cacheHeaders);
        const tile = await tiles(Number(m[1]), Number(m[2]), Number(m[3]));
        send(res, tile ? 200 : 204, tile && Buffer.from(tile), undefined, cacheHeaders);
        return;
      }
      m = fontRe.exec(pathname);
      if (m) {
        const start = Number(m[2]);
        if (start % 256 !== 0 || Number(m[3]) !== start + 255) return send(res, 404, null, "text/plain");
        send(res, 200, Buffer.from(await glyphs(decodeURIComponent(m[1]), start)), undefined, { "Cache-Control": GLYPH_CACHE_CONTROL });
        return;
      }
    } catch (err) {
      console.error(`admin-boundary ${req.url}: ${err.message}`);
      send(res, 502, null, "text/plain");
      return;
    }
    next?.();
  };
  handler.ready = tiles.ready;
  return handler;
}
