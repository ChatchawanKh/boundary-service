import assert from "node:assert/strict";
import { test } from "node:test";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { DEFAULT_TERRAIN } from "../src/config.js";
import { createBoundaryStore } from "../src/store.js";
import { describeLayers, sourceId } from "../src/style.js";
import { testDataset } from "./helpers.js";

// ตรวจ source/layer ที่สร้างกับ style spec จริงของ MapLibre ในทุกมุมมอง
const resolved = await testDataset().load();
const sources = {};
for (const [key, spec] of Object.entries(resolved.sources)) sources[sourceId("ab", key)] = spec;
sources["ab-dem-hs"] = { type: "raster-dem", ...DEFAULT_TERRAIN };

for (const view of ["2d", "2.5d", "3d"]) {
  test(`style spec ถูกต้อง: view=${view}`, () => {
    const store = createBoundaryStore({ view });
    store.setLevelVisible("Amphoe", false);
    store.setLevelOpacity("Tambon", 40);
    const { below, top } = describeLayers(store.getState(), resolved, {
      prefix: "ab",
      font: ["Noto Sans Regular"],
      supports3d: true,
      terrain: true,
    });
    const style = {
      version: 8,
      glyphs: "https://example.com/{fontstack}/{range}.pbf",
      sources,
      layers: [...below, ...top],
    };
    assert.deepEqual(validateStyleMin(style).map((e) => e.message), []);
  });
}
