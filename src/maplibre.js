// ตัวเชื่อม store → MapLibre GL (ใช้กับ Mapbox GL และ Sphere ที่ครอบ MapLibre ได้ด้วย)
// ไม่ import maplibre-gl เอง ใช้แค่ instance ของ map ที่ส่งเข้ามา

import { DEFAULT_TERRAIN, VIEW_CAMERA } from "./config.js";
import { boundaryDataset } from "./sources.js";
import { describeLayers, sourceId } from "./style.js";

const bindings = new WeakMap(); // map → Map(prefix → binding)

// แผนที่ที่ไม่ส่ง dataset มาใช้ตัวเดียวกัน
let sharedDataset = null;
const defaultDataset = () => (sharedDataset ??= boundaryDataset());

function same(a, b) {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function diffProps(prev = {}, next = {}, apply) {
  for (const key of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (!same(prev[key], next[key])) apply(key, next[key]);
  }
}

/**
 * วาดชั้นขอบเขตลงบน MapLibre map ตาม state ของ store
 *
 * @param {import("maplibre-gl").Map} map
 * @param {ReturnType<import("./store.js").createBoundaryStore>} store
 * @param {object} [options]
 * @param {object} [options.dataset]  จาก boundaryDataset() (ไม่ใส่ = boundaryDataset() ค่าเริ่มต้น)
 * @param {string} [options.prefix="admin-boundary"]  prefix ของ id ทุก layer/source
 * @param {string[]} [options.font]  fontstack ที่ glyph server ของ style มีอักษรไทย
 * @param {string} [options.beforeId]  แทรกเส้นไว้ใต้ layer นี้ (ค่าเริ่มต้น = ป้ายแรกของแผนที่ฐาน)
 * @param {boolean} [options.supports3d=true]  false = แสดงแบบ 2d เสมอ
 * @param {object|false} [options.terrain]  raster-dem source สำหรับมุมมอง 3d หรือ false = ไม่ใช้
 * @param {boolean} [options.camera=true]  เอียง/หมุนกล้องเองเมื่อเปลี่ยนมุมมอง
 * @param {object} [options.metadata]  metadata เพิ่มให้ทุก layer
 * @param {object} [options.lineMetadata]  metadata เพิ่มให้ layer เส้น (เช่น { zIndex: 1000 } ของ Sphere)
 * @param {string[]|((layer: object) => boolean)} [options.hideBasemapLayers]  ซ่อน layer ของแผนที่ฐานที่ซ้ำกับชั้นนี้
 *   เช่น ["boundary_3", "boundary_state"] (เส้นเขตปกครองของ style OpenFreeMap) id ที่ไม่มีใน style ข้ามไปเอง
 * @param {(err: Error) => void} [options.onError]
 */
export function bindMapLibre(map, store, options = {}) {
  const {
    dataset = defaultDataset(),
    prefix = "admin-boundary",
    font = ["Noto Sans Regular"],
    beforeId,
    supports3d = true,
    terrain = DEFAULT_TERRAIN,
    camera = true,
    metadata = {},
    lineMetadata = {},
    hideBasemapLayers = [],
    onError = (err) => console.error(err),
  } = options;
  // สร้างซ้ำบน map เดิมด้วย prefix เดิม → ถอดตัวเก่าก่อน
  const registry = bindings.get(map) ?? new Map();
  bindings.set(map, registry);
  registry.get(prefix)?.destroy();

  const useTerrain = Boolean(terrain) && supports3d && typeof map.setTerrain === "function";
  const ctx = { prefix, font, supports3d, terrain: useTerrain, metadata, lineMetadata };
  const demId = `${prefix}-dem`;

  let resolved = null;
  let destroyed = false;
  let applied = new Map(); // layer id → spec ที่ใส่ลงแผนที่ล่าสุด
  let painted = null; // state ที่วาดล่าสุด
  let terrainOn = false;
  let hiddenBasemap = new Map(); // layer id → visibility เดิม
  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));

  const isInstalled = () => {
    const first = applied.keys().next().value;
    return Boolean(first && map.getLayer(first));
  };

  function firstBasemapSymbol() {
    const layers = map.getStyle()?.layers ?? [];
    return layers.find((l) => l.type === "symbol" && !l.id.startsWith(`${prefix}-`))?.id;
  }

  function hideBasemap() {
    hiddenBasemap = new Map();
    const shouldHide =
      typeof hideBasemapLayers === "function" ? hideBasemapLayers : (l) => hideBasemapLayers.includes(l.id);
    for (const layer of map.getStyle()?.layers ?? []) {
      if (layer.id.startsWith(`${prefix}-`) || !shouldHide(layer)) continue;
      hiddenBasemap.set(layer.id, map.getLayoutProperty(layer.id, "visibility") ?? "visible");
      map.setLayoutProperty(layer.id, "visibility", "none");
    }
  }

  function syncTerrain(state, prev) {
    if (!useTerrain) return;
    const want = state.view === "3d";
    if (want && (!terrainOn || prev?.terrainExaggeration !== state.terrainExaggeration || !prev)) {
      map.setTerrain({ source: demId, exaggeration: state.terrainExaggeration });
      terrainOn = true;
    } else if (!want && terrainOn) {
      map.setTerrain(null);
      terrainOn = false;
    }
  }

  function syncCamera(state, prev) {
    if (!camera || !supports3d || prev?.view === state.view) return;
    const target = VIEW_CAMERA[state.view];
    if (!prev) {
      if (state.view !== "2d") map.jumpTo(target);
    } else {
      map.easeTo({ ...target, duration: 1000 });
    }
  }

  function install() {
    if (!resolved || destroyed) return;
    for (const [key, spec] of Object.entries(resolved.sources)) {
      const id = sourceId(prefix, key);
      if (!map.getSource(id)) map.addSource(id, spec);
    }
    if (useTerrain) {
      const dem = { type: "raster-dem", ...terrain };
      if (!map.getSource(demId)) map.addSource(demId, dem);
      if (!map.getSource(`${demId}-hs`)) map.addSource(`${demId}-hs`, dem);
    }

    hideBasemap();
    const state = store.getState();
    const { below, top } = describeLayers(state, resolved, ctx);
    const before = beforeId && map.getLayer(beforeId) ? beforeId : firstBasemapSymbol();
    for (const layer of below) if (!map.getLayer(layer.id)) map.addLayer(layer, before);
    for (const layer of top) if (!map.getLayer(layer.id)) map.addLayer(layer);
    applied = new Map([...below, ...top].map((l) => [l.id, l]));

    // style ใหม่ไม่มี terrain เดิม ต้องใส่ใหม่
    terrainOn = false;
    syncTerrain(state, null);
    if (!painted) syncCamera(state, null);
    painted = state;
    resolveReady();
  }

  function tryInstall() {
    try {
      install();
    } catch (err) {
      // style ยังโหลดไม่เสร็จ จะลองใหม่ตอน styledata ครั้งถัดไป
      if (!/not done loading/i.test(err.message)) onError(err);
    }
  }

  function update(state) {
    // เทียบกับ state ที่วาดล่าสุด ไม่ใช่ prev ของ store เพราะระหว่างเปลี่ยน style อาจข้ามบาง update ไป
    if (destroyed || !resolved || !painted || !isInstalled()) return;
    const prev = painted;
    if (state.levels !== prev.levels || state.styles !== prev.styles || state.view !== prev.view) {
      const { below, top } = describeLayers(state, resolved, ctx);
      for (const layer of [...below, ...top]) {
        const old = applied.get(layer.id);
        if (!old || !map.getLayer(layer.id)) continue;
        diffProps(old.layout, layer.layout, (k, v) => map.setLayoutProperty(layer.id, k, v));
        diffProps(old.paint, layer.paint, (k, v) => map.setPaintProperty(layer.id, k, v));
        if (!same(old.filter, layer.filter)) map.setFilter(layer.id, layer.filter ?? null);
        if (old.minzoom !== layer.minzoom || old.maxzoom !== layer.maxzoom) {
          map.setLayerZoomRange(layer.id, layer.minzoom ?? 0, layer.maxzoom ?? 24);
        }
        applied.set(layer.id, layer);
      }
    }
    syncTerrain(state, prev);
    syncCamera(state, prev);
    painted = state;
  }

  const onStyleData = () => {
    if (resolved && !isInstalled()) tryInstall();
  };

  map.on("styledata", onStyleData);
  const unsubscribe = store.subscribe(update);

  dataset
    .load()
    .then((r) => {
      if (destroyed) return;
      resolved = r;
      tryInstall();
    })
    .catch(onError);

  const binding = {
    map,
    store,
    ready,
    get attribution() {
      return [resolved?.attribution ?? dataset.attribution, useTerrain ? terrain.attribution : ""].filter(Boolean);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      map.off("styledata", onStyleData);
      if (registry.get(prefix) === binding) registry.delete(prefix);
      try {
        if (terrainOn) map.setTerrain(null);
        for (const [id, visibility] of hiddenBasemap) {
          if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
        }
        for (const id of applied.keys()) if (map.getLayer(id)) map.removeLayer(id);
        const sourceIds = Object.keys(resolved?.sources ?? {}).map((k) => sourceId(prefix, k));
        if (useTerrain) sourceIds.push(demId, `${demId}-hs`);
        for (const id of sourceIds) if (map.getSource(id)) map.removeSource(id);
      } catch {
        // map ถูก remove ไปแล้ว
      }
    },
  };
  registry.set(prefix, binding);
  return binding;
}
