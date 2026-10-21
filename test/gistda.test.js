import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { GISTDA_ADMIN_SERVICE } from "../src/config.js";
import { buildAdminIndex, buildAdminIndexAsync, createTileBuilder, loadAdminData, poleOfInaccessibility, simplify } from "../src/gistda.js";
import { adminData, amphoes, provinces, tambons, tileOf } from "./admin-fixture.js";

const ALL = { Province: 0, Amphoe: 0, Tambon: 0 };

test("แต่ละระดับได้ขอบครบรอบของพื้นที่ตัวเอง (เหมือนเปิด layer นั้นตรงๆ) ขอบร่วมในระดับเดียวกันวาดครั้งเดียว", () => {
  const index = buildAdminIndex(adminData);
  const of = (lv) => index.lines.filter((l) => l.level === lv);
  const segments = (lines) => lines.reduce((n, l) => n + l.coords.length / 2 - 1, 0);
  const xs = (l) => [...l.coords].filter((_, i) => i % 2 === 0);
  const vertical = (lines, lng) => lines.filter((l) => xs(l).every((x) => Math.abs(x * 360 - 180 - lng) < 1e-9));

  // ขอบนอกของทั้งสี่ตำบล (ล่าง/บน/ซ้ายสุด/ขวาสุด) 3 + 2 + 2 + 3 ช่วง
  assert.equal(index.stats.outerEdges, 10);

  // ตำบล: ขอบทุกเส้นของ layer ตำบล ครบทุกช่วงพอดี ไม่ซ้ำ
  assert.equal(segments(of(8)), index.stats.edges);
  assert.equal(vertical(of(8), 100.05)[0].coords.length, 6, "ขอบร่วมที่มีจุดกลางต่อเป็นเส้นเดียว 3 จุด");
  assert.deepEqual([100.05, 100.1, 100.15].map((x) => vertical(of(8), x).length), [1, 1, 1]);

  // อำเภอ: ขอบนอก + ขอบระหว่างอำเภอ (100.10) + ขอบระหว่างจังหวัด (100.15) ไม่มีขอบระหว่างตำบลในอำเภอเดียวกัน (100.05)
  assert.deepEqual([100.05, 100.1, 100.15].map((x) => vertical(of(6), x).length), [0, 1, 1]);
  assert.equal(segments(of(6)), 10 + 2);

  // จังหวัด: ขอบนอก + ขอบระหว่างจังหวัด (100.15) เท่านั้น
  assert.deepEqual([100.05, 100.1, 100.15].map((x) => vertical(of(4), x).length), [0, 0, 1]);
  assert.equal(segments(of(4)), 10 + 1);
});

test("ป้ายทุกระดับวางกลางพื้นที่ ตัดคำนำหน้า (รวม อำเภ ที่สะกดผิด) พื้นที่ใหญ่ได้ rank น้อย", () => {
  const { labels } = buildAdminIndex(adminData);
  const names = labels.map((l) => `${l.level}:${l.name}`);
  assert.deepEqual(names, [
    "Province:ทดสอบ",
    "Province:ตัวอย่าง",
    "Amphoe:ก",
    "Amphoe:ข",
    "Amphoe:ค",
    "Tambon:หนึ่ง",
    "Tambon:สอง",
    "Tambon:สาม",
    "Tambon:สี่",
  ]);
  const p = labels.find((l) => l.name === "ทดสอบ");
  assert.ok(Math.abs(p.x * 360 - 180 - 100.075) < 0.002, `x = ${p.x * 360 - 180}`);
  assert.ok(labels[0].rank < labels[1].rank);
});

test("ตำบลส่งมาทีละจังหวัด (async) ได้ผลเท่ากับส่งทั้งชุด", async () => {
  async function* chunks() {
    for (const code of ["10", "20"]) yield { type: "FeatureCollection", features: tambons.features.filter((f) => f.properties.P_code === code) };
  }
  const a = buildAdminIndex(adminData);
  const b = await buildAdminIndexAsync({ provinces, amphoes, tambons: chunks() });
  assert.deepEqual(b.stats, a.stats);
  assert.deepEqual(b.lines.map((l) => [l.level, [...l.coords]]), a.lines.map((l) => [l.level, [...l.coords]]));
});

test("simplify ตัดจุดที่อยู่บนเส้นตรง ปลายเส้นคงที่", () => {
  assert.deepEqual(simplify([0, 0, 1, 0.001, 2, 0, 3, 5], 0.01), [0, 0, 2, 0, 3, 5]);
  assert.deepEqual(simplify([0, 0, 1, 1], 10), [0, 0, 1, 1]);
});

test("poleOfInaccessibility อยู่ในรูปตัว C ไม่ใช่ช่องว่างตรงกลาง", () => {
  const c = [[[0, 0], [10, 0], [10, 2], [2, 2], [2, 8], [10, 8], [10, 10], [0, 10], [0, 0]]];
  assert.ok(poleOfInaccessibility(c, 0.1)[0] < 2);
});

test("tile: เส้นตามระดับ + ป้ายเฉพาะ tile ที่จุดตกอยู่ และซูมต่ำไม่ใส่ระดับเล็ก", () => {
  const tile = createTileBuilder(buildAdminIndex(adminData), ALL);
  const [z, x, y] = tileOf(100.1, 13.05, 8);
  const { boundary, label } = tile(z, x, y);
  assert.deepEqual(boundary.map((f) => f.properties.admin_level).sort(), [4, 6, 8]);
  assert.equal(label.length, 9);

  // tile ข้างๆ ไม่มีอะไร
  const empty = tile(z, x + 2, y);
  assert.deepEqual([empty.boundary.length, empty.label.length], [0, 0]);

  // ค่าเริ่มต้นของ server: ซูม 5 มีแต่จังหวัด
  const low = createTileBuilder(buildAdminIndex(adminData));
  const [z5, x5, y5] = tileOf(100.1, 13.05, 5);
  const t5 = low(z5, x5, y5);
  assert.deepEqual(t5.boundary.map((f) => f.properties.admin_level), [4]);
  assert.deepEqual([...new Set(t5.label.map((l) => l.properties.level))], ["Province"]);
});

test("tile: เส้นที่ยาวเกิน tile ถูกตัดที่กรอบ + buffer", () => {
  const tile = createTileBuilder(buildAdminIndex(adminData), ALL);
  // ซูม 14 tile เล็กกว่าความยาวเส้น (0.1°) มาก
  const [z, x, y] = tileOf(100.15, 13.05, 14);
  const { boundary } = tile(z, x, y);
  const province = boundary.find((f) => f.properties.admin_level === 4);
  for (const line of province.geometry) for (const [, py] of line) assert.ok(py >= -256 && py <= 4096 + 256, `y = ${py}`);
});

function fakeService() {
  const calls = [];
  const fetch = async (url, init) => {
    const layer = Number(String(url).match(/MapServer\/(\d)\/query/)[1]);
    const where = init.body.get("where");
    calls.push(`${layer}:${where}`);
    let body = { provinces, amphoes }[layer === 2 ? "provinces" : "amphoes"];
    if (layer === 4) {
      const code = where.match(/'(\d+)'/)[1];
      body = { type: "FeatureCollection", features: tambons.features.filter((f) => f.properties.P_code === code) };
    }
    return { ok: true, status: 200, json: async () => body };
  };
  fetch.calls = calls;
  return fetch;
}

test("loadAdminData: ตำบลทีละจังหวัด แบบ POST และเก็บ cache บนดิสก์ ครั้งต่อไปไม่ออกเน็ต", async () => {
  const dir = mkdtempSync(join(tmpdir(), "admin-boundary-"));
  try {
    const fetch = fakeService();
    const data = await loadAdminData({ cacheDir: dir, fetch });
    const count = async (it) => {
      let n = 0;
      for await (const fc of it) n += fc.features.length;
      return n;
    };
    assert.equal(await count(data.tambons), 4);
    assert.deepEqual(fetch.calls.sort(), ["2:1=1", "3:1=1", "4:P_code='10'", "4:P_code='20'"]);
    assert.deepEqual(readdirSync(dir).sort(), ["amphoe.json", "province.json", "tambon-10.json", "tambon-20.json"]);

    const again = fakeService();
    const cached = await loadAdminData({ cacheDir: dir, fetch: again });
    assert.equal(again.calls.length, 0);
    assert.equal(await count(cached.tambons), 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadAdminData: service ตอบ error ของ ArcGIS → โยน error", async () => {
  const fetch = async () => ({ ok: true, status: 200, json: async () => ({ error: { code: 500, message: "Unable to complete operation" } }) });
  await assert.rejects(loadAdminData({ cacheDir: false, fetch }), /Unable to complete operation/);
});

test("config: service ชี้ไปที่ MapServer ข้อมูลเขตการปกครองของ GISTDA layer 2/3/4", () => {
  assert.equal(new URL(GISTDA_ADMIN_SERVICE.url).hostname, "gistdaportal.gistda.or.th");
  assert.deepEqual(GISTDA_ADMIN_SERVICE.layers, { Province: 2, Amphoe: 3, Tambon: 4 });
});
