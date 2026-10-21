// ตัวเชื่อม store → Leaflet
// ไม่เขียนตัววาดใหม่: ซ้อน MapLibre map ไว้เป็น layer หนึ่งของ Leaflet ด้วย @maplibre/maplibre-gl-leaflet
// แล้วใช้ bindMapLibre ต่อ จึงได้เส้นและป้ายที่ไม่ทับกันเหมือน MapLibre ทุกอย่าง
// ยกเว้นการเอียง/หมุน (Leaflet ไม่มี) จึงแสดงแบบ 2d เสมอไม่ว่า store.view จะเป็นอะไร

import { bindMapLibre } from "./maplibre.js";

const OPENFREEMAP_GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

/**
 * @param {import("leaflet").Map} leafletMap
 * @param {ReturnType<import("./store.js").createBoundaryStore>} store
 * @param {object} options  เหมือน bindMapLibre และเพิ่ม:
 * @param {object} [options.L]  Leaflet namespace (ค่าเริ่มต้น = window.L)
 * @param {string} [options.glyphs]  glyph server ที่มีอักษรไทย
 * @param {string} [options.pane="overlayPane"]
 * @param {object} [options.glOptions]  ส่งต่อให้ L.maplibreGL()
 */
export function bindLeaflet(leafletMap, store, options = {}) {
  const {
    L = globalThis.L,
    glyphs = OPENFREEMAP_GLYPHS,
    pane = "overlayPane",
    glOptions = {},
    ...rest
  } = options;
  if (!L?.maplibreGL) {
    throw new Error("admin-boundary: ต้องโหลด leaflet, maplibre-gl และ @maplibre/maplibre-gl-leaflet ก่อน");
  }

  const glLayer = L.maplibreGL({
    style: { version: 8, glyphs, sources: {}, layers: [] },
    pane,
    interactive: false,
    // plugin รวม attribution ของทุก source แบบไม่ตัดตัวซ้ำ และได้ผลต่างกันตามจังหวะโหลด
    // จึงปิดไว้แล้วใส่เองด้านล่าง
    attributionControl: { customAttribution: "" },
    ...glOptions,
  }).addTo(leafletMap);
  const glMap = glLayer.getMaplibreMap();

  const binding = bindMapLibre(glMap, store, {
    ...rest,
    supports3d: false,
    terrain: false,
    camera: false,
  });

  // GL layer ที่ปิด attribution ของตัวเองไว้จะไม่แสดงเครดิตของ source ที่เพิ่มทีหลัง
  const attributions = binding.attribution;
  for (const a of attributions) leafletMap.attributionControl?.addAttribution(a);

  let destroyed = false;
  return {
    map: leafletMap,
    glLayer,
    glMap,
    store,
    ready: binding.ready,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const a of attributions) leafletMap.attributionControl?.removeAttribution(a);
      binding.destroy();
      leafletMap.removeLayer(glLayer);
    },
  };
}
