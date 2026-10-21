import assert from "node:assert/strict";
import { test } from "node:test";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { createBoundaryTiles, encodeTile, tileMiddleware } from "../src/server.js";

// tile 1/1/0 ครอบลองจิจูด 0..180 และละติจูด 0..85 (extent 4096)
// พื้นที่ที่เก็บ: ลองจิจูด 0..90 = ครึ่งซ้ายของ tile
const within = { type: "Polygon", coordinates: [[[0, 1], [90, 1], [90, 80], [0, 80], [0, 1]]] };
const Z = 1;
const X = 1;
const Y = 0;

// tile จำลองแบบ OpenFreeMap: layer boundary (เส้น) และ place (จุด)
const source = encodeTile([
  {
    name: "boundary",
    features: [
      // เส้นแนวนอนยาวตลอด tile → ต้องถูกตัดที่กึ่งกลาง (x = 2048)
      { type: "line", properties: { admin_level: 4, maritime: 0 }, geometry: [[[100, 3000], [4000, 3000]]] },
      // อยู่ฝั่งขวาทั้งเส้น → ต้องหายไป
      { type: "line", properties: { admin_level: 6, maritime: 0 }, geometry: [[[3000, 2900], [3500, 2900]]] },
      // เส้นทางทะเล → ไม่เอา
      { type: "line", properties: { admin_level: 4, maritime: 1 }, geometry: [[[100, 2500], [1000, 2500]]] },
    ],
  },
  {
    name: "place",
    features: [
      { type: "point", properties: { class: "city", capital: 4, rank: 3, "name:th": "ขอนแก่น", name: "Khon Kaen" }, geometry: [[500, 2000]] },
      { type: "point", properties: { class: "town", capital: 6, rank: 9, "name:th": "เทศบาลตำบลปาย", name: "Pai" }, geometry: [[800, 2000]] },
      // หมู่บ้าน (ไม่มี capital) → ไม่เอา
      { type: "point", properties: { class: "village", rank: 12, name: "บ้านนา" }, geometry: [[900, 2000]] },
      // อยู่นอกพื้นที่ → ไม่เอา
      { type: "point", properties: { class: "city", capital: 4, rank: 3, name: "Vientiane" }, geometry: [[3000, 2000]] },
    ],
  },
]);

function fakeFetch(tile = source) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/planet")) {
      return { ok: true, status: 200, json: async () => ({ tiles: ["https://tiles.example/v1/{z}/{x}/{y}.pbf"] }) };
    }
    return { ok: true, status: 200, arrayBuffer: async () => tile.buffer.slice(tile.byteOffset, tile.byteOffset + tile.byteLength) };
  };
  fn.calls = calls;
  return fn;
}

const read = (buf) => new VectorTile(new Pbf(buf)).layers;

test("เส้นที่ข้ามขอบพื้นที่ถูกตัด เส้นที่อยู่นอกและเส้นทางทะเลหายไป", async () => {
  const fetch = fakeFetch();
  const { boundary } = read(await createBoundaryTiles({ within, fetch })(Z, X, Y));
  assert.equal(boundary.length, 1);
  const f = boundary.feature(0);
  assert.equal(f.properties.admin_level, 4);
  const [line] = f.loadGeometry();
  assert.deepEqual(line.map((p) => [p.x, p.y]), [[100, 3000], [2048, 3000]]);
  assert.deepEqual(fetch.calls, ["https://tiles.openfreemap.org/planet", "https://tiles.example/v1/1/1/0.pbf"]);
});

test("ป้าย: เฉพาะที่ตั้งศาลากลาง/ตัวอำเภอในพื้นที่ ใช้ชื่อไทย และตัดคำนำหน้า เทศบาล...", async () => {
  const { label } = read(await createBoundaryTiles({ within, fetch: fakeFetch() })(Z, X, Y));
  const got = Array.from({ length: label.length }, (_, i) => label.feature(i).properties);
  assert.deepEqual(got, [
    { level: "Province", name: "ขอนแก่น", rank: 3 },
    { level: "Amphoe", name: "ปาย", rank: 9 },
  ]);
});

test("capitalLevels: false = ไม่มี layer ป้าย", async () => {
  const layers = read(await createBoundaryTiles({ within, capitalLevels: false, fetch: fakeFetch() })(Z, X, Y));
  assert.deepEqual(Object.keys(layers), ["boundary"]);
});

test("tile ที่อยู่นอกพื้นที่ทั้งหมดได้ null และ tile เดิมใช้ cache", async () => {
  const fetch = fakeFetch();
  const outside = { type: "Polygon", coordinates: [[[-90, 1], [-10, 1], [-10, 80], [-90, 80], [-90, 1]]] };
  const tiles = createBoundaryTiles({ within: outside, fetch });
  assert.equal(await tiles(Z, X, Y), null);
  assert.equal(await tiles(Z, X, Y), null);
  assert.equal(fetch.calls.length, 2); // TileJSON + tile ครั้งเดียว
});

test("tile ที่อยู่ในพื้นที่ทั้งหมดได้ทุกเส้นที่ไม่ใช่ทางทะเล", async () => {
  const all = { type: "Polygon", coordinates: [[[-1, -1], [179, -1], [179, 84], [-1, 84], [-1, -1]]] };
  const { boundary } = read(await createBoundaryTiles({ within: all, fetch: fakeFetch() })(Z, X, Y));
  const levels = Array.from({ length: boundary.length }, (_, i) => boundary.feature(i).properties.admin_level).sort();
  assert.deepEqual(levels, [4, 6]);
});

function fakeRes() {
  return {
    status: 0,
    headers: {},
    body: undefined,
    writeHead(status, headers = {}) {
      this.status = status;
      this.headers = headers;
      return this;
    },
    end(body) {
      this.body = body;
    },
  };
}

test("middleware: /boundary-tiles ได้ tile, path อื่นส่งต่อ next()", async () => {
  const handle = tileMiddleware({ boundary: { within }, fetch: fakeFetch() });
  const res = fakeRes();
  await handle({ url: "/boundary-tiles/1/1/0" }, res);
  assert.equal(res.status, 200);
  assert.equal(res.headers["Content-Type"], "application/x-protobuf");
  assert.deepEqual(Object.keys(read(new Uint8Array(res.body))), ["boundary", "label"]);

  let nexted = false;
  await handle({ url: "/examples/" }, fakeRes(), () => (nexted = true));
  assert.ok(nexted);
  nexted = false;
  await handle({ url: "/gistda-tiles/66dfc2adcd5838bc29d692f0/5/25/14" }, fakeRes(), () => (nexted = true));
  assert.ok(nexted, "ไม่มี proxy ของ GISTDA แล้ว");
});

test("middleware: upstream พังได้ 502", async () => {
  const handle = tileMiddleware({ fetch: async () => ({ ok: false, status: 500 }) });
  const res = fakeRes();
  const log = console.error;
  console.error = () => {};
  try {
    await handle({ url: "/boundary-tiles/5/24/14" }, res);
  } finally {
    console.error = log;
  }
  assert.equal(res.status, 502);
});
