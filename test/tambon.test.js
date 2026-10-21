import assert from "node:assert/strict";
import { test } from "node:test";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { createBoundaryTiles, encodeTile } from "../src/server.js";
import { chainSegments, createTambonSource, poleOfInaccessibility } from "../src/tambon.js";

// tile 13/6386/3780 อยู่แถวกรุงเทพฯ: แปลงพิกัด tile (0..4096) ↔ lng/lat
const [Z, X, Y] = [13, 6386, 3780];
const lng = (px) => ((X + px / 4096) / 2 ** Z) * 360 - 180;
const lat = (py) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * (Y + py / 4096)) / 2 ** Z))) * 180) / Math.PI;
const square = (x0, y0, x1, y1) => [[[lng(x0), lat(y0)], [lng(x1), lat(y0)], [lng(x1), lat(y1)], [lng(x0), lat(y1)], [lng(x0), lat(y0)]]];

// สองตำบลติดกัน ใช้ขอบ x = 2000 ร่วมกัน
const geojson = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { T_Name_T: "แขวงพระบรมมหาราชวัง", Shape_Area: 1550678 }, geometry: { type: "Polygon", coordinates: square(1000, 1000, 2000, 3000) } },
    { type: "Feature", properties: { T_Name_T: "ตำบลวังบูรพา", Shape_Area: 723782 }, geometry: { type: "Polygon", coordinates: square(2000, 1000, 3000, 3000) } },
  ],
};
const service = { url: "https://gis.example/arcgis/rest/services/ข้อมูล/MapServer/4", minzoom: 13, name: "T_Name_T", area: "Shape_Area" };
const okJson = (body) => ({ ok: true, status: 200, json: async () => body });

test("chainSegments ต่อ segment เป็นเส้นยาว และวงปิด", () => {
  const open = chainSegments([[[0, 0], [1, 0]], [[2, 0], [1, 0]], [[2, 0], [3, 1]]]);
  assert.deepEqual(open.map((l) => l.length), [4]);
  const loop = chainSegments([[[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [0, 0]]]);
  assert.equal(loop.length, 1);
  assert.equal(loop[0].length, 4);
});

test("poleOfInaccessibility อยู่ในรูปตัว C ไม่ใช่ช่องว่างตรงกลาง", () => {
  const c = [[[0, 0], [10, 0], [10, 2], [2, 2], [2, 8], [10, 8], [10, 10], [0, 10], [0, 0]]];
  const [x] = poleOfInaccessibility(c, 0.1);
  assert.ok(x < 2, `x = ${x}`);
});

test("ตำบล: ขอบร่วมเหลือเส้นเดียว ป้ายอยู่กลางพื้นที่ ตัดคำว่า ตำบล/แขวง และพื้นที่ใหญ่ได้ rank น้อยกว่า", async () => {
  const urls = [];
  const source = createTambonSource(service, async (url) => {
    urls.push(String(url));
    return okJson(geojson);
  });
  const { lines, labels } = await source(Z, X, Y, 4096);

  // ขอบทั้งหมด 7 ด้าน (ขอบร่วม x=2000 นับครั้งเดียว) ยาวรวม 1000*4 + 2000*3 = 10000 หน่วย
  const length = lines.flatMap((l) => l.slice(1).map((p, i) => Math.hypot(p[0] - l[i][0], p[1] - l[i][1]))).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(length - 10000) < 10, `ยาว ${length}`);
  const shared = lines.flatMap((l) => l.slice(1).map((p, i) => [l[i], p])).filter(([a, b]) => Math.abs(a[0] - 2000) <= 1 && Math.abs(b[0] - 2000) <= 1);
  assert.equal(shared.length, 1, "ขอบร่วมต้องมีเส้นเดียว");

  assert.deepEqual(labels.map((l) => l.name), ["พระบรมมหาราชวัง", "วังบูรพา"]);
  assert.ok(Math.abs(labels[0].point[0] - 1500) < 20 && Math.abs(labels[0].point[1] - 2000) < 20);
  assert.ok(labels[0].rank < labels[1].rank);

  // query: ชื่อ service ภาษาไทยถูก encode, ขอแบบไม่ย่อจุด, ผลเป็น GeoJSON
  const q = new URL(urls[0]);
  assert.ok(q.pathname.includes(encodeURIComponent("ข้อมูล")));
  assert.equal(q.searchParams.get("f"), "geojson");
  assert.equal(q.searchParams.get("maxAllowableOffset"), null);
});

test("createBoundaryTiles: ซูม 13 ใช้ตำบลของ GISTDA แทนเส้นตำบลของ OSM และถ้า GISTDA ล่ม tile ยังมาและไม่ถูก cache", async () => {
  const ofm = encodeTile([
    {
      name: "boundary",
      features: [
        { type: "line", properties: { admin_level: 8, maritime: 0 }, geometry: [[[0, 100], [4000, 100]]] }, // ตำบลของ OSM
        { type: "line", properties: { admin_level: 6, maritime: 0 }, geometry: [[[0, 4000], [4000, 4000]]] },
      ],
    },
  ]);
  let gistdaUp = true;
  let gistdaCalls = 0;
  const fetch = async (url) => {
    const u = String(url);
    if (u.endsWith("/planet")) return okJson({ tiles: ["https://tiles.example/{z}/{x}/{y}.pbf"] });
    if (u.startsWith("https://tiles.example/")) {
      return { ok: true, status: 200, arrayBuffer: async () => ofm.buffer.slice(ofm.byteOffset, ofm.byteOffset + ofm.byteLength) };
    }
    gistdaCalls++;
    return gistdaUp ? okJson(geojson) : { ok: false, status: 503 };
  };
  // ไม่ตัดตามขอบประเทศในการทดสอบนี้ (ทั้ง tile อยู่ในพื้นที่)
  const all = { type: "Polygon", coordinates: [[[90, 0], [110, 0], [110, 20], [90, 20], [90, 0]]] };

  const read = (buf) => new VectorTile(new Pbf(buf)).layers;
  const tiles = createBoundaryTiles({ within: all, tambon: service, fetch });
  const layers = read(await tiles(Z, X, Y));
  const byLevel = {};
  for (let i = 0; i < layers.boundary.length; i++) {
    const f = layers.boundary.feature(i);
    byLevel[f.properties.admin_level] = f.loadGeometry();
  }
  assert.ok(byLevel[6], "เส้นอำเภอของ OSM ยังอยู่");
  assert.ok(byLevel[8].every((line) => line.every((p) => p.y !== 100)), "เส้นตำบลของ OSM ถูกแทนที่");
  const names = Array.from({ length: layers.label.length }, (_, i) => layers.label.feature(i).properties);
  assert.deepEqual(names.map((p) => [p.level, p.name]), [["Tambon", "พระบรมมหาราชวัง"], ["Tambon", "วังบูรพา"]]);

  // GISTDA ล่ม: ยังได้ tile (ไม่มีตำบล) และไม่ cache จึงลองใหม่ครั้งหน้า
  const log = console.error;
  console.error = () => {};
  try {
    gistdaUp = false;
    const t2 = createBoundaryTiles({ within: all, tambon: service, fetch });
    const l2 = read(await t2(Z, X, Y));
    assert.equal(l2.label, undefined);
    const before = gistdaCalls;
    await t2(Z, X, Y);
    assert.equal(gistdaCalls, before + 1);
  } finally {
    console.error = log;
  }
});

test("createBoundaryTiles: ซูมต่ำกว่า minzoom ไม่เรียก GISTDA", async () => {
  let gistda = 0;
  const empty = encodeTile([{ name: "boundary", features: [{ type: "line", properties: { admin_level: 4, maritime: 0 }, geometry: [[[0, 0], [10, 10]]] }] }]);
  const fetch = async (url) => {
    const u = String(url);
    if (u.endsWith("/planet")) return okJson({ tiles: ["https://tiles.example/{z}/{x}/{y}.pbf"] });
    if (u.startsWith("https://tiles.example/")) return { ok: true, status: 200, arrayBuffer: async () => empty.buffer.slice(empty.byteOffset, empty.byteOffset + empty.byteLength) };
    gistda++;
    return okJson(geojson);
  };
  const all = { type: "Polygon", coordinates: [[[-180, -80], [180, -80], [180, 80], [-180, 80], [-180, -80]]] };
  await createBoundaryTiles({ within: all, tambon: service, fetch })(12, 3193, 1890);
  assert.equal(gistda, 0);
});
