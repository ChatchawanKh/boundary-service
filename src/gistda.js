import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ADMIN_LEVEL_CODES, GISTDA_ADMIN_SERVICE } from "./config.js";

const EXTENT = 4096;
const BUFFER = 256; // หน่วยพิกัด tile ที่เก็บเส้นเกินขอบ tile
const TILE_SIZE = 512; // px ต่อ tile ของ MapLibre (ใช้คิดค่าความคลาดเคลื่อนตอนย่อจุด)
const TOLERANCE_PX = 0.5;

// ซูมต่ำสุดที่ server ใส่ข้อมูลแต่ละระดับลงใน tile (ต่ำกว่าเกณฑ์การแสดงผลฝั่งหน้าเว็บ เผื่อปรับ minzoom เอง)
export const SERVER_MINZOOM = Object.freeze({ Province: 0, Amphoe: 6, Tambon: 10 });

const PREFIX = Object.freeze({
  Province: /^จังหวัด\s*/,
  Amphoe: /^(อำเภอ|อำเภ|เขต)\s*/, // ข้อมูลมี "อำเภเมืองบึงกาฬ" สะกดผิด
  Tambon: /^(ตำบล|แขวง)\s*/,
});

const mercX = (lng) => (lng + 180) / 360;
const mercY = (lat) => {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
};

/* -------------------------------------------------------------- เรขาคณิต */

function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return Math.abs(sum / 2);
}

function signedDistance(x, y, polygon) {
  let inside = false;
  let min = Infinity;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[j];
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
      const dx = bx - ax;
      const dy = by - ay;
      const len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
      min = Math.min(min, (ax + t * dx - x) ** 2 + (ay + t * dy - y) ** 2);
    }
  }
  return (inside ? 1 : -1) * Math.sqrt(min);
}

/** จุดภายใน polygon ที่ห่างขอบมากที่สุด (pole of inaccessibility) */
export function poleOfInaccessibility(polygon, precision = 1) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of polygon[0]) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const size = Math.min(maxX - minX, maxY - minY);
  if (!(size > 0)) return [minX, minY];
  const cell = (x, y, h) => {
    const d = signedDistance(x, y, polygon);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };

  // max-heap ตาม max: ช่องที่มีโอกาสดีที่สุดก่อน
  const heap = [];
  const push = (c) => {
    heap.push(c);
    for (let i = heap.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (heap[p].max >= heap[i].max) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].max > heap[m].max) m = l;
        if (r < heap.length && heap[r].max > heap[m].max) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  for (let x = minX; x < maxX; x += size) {
    for (let y = minY; y < maxY; y += size) push(cell(x + size / 2, y + size / 2, size / 2));
  }
  let best = cell((minX + maxX) / 2, (minY + maxY) / 2, 0);
  while (heap.length) {
    const c = pop();
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    const h = c.h / 2;
    push(cell(c.x - h, c.y - h, h));
    push(cell(c.x + h, c.y - h, h));
    push(cell(c.x - h, c.y + h, h));
    push(cell(c.x + h, c.y + h, h));
  }
  return [best.x, best.y];
}

/** Douglas–Peucker บน [x0, y0, x1, y1, ...] ปลายเส้นคงที่ */
export function simplify(coords, tolerance) {
  const n = coords.length / 2;
  if (n <= 2 || !(tolerance > 0)) return coords;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const tol2 = tolerance * tolerance;
  const stack = [0, n - 1];
  while (stack.length) {
    const last = stack.pop();
    const first = stack.pop();
    const [ax, ay, bx, by] = [coords[2 * first], coords[2 * first + 1], coords[2 * last], coords[2 * last + 1]];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = first + 1; i < last; i++) {
      const px = coords[2 * i];
      const py = coords[2 * i + 1];
      let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
      t = Math.max(0, Math.min(1, t));
      const d = (ax + t * dx - px) ** 2 + (ay + t * dy - py) ** 2;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol2) {
      keep[idx] = 1;
      stack.push(first, idx, idx, last);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(coords[2 * i], coords[2 * i + 1]);
  return out;
}

// Liang–Barsky: ตัดเส้นตรงให้อยู่ในกรอบ คืน null ถ้าอยู่นอกทั้งเส้น
function clipSegment(ax, ay, bx, by, min, max) {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, q] of [[-dx, ax - min], [dx, max - ax], [-dy, ay - min], [dy, max - ay]]) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return null;
    }
  }
  return [ax + t0 * dx, ay + t0 * dy, ax + t1 * dx, ay + t1 * dy, t0 > 0, t1 < 1];
}

/** เส้น (พิกัด tile แบบทศนิยม) → ส่วนที่อยู่ในกรอบ เป็นจำนวนเต็ม */
function clipLine(pts, min, max) {
  const parts = [];
  let cur = null;
  for (let i = 2; i < pts.length; i += 2) {
    const c = clipSegment(pts[i - 2], pts[i - 1], pts[i], pts[i + 1], min, max);
    if (!c) {
      if (cur) parts.push(cur);
      cur = null;
      continue;
    }
    const [x0, y0, x1, y1, enteredLate, leftEarly] = c;
    if (!cur || enteredLate) {
      if (cur) parts.push(cur);
      cur = [[Math.round(x0), Math.round(y0)]];
    }
    cur.push([Math.round(x1), Math.round(y1)]);
    if (leftEarly) {
      parts.push(cur);
      cur = null;
    }
  }
  if (cur) parts.push(cur);
  return parts.filter((p) => p.length >= 2);
}

/* -------------------------------------------------------------- สร้างเครือข่ายเส้น */

const polygonsOf = (g) => (!g ? [] : g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []);

function labelOf(feature, level, nameField, areaField) {
  const polygons = polygonsOf(feature.geometry).map((rings) => rings.map((r) => r.map(([lng, lat]) => [mercX(lng) * 1e6, mercY(lat) * 1e6])));
  if (!polygons.length) return null;
  const name = String(feature.properties?.[nameField] ?? "").replace(PREFIX[level], "").trim();
  if (!name) return null;
  const largest = polygons.reduce((best, p) => (ringArea(p[0]) > ringArea(best[0]) ? p : best));
  // แม่นยำราว 1% ของขนาดพื้นที่ (ไม่ต่ำกว่า 0.2e-6 ของโลก ≈ 8 ม.) พอสำหรับวางป้าย
  // ย่อจุดของขอบก่อน (ระยะถึงขอบคำนวณทุกช่องที่ตรวจ ขอบที่มีหลายพันจุดจึงช้ามาก)
  const [x0, y0, x1, y1] = largest[0].reduce(([a, b, c, d], [x, y]) => [Math.min(a, x), Math.min(b, y), Math.max(c, x), Math.max(d, y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const precision = Math.max(0.2, Math.min(x1 - x0, y1 - y0) / 100);
  const coarse = largest.map((ring) => {
    const flat = simplify(ring.flat(), precision / 2);
    const out = [];
    for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
    return out;
  });
  const [x, y] = poleOfInaccessibility(coarse.every((r) => r.length >= 4) ? coarse : largest, precision);
  const area = Number(feature.properties?.[areaField]) || 1;
  return { level, name, x: x / 1e6, y: y / 1e6, rank: Math.max(1, Math.round(1e9 / area)) };
}

// ตาราง hash แบบ open addressing: key เป็นจำนวนเต็มบวก (< 2^53) → ค่า int32
// ข้อมูลทั้งประเทศมีราว 3 ล้านจุดและ 3 ล้านขอบ Map ปกติกินหน่วยความจำหลาย GB
class NumberMap {
  constructor(capacity = 1 << 16) {
    this.keys = new Float64Array(capacity).fill(-1);
    this.values = new Int32Array(capacity);
    this.size = 0;
  }
  slot(k) {
    const mask = this.keys.length - 1;
    let h = Math.imul((k % 4294967296) ^ Math.imul((k / 4294967296) | 0, 0x9e3779b1), 0x85ebca6b);
    h ^= h >>> 13;
    let i = Math.imul(h, 0xc2b2ae35) & mask;
    while (this.keys[i] !== -1 && this.keys[i] !== k) i = (i + 1) & mask;
    return i;
  }
  get(k) {
    const i = this.slot(k);
    return this.keys[i] === -1 ? -1 : this.values[i];
  }
  set(k, v) {
    if (this.size * 2 >= this.keys.length) this.grow();
    const i = this.slot(k);
    if (this.keys[i] === -1) this.size++;
    this.keys[i] = k;
    this.values[i] = v;
  }
  grow() {
    const { keys, values } = this;
    this.keys = new Float64Array(keys.length * 2).fill(-1);
    this.values = new Int32Array(keys.length * 2);
    this.size = 0;
    for (let i = 0; i < keys.length; i++) if (keys[i] !== -1) this.set(keys[i], values[i]);
  }
}

// typed array ที่ขยายเองได้
class Growable {
  constructor(Type, capacity = 1 << 16) {
    this.Type = Type;
    this.data = new Type(capacity);
    this.length = 0;
  }
  push(v) {
    if (this.length === this.data.length) {
      const next = new this.Type(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = v;
  }
}

// พิกัด → key ตัวเลข: ปัดที่ 1e-6 องศา (≈ 11 ซม.) จุดที่สองตำบลใช้ร่วมกันมีค่าเท่ากันพอดีอยู่แล้ว
// ช่วงที่รองรับ: ลองจิจูด 90–115, ละติจูด −10–40 (key < 2^51)
function pointKey(lng, lat) {
  const x = Math.round((lng - 90) * 1e6);
  const y = Math.round((lat + 10) * 1e6);
  if (x < 0 || x >= 2 ** 25 || y < 0 || y >= 2 ** 26) throw new Error(`admin-boundary: พิกัดอยู่นอกช่วงที่รองรับ ${lng},${lat}`);
  return x * 2 ** 26 + y;
}

// ขอบร่วมที่สองตำบลวาดจุดไม่ตรงกันในข้อมูลห่างกันไม่เกินราว 2 ม. ส่วนชายฝั่งที่หันเข้าหากันห่างเกิน 20 ม.
const MISMATCH_METERS = 5;
const EARTH_CIRCUMFERENCE = 40075016.686;

/**
 * ขอบฝั่งเดียวแต่ละเส้น → ตำบลอื่นที่มีขอบฝั่งเดียวอยู่ห่างจากกึ่งกลางขอบไม่เกิน MISMATCH_METERS (ใกล้สุด) หรือ -1
 * พิกัด Web Mercator 0–1: ระยะบนพื้นที่ละติจูด φ = ระยะ mercator × เส้นรอบโลก × cos φ
 */
function pairMismatched(edges, A, B, X, Y, owner) {
  const CELL = 2e-6; // ≈ 80 ม. ใหญ่กว่าระยะที่หามาก ดูแค่ 3×3 ช่องรอบกึ่งกลางก็พอ
  const cellKey = (cx, cy) => cx * 2 ** 20 + cy;
  const grid = new Map();
  for (const e of edges) {
    const [ax, ay, bx, by] = [X[A[e]], Y[A[e]], X[B[e]], Y[B[e]]];
    for (let cx = Math.floor(Math.min(ax, bx) / CELL); cx <= Math.floor(Math.max(ax, bx) / CELL); cx++) {
      for (let cy = Math.floor(Math.min(ay, by) / CELL); cy <= Math.floor(Math.max(ay, by) / CELL); cy++) {
        const k = cellKey(cx, cy);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(e);
      }
    }
  }

  // ปลายสายขอบฝั่งเดียวของแต่ละตำบล (จุดที่ขอบฝั่งเดียวของตำบลนั้นมาถึงเส้นเดียว) เช่น จุดที่ชายฝั่งของสองตำบลมาบรรจบกัน
  // ขอบชายฝั่งช่วงสั้นๆ ข้างจุดนั้นอยู่ใกล้ชายฝั่งของตำบลข้างๆ แต่ไม่ใช่ขอบร่วม: ใกล้สุดที่ปลายสายจึงไม่นับ
  const degree = new Map();
  const vertexOf = (v, t) => v * 2 ** 16 + t;
  for (const e of edges) {
    for (const v of [A[e], B[e]]) degree.set(vertexOf(v, owner[e]), (degree.get(vertexOf(v, owner[e])) ?? 0) + 1);
  }
  const chainEnd = (v, t) => degree.get(vertexOf(v, t)) === 1;

  const partner = new Int32Array(edges.length).fill(-1);
  edges.forEach((e, i) => {
    const mx = (X[A[e]] + X[B[e]]) / 2;
    const my = (Y[A[e]] + Y[B[e]]) / 2;
    const cosLat = 1 / Math.cosh(Math.PI * (1 - 2 * my));
    let best = (MISMATCH_METERS / (EARTH_CIRCUMFERENCE * cosLat)) ** 2;
    const [cx, cy] = [Math.floor(mx / CELL), Math.floor(my / CELL)];
    for (let i2 = -1; i2 <= 1; i2++) {
      for (let j = -1; j <= 1; j++) {
        for (const o of grid.get(cellKey(cx + i2, cy + j)) ?? []) {
          if (owner[o] === owner[e]) continue;
          const [ax, ay] = [X[A[o]], Y[A[o]]];
          const [dx, dy] = [X[B[o]] - ax, Y[B[o]] - ay];
          const len = dx * dx + dy * dy;
          const t = len ? Math.max(0, Math.min(1, ((mx - ax) * dx + (my - ay) * dy) / len)) : 0;
          if ((t === 0 && chainEnd(A[o], owner[o])) || (t === 1 && chainEnd(B[o], owner[o]))) continue;
          const d = (ax + t * dx - mx) ** 2 + (ay + t * dy - my) ** 2;
          if (d <= best) {
            best = d;
            partner[i] = owner[o];
          }
        }
      }
    }
  });
  return partner;
}

/**
 * ตัวสร้างเครือข่ายเส้นแบบเติมทีละชุด (อ่านตำบลทีละจังหวัด ไม่ต้องถือข้อมูลทั้งประเทศไว้พร้อมกัน)
 * @param {object} [fields]  ชื่อ field (ค่าเริ่มต้นจาก GISTDA_ADMIN_SERVICE.fields)
 */
export function createIndexBuilder(fields = GISTDA_ADMIN_SERVICE.fields) {
  const nodeIds = new NumberMap(1 << 20);
  const nx = new Growable(Float64Array, 1 << 20);
  const ny = new Growable(Float64Array, 1 << 20);
  const node = (lng, lat) => {
    const k = pointKey(lng, lat);
    let id = nodeIds.get(k);
    if (id < 0) {
      id = nx.length;
      nodeIds.set(k, id);
      nx.push(mercX(lng));
      ny.push(mercY(lat));
    }
    return id;
  };

  // ขอบ: key = (id น้อย, id มาก) → เจ้าของ (ตำบล) สองฝั่ง
  const edgeIds = new NumberMap(1 << 20);
  const ea = new Growable(Int32Array, 1 << 20);
  const eb = new Growable(Int32Array, 1 << 20);
  const owner1 = new Growable(Int32Array, 1 << 20);
  const owner2 = new Growable(Int32Array, 1 << 20);
  const tProvince = [];
  const tAmphoe = [];
  const tambonLabels = [];

  return {
    /** เติมตำบลหนึ่งชุด (FeatureCollection) */
    add(fc) {
      for (const f of fc.features ?? []) {
        const t = tProvince.length;
        const p = String(f.properties?.[fields.provinceCode] ?? "");
        tProvince.push(p);
        tAmphoe.push(`${p}/${f.properties?.[fields.amphoeCode] ?? ""}`);
        const label = labelOf(f, "Tambon", fields.tambonName, fields.tambonArea);
        if (label) tambonLabels.push(label);
        for (const rings of polygonsOf(f.geometry)) {
          for (const ring of rings) {
            let prev = node(ring[0][0], ring[0][1]);
            for (let i = 1; i < ring.length; i++) {
              const cur = node(ring[i][0], ring[i][1]);
              if (cur !== prev) {
                const [a, b] = prev < cur ? [prev, cur] : [cur, prev];
                const k = a * 2 ** 23 + b;
                const e = edgeIds.get(k);
                if (e < 0) {
                  edgeIds.set(k, ea.length);
                  ea.push(a);
                  eb.push(b);
                  owner1.push(t);
                  owner2.push(-1);
                } else if (owner2.data[e] === -1 && owner1.data[e] !== t) {
                  owner2.data[e] = t;
                }
              }
              prev = cur;
            }
          }
        }
      }
      if (nx.length >= 2 ** 23) throw new Error("admin-boundary: จุดเกิน 8 ล้านจุด ต้องขยาย key ของขอบ");
    },

    /** ทำเส้นของแต่ละระดับ และป้ายจังหวัด/อำเภอ */
    finish({ provinces, amphoes }) {
      const E = ea.length;
      const A = ea.data;
      const B = eb.data;
      const X = nx.data;
      const Y = ny.data;
      const N = nx.length;
      const { Province, Amphoe, Tambon } = ADMIN_LEVEL_CODES;

      // ระดับที่หยาบที่สุดที่ขอบนี้เป็นเส้นแบ่ง: ขอบนอก (ชายฝั่ง/ชายแดน มีตำบลฝั่งเดียว) เป็นขอบของทุกระดับ
      const OUTER = 0;
      const split = new Uint8Array(E);
      const classify = (s1, s2) => (tProvince[s1] !== tProvince[s2] ? Province : tAmphoe[s1] !== tAmphoe[s2] ? Amphoe : Tambon);
      const oneSided = [];
      for (let e = 0; e < E; e++) {
        const s2 = owner2.data[e];
        if (s2 === -1) oneSided.push(e);
        else split[e] = classify(owner1.data[e], s2);
      }

      // ขอบฝั่งเดียวที่มีขอบฝั่งเดียวของตำบลอื่นอยู่ใกล้ = ขอบร่วมที่สองตำบลวาดจุดไม่ตรงกัน (เช่น หางดง–เมืองเชียงใหม่ ห่างกัน 1–2 ม.)
      // จำแนกจากสองตำบลนั้น ไม่ใช่ขอบนอก ไม่งั้นกลายเป็นเส้นจังหวัดกลางอำเภอ
      // ชายฝั่งจริงที่หันหน้าเข้าหากันข้ามช่องแคบห่างกันเกิน 20 ม. จึงไม่ถูกจับคู่
      const partner = pairMismatched(oneSided, A, B, X, Y, owner1.data);
      let outer = 0;
      let mismatched = 0;
      for (let i = 0; i < oneSided.length; i++) {
        const e = oneSided[i];
        if (partner[i] < 0) {
          split[e] = OUTER;
          outer++;
        } else {
          split[e] = classify(owner1.data[e], partner[i]);
          mismatched++;
        }
      }

      // เส้นของระดับ lv = ขอบที่แบ่งพื้นที่ระดับนั้นหรือหยาบกว่า + ขอบนอก
      // เช่น ตำบล = ขอบทุกเส้นของ layer ตำบล, อำเภอ = ขอบระหว่างอำเภอ/จังหวัด + ขอบนอก
      // แต่ละระดับจึงมีขอบครบรอบทุกพื้นที่ ปิดระดับอื่นแล้วไม่ขาด (เส้นที่ทับกันวาดซ้อนตามลำดับชั้น)
      const lines = [];
      const start = new Int32Array(N + 1);
      const used = new Uint8Array(E);

      // ตรงที่ชายฝั่ง/ชายแดนของสองตำบลมาบรรจบกันแบบจุดไม่ตรงกัน ขอบที่จับคู่บางช่วงเป็นตัวเชื่อมเส้นนอก
      // ปลายเส้นของระดับนั้นที่ไม่มีอะไรต่อ ให้ต่อไปตามขอบที่จับคู่จนชนเส้นอื่น เส้นจึงไม่ขาด
      const pairedAt = new Map();
      for (let i = 0; i < oneSided.length; i++) {
        if (partner[i] < 0) continue;
        const e = oneSided[i];
        for (const v of [A[e], B[e]]) {
          if (!pairedAt.has(v)) pairedAt.set(v, []);
          pairedAt.get(v).push(e);
        }
      }
      const degree = new Int32Array(N);
      const reconnect = (lv) => {
        degree.fill(0);
        for (let e = 0; e < E; e++) {
          if (split[e] > lv) continue;
          degree[A[e]]++;
          degree[B[e]]++;
        }
        const added = new Set();
        const queue = [...pairedAt.keys()].filter((v) => degree[v] === 1);
        while (queue.length) {
          const v = queue.pop();
          if (degree[v] !== 1) continue;
          const e = pairedAt.get(v).find((e) => split[e] > lv && !added.has(e));
          if (e === undefined) continue;
          added.add(e);
          degree[A[e]]++;
          degree[B[e]]++;
          const w = A[e] === v ? B[e] : A[e];
          if (degree[w] === 1) queue.push(w);
        }
        return added;
      };

      for (const lv of [Province, Amphoe, Tambon]) {
        const bridges = lv === Tambon ? null : reconnect(lv);
        const keep = (e) => split[e] <= lv || !!bridges?.has(e);

        // ขอบที่แต่ละจุดต่ออยู่ (CSR) เฉพาะขอบของระดับนี้
        start.fill(0);
        for (let e = 0; e < E; e++) {
          if (!keep(e)) continue;
          start[A[e] + 1]++;
          start[B[e] + 1]++;
        }
        for (let v = 0; v < N; v++) start[v + 1] += start[v];
        const fill = start.slice(0, N);
        const adj = new Int32Array(start[N]);
        for (let e = 0; e < E; e++) {
          if (!keep(e)) continue;
          adj[fill[A[e]]++] = e;
          adj[fill[B[e]]++] = e;
        }

        // ต่อขอบเป็นเส้นยาว: ตัดที่จุดที่ไม่ได้มีสองขอบ (ปลายเส้นหรือทางแยก)
        const through = (v, e) => {
          if (start[v + 1] - start[v] !== 2) return -1;
          return adj[start[v]] === e ? adj[start[v] + 1] : adj[start[v]];
        };
        used.fill(0);
        const walk = (e, from) => {
          const coords = [X[from], Y[from]];
          let v = from;
          for (;;) {
            used[e] = 1;
            v = A[e] === v ? B[e] : A[e];
            coords.push(X[v], Y[v]);
            const next = through(v, e);
            if (next < 0 || used[next]) break;
            e = next;
          }
          lines.push(makeLine(lv, coords));
        };
        for (let v = 0; v < N; v++) {
          for (let i = start[v]; i < start[v + 1]; i++) {
            const e = adj[i];
            if (!used[e] && through(v, e) < 0) walk(e, v);
          }
        }
        for (let e = 0; e < E; e++) if (keep(e) && !used[e]) walk(e, A[e]); // วงปิด (เช่น เกาะ)
      }

      const labels = [
        ...(provinces.features ?? []).map((f) => labelOf(f, "Province", fields.provinceName, fields.provinceArea)),
        ...(amphoes.features ?? []).map((f) => labelOf(f, "Amphoe", fields.amphoeName, fields.amphoeArea)),
        ...tambonLabels,
      ].filter(Boolean);

      return { lines, labels, stats: { tambons: tProvince.length, points: N, edges: E, outerEdges: outer, mismatchedEdges: mismatched, lines: lines.length } };
    },
  };
}

/**
 * ข้อมูลสามระดับ → เส้นที่จำแนกระดับแล้ว + จุดป้าย (พิกัด Web Mercator 0..1)
 * @param {{ provinces: object, amphoes: object, tambons: object | Iterable<object> }} data
 *   FeatureCollection (WGS84) · tambons เป็น FeatureCollection เดียว หรือหลายชุด (ทีละจังหวัด) ก็ได้
 */
export function buildAdminIndex({ provinces, amphoes, tambons }, fields) {
  const builder = createIndexBuilder(fields);
  for (const fc of tambons.features ? [tambons] : tambons) builder.add(fc);
  return builder.finish({ provinces, amphoes });
}

/** เหมือน buildAdminIndex แต่ tambons เป็น async iterable ได้ด้วย (ผลของ loadAdminData) */
export async function buildAdminIndexAsync({ provinces, amphoes, tambons }, fields) {
  const builder = createIndexBuilder(fields);
  for await (const fc of tambons.features ? [tambons] : tambons) builder.add(fc);
  return builder.finish({ provinces, amphoes });
}

function makeLine(lv, coords) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < coords.length; i += 2) {
    minX = Math.min(minX, coords[i]);
    maxX = Math.max(maxX, coords[i]);
    minY = Math.min(minY, coords[i + 1]);
    maxY = Math.max(maxY, coords[i + 1]);
  }
  return { level: lv, coords: Float64Array.from(coords), bbox: [minX, minY, maxX, maxY] };
}

/* -------------------------------------------------------------- tile */

const LEVEL_NAME = Object.freeze(Object.fromEntries(Object.entries(ADMIN_LEVEL_CODES).map(([k, v]) => [v, k])));

// ซูมนี้ขึ้นไปใช้เส้นเต็มความละเอียด (tile เล็ก เส้นในแต่ละ tile น้อย) ไม่เก็บสำเนาที่ย่อแล้ว
const FULL_RES_ZOOM = 12;

/**
 * ตัว index → ฟังก์ชันทำเนื้อ tile (ซูมต่ำกว่า FULL_RES_ZOOM ย่อจุดครั้งแรกที่ใช้แล้วเก็บไว้)
 * @returns {(z, x, y) => { boundary: object[], label: object[] }}  feature สำหรับ encodeTile
 */
export function createTileBuilder(index, minzoom = SERVER_MINZOOM) {
  const byZoom = new Map();
  const linesAt = (z) => {
    if (!byZoom.has(z)) {
      const tol = TOLERANCE_PX / (TILE_SIZE * 2 ** z);
      const lines = index.lines.filter((l) => z >= minzoom[LEVEL_NAME[l.level]]);
      if (z >= FULL_RES_ZOOM) return lines;
      byZoom.set(
        z,
        lines.map((l) => ({ ...l, coords: simplify(l.coords, tol) })),
      );
    }
    return byZoom.get(z);
  };

  return (z, x, y) => {
    const n = 2 ** z;
    const pad = BUFFER / EXTENT / n;
    const [x0, y0, x1, y1] = [x / n - pad, y / n - pad, (x + 1) / n + pad, (y + 1) / n + pad];

    const grouped = new Map();
    for (const l of linesAt(z)) {
      const [a, b, c, d] = l.bbox;
      if (c < x0 || a > x1 || d < y0 || b > y1) continue;
      const pts = l.coords.map((v, i) => (i % 2 === 0 ? (v * n - x) * EXTENT : (v * n - y) * EXTENT));
      const parts = clipLine(pts, -BUFFER, EXTENT + BUFFER);
      if (!parts.length) continue;
      if (!grouped.has(l.level)) grouped.set(l.level, []);
      grouped.get(l.level).push(...parts);
    }
    const boundary = [...grouped].map(([level, lines]) => ({
      type: "line",
      properties: { admin_level: level, maritime: 0, disputed: 0 },
      geometry: lines,
    }));

    // ป้าย: เฉพาะ tile ที่จุดตกอยู่ (ไม่ซ้ำข้าม tile)
    const label = [];
    for (const l of index.labels) {
      if (z < minzoom[l.level]) continue;
      const px = (l.x * n - x) * EXTENT;
      const py = (l.y * n - y) * EXTENT;
      if (px < 0 || px >= EXTENT || py < 0 || py >= EXTENT) continue;
      label.push({ type: "point", properties: { level: l.level, name: l.name, rank: l.rank }, geometry: [[Math.round(px), Math.round(py)]] });
    }
    return { boundary, label };
  };
}

/* -------------------------------------------------------------- โหลดจาก service */

async function queryLayer(service, layer, params, fetch) {
  const url = new URL(`${service.url}/${layer}/query`); // URL แปลงชื่อ service ภาษาไทยเป็น %xx ให้เอง
  const body = new URLSearchParams({ where: "1=1", outSR: "4326", geometryPrecision: "7", f: "geojson", ...params });
  // POST: where ยาวและพารามิเตอร์เยอะ ไม่ติดความยาว URL
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`GISTDA layer ${layer} HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`GISTDA layer ${layer}: ${json.error.message ?? JSON.stringify(json.error)}`);
  return json;
}

const fresh = (file, maxAge) => existsSync(file) && Date.now() - statSync(file).mtimeMs < maxAge;

async function cached(cacheDir, name, maxAge, load) {
  const file = cacheDir && join(cacheDir, name);
  if (file && fresh(file, maxAge)) return JSON.parse(readFileSync(file, "utf8"));
  const data = await load();
  if (file) {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(file, JSON.stringify(data));
  }
  return data;
}

/**
 * ดึงข้อมูลสามระดับจาก service เก็บ cache ลงดิสก์
 * จังหวัด/อำเภอโหลดมาทั้งชุด (แบบย่อ ใช้หาจุดวางป้าย) ส่วนตำบลแบบเต็มความละเอียดคืนเป็น async iterable
 * ทีละจังหวัด ให้ตัวสร้างเส้นอ่านทีละชุดโดยไม่ต้องถือข้อมูลทั้งประเทศไว้ในหน่วยความจำ
 * @param {object} [options]
 * @param {object} [options.service]  GISTDA_ADMIN_SERVICE
 * @param {string|false} [options.cacheDir]  โฟลเดอร์ cache หรือ false = ไม่เก็บ (ดึงใหม่ทุกครั้ง)
 * @param {number} [options.maxAge]  อายุ cache (ms)
 * @param {number} [options.concurrency]  จำนวน request พร้อมกันตอนดาวน์โหลดตำบล
 * @param {typeof fetch} [options.fetch]
 * @returns {Promise<{ provinces: object, amphoes: object, tambons: AsyncIterable<object> }>}
 */
export async function loadAdminData({
  service = GISTDA_ADMIN_SERVICE,
  cacheDir = ".cache/admin-boundary",
  maxAge = 30 * 24 * 60 * 60 * 1000,
  concurrency = 4,
  fetch = globalThis.fetch,
} = {}) {
  const f = service.fields;
  const { layers } = service;

  const provinces = await cached(cacheDir, "province.json", maxAge, () =>
    queryLayer(service, layers.Province, { outFields: `${f.provinceCode},${f.provinceName},${f.provinceArea}`, maxAllowableOffset: "0.001" }, fetch),
  );
  const amphoes = await cached(cacheDir, "amphoe.json", maxAge, () =>
    queryLayer(service, layers.Amphoe, { outFields: `${f.amphoeName},${f.amphoeArea}`, maxAllowableOffset: "0.0005" }, fetch),
  );

  const codes = [...new Set(provinces.features.map((p) => String(p.properties[f.provinceCode])))].sort();
  for (const code of codes) if (!/^\d+$/.test(code)) throw new Error(`admin-boundary: รหัสจังหวัดไม่ถูกต้อง ${code}`);
  const fetchTambons = (code) =>
    queryLayer(
      service,
      layers.Tambon,
      { where: `${f.provinceCode}='${code}'`, outFields: [f.provinceCode, f.amphoeCode, f.tambonName, f.tambonArea].join(",") },
      fetch,
    );
  const fileOf = (code) => join(cacheDir, `tambon-${code}.json`);

  // มี cache: ดาวน์โหลดจังหวัดที่ยังไม่มีลงดิสก์ก่อน (พร้อมกันหลาย request) แล้วค่อยอ่านทีละไฟล์
  if (cacheDir) {
    mkdirSync(cacheDir, { recursive: true });
    const missing = codes.filter((code) => !fresh(fileOf(code), maxAge));
    let next = 0;
    const worker = async () => {
      while (next < missing.length) {
        const code = missing[next++];
        writeFileSync(fileOf(code), JSON.stringify(await fetchTambons(code)));
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker));
  }

  async function* tambons() {
    for (const code of codes) yield cacheDir ? JSON.parse(readFileSync(fileOf(code), "utf8")) : await fetchTambons(code);
  }

  return { provinces, amphoes, tambons: tambons() };
}
