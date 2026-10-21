import assert from "node:assert/strict";
import { test } from "node:test";
import { boundaryDataset } from "../src/sources.js";
import { testDataset } from "./helpers.js";

test("เส้นและป้ายมาจาก source เดียว (/boundary-tiles) แยกด้วย source-layer", async () => {
  const r = await testDataset().load();
  assert.deepEqual(Object.keys(r.sources), ["boundary"]);
  assert.deepEqual(r.sources.boundary.tiles, ["https://example.com/boundary-tiles/{z}/{x}/{y}"]);
  assert.equal(r.sources.boundary.maxzoom, 14);
  assert.deepEqual(r.levels.Amphoe.line, {
    source: "boundary",
    sourceLayer: "boundary",
    filter: ["==", ["get", "admin_level"], 6],
  });
  assert.equal(r.levels.Amphoe.label.sourceLayer, "label");
  assert.deepEqual(r.levels.Amphoe.label.filter, ["==", ["get", "level"], "Amphoe"]);
  assert.equal(r.levels.Amphoe.label.name, "name");
});

test("path แบบ relative ถูกแปลงเป็น URL เต็มตามหน้าเว็บ (worker ของ MapLibre ต้องการ)", async () => {
  globalThis.location = { href: "http://localhost:3300/examples/maplibre/" };
  try {
    const r = await boundaryDataset().load();
    assert.deepEqual(r.sources.boundary.tiles, ["http://localhost:3300/boundary-tiles/{z}/{x}/{y}"]);
  } finally {
    delete globalThis.location;
  }
});

test("labels: false = เส้นอย่างเดียว", async () => {
  const r = await testDataset({ labels: false }).load();
  for (const level of ["Province", "Amphoe", "Tambon"]) assert.equal(r.levels[level].label, null);
});

test("adminLevels ไม่ใส่บางระดับ = ไม่สร้างระดับนั้น", async () => {
  const r = await testDataset({ adminLevels: { Province: 4 } }).load();
  assert.deepEqual(Object.keys(r.levels), ["Province"]);
});

test("attribution: ขอบเขตการปกครองจาก GISTDA (กรมการปกครอง) ไม่มี OpenFreeMap", () => {
  const a = testDataset().attribution;
  assert.match(a, /GISTDA.*กรมการปกครอง/);
  assert.doesNotMatch(a, /OpenFreeMap|OpenStreetMap/);
});

test("load() คืนผลเดิมทุกครั้ง", async () => {
  const dataset = testDataset();
  assert.equal(await dataset.load(), await dataset.load());
});
