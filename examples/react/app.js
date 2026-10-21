// ตัวอย่าง React: store เดียวคุมแผนที่ 2 ตัว (MapLibre 3D + Leaflet 2D) และแผงควบคุม
// ใช้ htm แทน JSX เพื่อเปิดได้โดยไม่ต้อง build ในโปรเจกต์ Vite เขียนเป็น JSX ได้ตรงๆ

import htm from "htm";
import { createElement, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { LEVEL_NAMES_TH, LEVELS, createBoundaryStore } from "../../src/index.js";
import {
  BoundaryProvider,
  useBoundary,
  useBoundaryStore,
  useLeafletBoundary,
  useMapLibreBoundary,
} from "../../src/react.js";
import { BASEMAPS, BASEMAP_BOUNDARY_LAYERS, THAILAND_VIEW, dataset } from "../shared/setup.js";

const html = htm.bind(createElement);

// ปกติแยกไว้ในไฟล์ของมันเอง เช่น src/stores/boundaryStore.js แล้ว import ไปใช้
const boundaryStore = createBoundaryStore({ persist: { key: "admin-boundary:react" } });

// ---------- แผนที่ ----------

function MapLibreMap() {
  const ref = useRef(null);
  const [map, setMap] = useState(null);

  useEffect(() => {
    const m = new maplibregl.Map({
      container: ref.current,
      style: BASEMAPS.positron,
      ...THAILAND_VIEW,
      maxPitch: 75,
    });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    setMap(m);
    return () => m.remove();
  }, []);

  useMapLibreBoundary(map, { dataset, hideBasemapLayers: BASEMAP_BOUNDARY_LAYERS });

  return html`<div class="map-box">
    <div class="map" ref=${ref}></div>
    <span class="map-tag">MapLibre · 2D / 2.5D / 3D</span>
  </div>`;
}

function LeafletMap() {
  const ref = useRef(null);
  const [map, setMap] = useState(null);

  useEffect(() => {
    const m = L.map(ref.current, { zoomControl: false }).setView(
      [THAILAND_VIEW.center[1], THAILAND_VIEW.center[0]],
      Math.round(THAILAND_VIEW.zoom + 1),
    );
    L.control.zoom({ position: "topright" }).addTo(m);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    setMap(m);
    return () => m.remove();
  }, []);

  useLeafletBoundary(map, { dataset });

  return html`<div class="map-box">
    <div class="map" ref=${ref}></div>
    <span class="map-tag">Leaflet · 2D</span>
  </div>`;
}

// ---------- แผงควบคุม: ทุกตัวอ่าน/เขียน store ผ่าน hook ----------

function LevelRow({ level }) {
  const store = useBoundaryStore();
  const lv = useBoundary((s) => s.levels[level]);
  const st = useBoundary((s) => s.styles[level]);
  return html`<div class="ab-level">
    <label class="ab-check">
      <input type="checkbox" checked=${lv.visible} onChange=${(e) => store.setLevelVisible(level, e.target.checked)} />
      <span class="ab-swatch" style=${{ "--c": st.color, "--bg": st.casingColor, "--s": st.dash ? "dashed" : "solid" }}></span>
      ${LEVEL_NAMES_TH[level]}
    </label>
    <label class="ab-check ab-mini">
      <input
        type="checkbox"
        checked=${lv.labels}
        disabled=${!lv.visible}
        onChange=${(e) => store.setLevelLabels(level, e.target.checked)}
      />
      ป้าย
    </label>
    <input
      type="range"
      min="0"
      max="100"
      step="5"
      value=${lv.opacity}
      disabled=${!lv.visible}
      aria-label=${`ความทึบ ${LEVEL_NAMES_TH[level]}`}
      onChange=${(e) => store.setLevelOpacity(level, e.target.value)}
    />
    <output>${lv.opacity}%</output>
  </div>`;
}

function ViewSwitch() {
  const store = useBoundaryStore();
  const view = useBoundary((s) => s.view);
  const exaggeration = useBoundary((s) => s.terrainExaggeration);
  return html`
    <div class="ab-seg" role="group">
      ${[
        ["2d", "2D"],
        ["2.5d", "2.5D"],
        ["3d", "3D"],
      ].map(
        ([v, label]) =>
          html`<button
            type="button"
            key=${v}
            class=${view === v ? "is-active" : ""}
            aria-pressed=${view === v}
            onClick=${() => store.setView(v)}
          >
            ${label}
          </button>`,
      )}
    </div>
    ${view === "3d" &&
    html`<label class="ab-row"
      >ความสูงภูมิประเทศ
      <input
        type="range"
        min="0.5"
        max="4"
        step="0.5"
        value=${exaggeration}
        onChange=${(e) => store.setTerrainExaggeration(e.target.value)}
      />
      <output>×${exaggeration}</output></label
    >`}
    <p class="ab-note">Leaflet ทางขวาแสดง 2D เสมอ แต่ซิงก์การเปิด/ปิดชั้นและความทึบด้วยกัน</p>
  `;
}

function Panel() {
  const store = useBoundaryStore();
  return html`<aside class="ab-panel">
    <header>
      <h1>ขอบเขตการปกครอง</h1>
      <span class="ab-chip">React 18</span>
    </header>
    <h2>ชั้นข้อมูล</h2>
    ${LEVELS.map((level) => html`<${LevelRow} key=${level} level=${level} />`)}
    <h2>มุมมอง (MapLibre)</h2>
    <${ViewSwitch} />
    <p class="ab-note">ข้อมูล: GISTDA (กรมการปกครอง) · แผนที่ฐาน: OpenFreeMap</p>
    <footer><button type="button" data-role="reset" onClick=${() => store.reset()}>คืนค่าเริ่มต้น</button></footer>
  </aside>`;
}

function App() {
  return html`<${BoundaryProvider} store=${boundaryStore}>
    <div class="layout">
      <${Panel} />
      <main class="maps">
        <${MapLibreMap} />
        <${LeafletMap} />
      </main>
    </div>
  <//>`;
}

createRoot(document.getElementById("root")).render(html`<${App} />`);
Object.assign(window, { boundaryStore });
