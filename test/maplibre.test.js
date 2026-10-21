import assert from "node:assert/strict";
import { test } from "node:test";
import { bindMapLibre } from "../src/maplibre.js";
import { createBoundaryStore } from "../src/store.js";
import { testDataset } from "./helpers.js";

// map จำลองที่มีเฉพาะ API ที่ตัวเชื่อมใช้
class FakeMap {
  constructor() {
    this.layers = [{ id: "basemap-road", type: "line" }, { id: "basemap-place", type: "symbol" }];
    this.sources = {};
    this.handlers = {};
    this.terrain = null;
    this.calls = [];
    this.camera = null;
  }
  getLayoutProperty(id, k) {
    return this.getLayer(id).layout?.[k];
  }
  getStyle() {
    return { layers: this.layers };
  }
  getLayer(id) {
    return this.layers.find((l) => l.id === id);
  }
  getSource(id) {
    return this.sources[id];
  }
  addSource(id, spec) {
    this.sources[id] = spec;
  }
  removeSource(id) {
    delete this.sources[id];
  }
  addLayer(layer, before) {
    const i = before ? this.layers.findIndex((l) => l.id === before) : -1;
    if (i >= 0) this.layers.splice(i, 0, layer);
    else this.layers.push(layer);
  }
  removeLayer(id) {
    this.layers = this.layers.filter((l) => l.id !== id);
  }
  setPaintProperty(id, k, v) {
    this.calls.push(["paint", id, k]);
    this.getLayer(id).paint[k] = v;
  }
  setLayoutProperty(id, k, v) {
    this.calls.push(["layout", id, k]);
    const layer = this.getLayer(id);
    layer.layout = { ...layer.layout, [k]: v };
  }
  setFilter() {}
  setLayerZoomRange() {}
  setTerrain(t) {
    this.terrain = t;
  }
  jumpTo(c) {
    this.camera = c;
  }
  easeTo(c) {
    this.camera = c;
  }
  on(type, fn) {
    (this.handlers[type] ??= new Set()).add(fn);
  }
  off(type, fn) {
    this.handlers[type]?.delete(fn);
  }
}

const dataset = testDataset();

test("ติดตั้ง source/layer โดยแทรกเส้นไว้ใต้ป้ายของแผนที่ฐาน และป้ายไว้บนสุด", async () => {
  const map = new FakeMap();
  const b = bindMapLibre(map, createBoundaryStore(), { dataset, prefix: "ab" });
  await b.ready;
  const ids = map.layers.map((l) => l.id);
  assert.ok(ids.indexOf("ab-Province-line") < ids.indexOf("basemap-place"));
  assert.equal(ids.at(-1), "ab-Province-label");
  assert.ok(map.getSource("ab-src-boundary"));
});

test("เปลี่ยน state แล้วอัปเดตเฉพาะค่าที่ต่าง", async () => {
  const map = new FakeMap();
  const store = createBoundaryStore();
  const b = bindMapLibre(map, store, { dataset, prefix: "ab" });
  await b.ready;
  map.calls = [];
  store.setLevelOpacity("Amphoe", 50);
  assert.ok(map.calls.length > 0);
  assert.ok(map.calls.every(([, id]) => id.startsWith("ab-Amphoe")), JSON.stringify(map.calls));
  assert.equal(map.getLayer("ab-Amphoe-line").paint["line-opacity"], 0.5);
});

test("มุมมอง 3d เปิด terrain และเอียงกล้อง, กลับ 2d ปิด terrain", async () => {
  const map = new FakeMap();
  const store = createBoundaryStore();
  const b = bindMapLibre(map, store, { dataset, prefix: "ab" });
  await b.ready;
  store.setView("3d");
  assert.equal(map.terrain.source, "ab-dem");
  assert.ok(map.camera.pitch > 0);
  store.setView("2d");
  assert.equal(map.terrain, null);
  assert.equal(map.camera.pitch, 0);
});

test("style ถูกเปลี่ยน (setStyle) แล้วติดตั้งใหม่ตาม state ล่าสุด", async () => {
  const map = new FakeMap();
  const store = createBoundaryStore();
  const b = bindMapLibre(map, store, { dataset, prefix: "ab" });
  await b.ready;

  map.layers = [{ id: "new-basemap-label", type: "symbol" }];
  map.sources = {};
  store.setLevelVisible("Amphoe", false); // เปลี่ยนระหว่างที่ style ใหม่ยังไม่มีชั้นของเรา
  for (const fn of map.handlers.styledata) fn();

  assert.ok(map.getLayer("ab-Province-line"));
  assert.equal(map.getLayer("ab-Amphoe-line").layout.visibility, "none");
  assert.equal(map.layers.at(-1).id, "ab-Province-label");
});

test("destroy ถอดทุกอย่างและเรียกซ้ำได้", async () => {
  const map = new FakeMap();
  const store = createBoundaryStore();
  const b = bindMapLibre(map, store, { dataset, prefix: "ab" });
  await b.ready;
  store.setView("3d");
  b.destroy();
  b.destroy();
  assert.deepEqual(map.layers.map((l) => l.id), ["basemap-road", "basemap-place"]);
  assert.deepEqual(Object.keys(map.sources), []);
  assert.equal(map.terrain, null);
  assert.equal(map.handlers.styledata.size, 0);
  store.setLevelOpacity("Province", 10); // ไม่ error หลัง destroy
});

test("ผูกซ้ำบน map เดิมด้วย prefix เดิมจะถอดตัวเก่าก่อน", async () => {
  const map = new FakeMap();
  const store = createBoundaryStore();
  const a = bindMapLibre(map, store, { dataset, prefix: "ab" });
  await a.ready;
  const b = bindMapLibre(map, store, { dataset, prefix: "ab" });
  await b.ready;
  assert.equal(map.layers.filter((l) => l.id === "ab-Province-line").length, 1);
  assert.equal(map.handlers.styledata.size, 1);
});

test("hideBasemapLayers ซ่อนเส้นของแผนที่ฐานและคืนค่าตอน destroy", async () => {
  const map = new FakeMap();
  map.layers.unshift({ id: "boundary_3", type: "line" });
  const b = bindMapLibre(map, createBoundaryStore(), {
    dataset,
    prefix: "ab",
    hideBasemapLayers: ["boundary_3", "not-in-style"],
  });
  await b.ready;
  assert.equal(map.getLayer("boundary_3").layout.visibility, "none");
  b.destroy();
  assert.equal(map.getLayer("boundary_3").layout.visibility, "visible");
});

test("ไม่ส่ง dataset = ใช้ boundaryDataset() ค่าเริ่มต้น (/boundary-tiles)", async () => {
  const map = new FakeMap();
  const b = bindMapLibre(map, createBoundaryStore(), { prefix: "ab" });
  await b.ready;
  assert.deepEqual(map.getSource("ab-src-boundary").tiles, ["/boundary-tiles/{z}/{x}/{y}"]);
  assert.ok(map.getLayer("ab-Province-label"));
  b.destroy();
});
