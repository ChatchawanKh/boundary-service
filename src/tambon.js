// ฝั่ง server: เส้นและป้ายระดับตำบลจาก ArcGIS MapServer ของ GISTDA (ข้อมูลกรมการปกครอง)
//
// service ส่งตำบลเป็น polygon เต็มรูป (ไม่ตัดตามกรอบ) ถ้าวาดขอบของทุก polygon ตรงๆ ขอบที่สองตำบลใช้ร่วมกัน
// จะถูกวาดซ้ำสองรอบในทิศสวนกัน เส้นประจะเหลื่อมกันจนดูเป็นเส้นทึบ จึง:
//   1. ขอแบบไม่ย่อจุด (maxAllowableOffset ไม่ใส่) ขอบร่วมจึงมีจุดตรงกันทุกจุด
//   2. แปลงเป็นพิกัด tile แบบจำนวนเต็ม แล้วเก็บ segment ที่ซ้ำไว้ครั้งเดียว
//   3. ตัดตามกรอบ tile (+buffer) แล้วต่อ segment เป็นเส้นยาว เส้นประจะได้ต่อเนื่อง
// ป้ายวางที่จุดที่ "ลึก" ที่สุดของพื้นที่ (pole of inaccessibility) ใส่เฉพาะ tile ที่จุดนั้นตกอยู่

const BUFFER = 256; // หน่วยพิกัด tile (extent 4096) ที่เก็บเส้นเกินขอบ tile
const NAME_PREFIX = /^(ตำบล|แขวง)\s*/;

const mercX = (lng) => (lng + 180) / 360;
const mercY = (lat) => {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
};
const tileLng = (x, z) => (x / 2 ** z) * 360 - 180;
const tileLat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

/* -------------------------------------------------------------- จุดวางป้าย */

function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return Math.abs(sum / 2);
}

// ระยะจากจุดถึงขอบ polygon: บวก = อยู่ข้างใน
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

/** จุดภายใน polygon ที่ห่างขอบมากที่สุด (ค้นแบบแบ่งช่อง ละเอียดถึง precision) */
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
  const queue = [];
  for (let x = minX; x < maxX; x += size) {
    for (let y = minY; y < maxY; y += size) queue.push(cell(x + size / 2, y + size / 2, size / 2));
  }
  let best = cell((minX + maxX) / 2, (minY + maxY) / 2, 0);
  while (queue.length) {
    // ช่องที่มีโอกาสดีที่สุดก่อน (จำนวนช่องไม่มาก จึงเรียงเอาแทน heap)
    queue.sort((a, b) => a.max - b.max);
    const c = queue.pop();
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    const h = c.h / 2;
    queue.push(cell(c.x - h, c.y - h, h), cell(c.x + h, c.y - h, h), cell(c.x - h, c.y + h, h), cell(c.x + h, c.y + h, h));
  }
  return [best.x, best.y];
}

/* -------------------------------------------------------------- เส้น */

// Liang–Barsky: ตัด segment ให้อยู่ในกรอบ คืน null ถ้าอยู่นอกทั้งเส้น
function clipSegment([ax, ay], [bx, by], min, max) {
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
  return [
    [Math.round(ax + t0 * dx), Math.round(ay + t0 * dy)],
    [Math.round(ax + t1 * dx), Math.round(ay + t1 * dy)],
  ];
}

/** segment ที่ไม่ซ้ำ → เส้นยาว (ต่อที่จุดที่มีสอง segment มาชนกัน) */
export function chainSegments(segments) {
  const key = ([x, y]) => `${x},${y}`;
  const at = new Map();
  segments.forEach(([a, b], i) => {
    for (const p of [a, b]) {
      const k = key(p);
      if (!at.has(k)) at.set(k, []);
      at.get(k).push(i);
    }
  });
  const used = new Uint8Array(segments.length);
  const lines = [];
  const walk = (i, from) => {
    const line = [from];
    let cur = from;
    for (;;) {
      used[i] = 1;
      const [a, b] = segments[i];
      cur = key(a) === key(cur) ? b : a;
      line.push(cur);
      const next = at.get(key(cur));
      if (next.length !== 2) break; // ปลายเส้นหรือทางแยก
      const j = next.find((n) => !used[n]);
      if (j === undefined) break;
      i = j;
    }
    lines.push(line);
  };
  // เริ่มจากปลายเส้นและทางแยกก่อน แล้วค่อยวงปิดที่เหลือ
  for (const [k, list] of at) {
    if (list.length === 2) continue;
    for (const i of list) if (!used[i]) walk(i, k.split(",").map(Number));
  }
  segments.forEach(([a], i) => {
    if (!used[i]) walk(i, a);
  });
  return lines;
}

/* -------------------------------------------------------------- query */

/**
 * @param {object} service  { url, name, area } (ค่าเริ่มต้น GISTDA_TAMBON_SERVICE ใน config.js)
 * @param {typeof fetch} fetch
 * @returns {(z, x, y, extent) => Promise<{ lines: number[][][], labels: { point: number[], name: string, rank: number }[] }>}
 */
export function createTambonSource(service, fetch) {
  return async (z, x, y, extent) => {
    const pad = 1 / 16; // ขอเกินกรอบเล็กน้อยให้ครอบ buffer
    const bbox = [tileLng(x - pad, z), tileLat(y + 1 + pad, z), tileLng(x + 1 + pad, z), tileLat(y - pad, z)];
    const url = new URL(`${service.url}/query`); // URL แปลงชื่อ service ภาษาไทยเป็น %xx ให้เอง
    url.search = new URLSearchParams({
      where: "1=1",
      geometry: bbox.join(","),
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: `${service.name},${service.area}`,
      outSR: "4326",
      geometryPrecision: "7",
      f: "geojson",
    });
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`GISTDA tambon HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(`GISTDA tambon: ${json.error.message ?? JSON.stringify(json.error)}`);

    const n = 2 ** z;
    const toTile = ([lng, lat]) => [(mercX(lng) * n - x) * extent, (mercY(lat) * n - y) * extent];

    const seen = new Map(); // segment → [a, b] (เก็บครั้งเดียว)
    const labels = [];
    for (const f of json.features ?? []) {
      const g = f.geometry;
      if (!g) continue;
      const polygons = (g.type === "Polygon" ? [g.coordinates] : g.coordinates).map((rings) => rings.map((r) => r.map(toTile)));

      for (const rings of polygons) {
        for (const ring of rings) {
          const pts = ring.map(([px, py]) => [Math.round(px), Math.round(py)]);
          for (let i = 1; i < pts.length; i++) {
            const [a, b] = [pts[i - 1], pts[i]];
            if (a[0] === b[0] && a[1] === b[1]) continue;
            const k = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? `${a}|${b}` : `${b}|${a}`;
            if (!seen.has(k)) seen.set(k, [a, b]);
          }
        }
      }

      // ป้าย: ส่วนที่ใหญ่ที่สุดของตำบล ใส่เฉพาะ tile ที่จุดตกอยู่ (ตำบลเดียวกันโผล่หลาย tile)
      const largest = polygons.reduce((best, p) => (ringArea(p[0]) > ringArea(best[0]) ? p : best));
      const point = poleOfInaccessibility(largest, 4);
      if (point[0] < 0 || point[0] >= extent || point[1] < 0 || point[1] >= extent) continue;
      const name = String(f.properties?.[service.name] ?? "").replace(NAME_PREFIX, "").trim();
      if (!name) continue;
      const area = Number(f.properties?.[service.area]) || 1;
      // พื้นที่ใหญ่ได้วางป้ายก่อน (rank น้อย = สำคัญ)
      labels.push({ point: point.map(Math.round), name, rank: Math.max(1, Math.round(1e9 / area)) });
    }

    const clipped = [];
    for (const [a, b] of seen.values()) {
      const s = clipSegment(a, b, -BUFFER, extent + BUFFER);
      if (s && (s[0][0] !== s[1][0] || s[0][1] !== s[1][1])) clipped.push(s);
    }
    return { lines: chainSegments(clipped), labels };
  };
}
