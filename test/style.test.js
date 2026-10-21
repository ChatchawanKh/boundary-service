import assert from "node:assert/strict";
import { test } from "node:test";
import { createBoundaryStore } from "../src/store.js";
import { describeLayers, zoomRamp } from "../src/style.js";
import { testDataset } from "./helpers.js";

const ctx = { prefix: "ab", font: ["Noto Sans Regular"], supports3d: true, terrain: true };
const resolved = await testDataset().load();

test("zoomRamp บวกค่าเพิ่มทุก stop", () => {
  assert.deepEqual(zoomRamp([[4, 1], [8, 2]], 1), ["interpolate", ["linear"], ["zoom"], 4, 2, 8, 3]);
  assert.equal(zoomRamp([[4, 1]]), 1);
});

test("describeLayers: ลำดับชั้นและ id", () => {
  const { below, top } = describeLayers(createBoundaryStore().getState(), resolved, ctx);
  const ids = below.map((l) => l.id);
  assert.equal(ids[0], "ab-hillshade");
  // เส้นรองทั้งหมดอยู่ใต้เส้นสี, จังหวัดอยู่บนอำเภอ
  assert.ok(ids.indexOf("ab-Tambon-line") > ids.indexOf("ab-Province-casing"));
  assert.ok(ids.indexOf("ab-Province-line") > ids.indexOf("ab-Amphoe-line"));
  assert.equal(ids.at(-1), "ab-Province-line");
  // ป้ายจังหวัดอยู่บนสุดจึงได้วางก่อน
  assert.deepEqual(top.map((l) => l.id), ["ab-Tambon-label", "ab-Amphoe-label", "ab-Province-label"]);
});

test("describeLayers: ป้ายอ่าน source-layer label กรองตามระดับ และจัดลำดับด้วย rank", () => {
  const { top } = describeLayers(createBoundaryStore().getState(), resolved, ctx);
  const province = top.find((l) => l.id === "ab-Province-label");
  assert.deepEqual(province.layout["text-field"], ["to-string", ["get", "name"]]);
  assert.equal(province["source-layer"], "label");
  assert.equal(province.source, "ab-src-boundary");
  assert.deepEqual(province.filter, ["==", ["get", "level"], "Province"]);
  assert.deepEqual(province.layout["symbol-sort-key"], ["to-number", ["get", "rank"], 99]);
});

test("describeLayers: ปิดระดับ → visibility none ทุก layer ของระดับนั้น", () => {
  const store = createBoundaryStore();
  store.setLevelVisible("Amphoe", false);
  const { below, top } = describeLayers(store.getState(), resolved, ctx);
  for (const l of [...below, ...top].filter((l) => l.id.includes("Amphoe"))) {
    assert.equal(l.layout.visibility, "none", l.id);
  }
});

test("describeLayers: ปิดป้ายอย่างเดียว เส้นยังแสดง", () => {
  const store = createBoundaryStore();
  store.setLevelLabels("Tambon", false);
  const { below, top } = describeLayers(store.getState(), resolved, ctx);
  assert.equal(top.find((l) => l.id === "ab-Tambon-label").layout.visibility, "none");
  assert.equal(below.find((l) => l.id === "ab-Tambon-line").layout.visibility, "visible");
});

test("describeLayers: ไม่มีป้าย (labels: false) = ไม่มี symbol layer", async () => {
  const lines = await testDataset({ labels: false }).load();
  const { top } = describeLayers(createBoundaryStore().getState(), lines, ctx);
  assert.deepEqual(top, []);
});

test("describeLayers: hillshade แสดงเฉพาะ 3d และเมื่อรองรับ 3D", () => {
  const store = createBoundaryStore({ view: "3d" });
  const hs = (c) => describeLayers(store.getState(), resolved, c).below[0];
  assert.equal(hs(ctx).layout.visibility, "visible");
  assert.equal(hs({ ...ctx, supports3d: false }).layout.visibility, "none");
});
