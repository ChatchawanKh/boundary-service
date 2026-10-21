// แผงควบคุมแบบ HTML ล้วน ใช้กับตัวอย่าง MapLibre และ Leaflet
// อ่านและเขียนผ่าน store อย่างเดียว ไม่รู้จักแผนที่เลย

import { LEVEL_NAMES_TH, LEVELS } from "../../src/index.js";

const VIEW_LABELS = { "2d": "2D", "2.5d": "2.5D", "3d": "3D" };

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * @param {HTMLElement} el
 * @param {object} opts
 * @param {object} opts.store
 * @param {boolean} [opts.supports3d]
 * @param {string} [opts.sdk]  ชื่อ SDK ที่แสดงบนหัวแผง
 * @param {Record<string, string>} [opts.basemaps]  ชื่อ → style URL
 * @param {(name: string, url: string) => void} [opts.onBasemap]
 */
export function mountPanel(el, { store, supports3d = true, sdk = "", basemaps, onBasemap }) {
  const { styles } = store.getState();
  el.classList.add("ab-panel");
  el.innerHTML = `
    <header>
      <h1>ขอบเขตการปกครอง</h1>
      ${sdk ? `<span class="ab-chip">${esc(sdk)}</span>` : ""}
    </header>

    <section>
      <h2>ชั้นข้อมูล</h2>
      ${LEVELS.map(
        (level) => `
        <div class="ab-level" data-level="${level}">
          <label class="ab-check">
            <input type="checkbox" data-role="visible">
            <span class="ab-swatch" style="--c:${styles[level].color};--s:${styles[level].dash ? "dashed" : "solid"}"></span>
            ${LEVEL_NAMES_TH[level]}
          </label>
          <label class="ab-check ab-mini"><input type="checkbox" data-role="labels"> ป้าย</label>
          <input type="range" min="0" max="100" step="5" data-role="opacity" aria-label="ความทึบ ${LEVEL_NAMES_TH[level]}">
          <output data-role="opacity-out"></output>
        </div>`,
      ).join("")}
    </section>

    <section>
      <h2>มุมมอง</h2>
      <div class="ab-seg" role="group">
        ${Object.entries(VIEW_LABELS)
          .map(([v, label]) => `<button type="button" data-view="${v}" ${!supports3d && v !== "2d" ? "disabled" : ""}>${label}</button>`)
          .join("")}
      </div>
      ${
        supports3d
          ? `<label class="ab-row" data-role="exaggeration-row">ความสูงภูมิประเทศ
               <input type="range" min="0.5" max="4" step="0.5" data-role="exaggeration">
               <output data-role="exaggeration-out"></output></label>`
          : `<p class="ab-note">Leaflet เอียงหรือหมุนแผนที่ไม่ได้ จึงแสดงแบบ 2D เสมอ</p>`
      }
      ${
        basemaps
          ? `<label class="ab-row">แผนที่ฐาน
               <select data-role="basemap">${Object.keys(basemaps).map((k) => `<option>${k}</option>`).join("")}</select></label>`
          : ""
      }
    </section>

    <p class="ab-note">ข้อมูล: OpenFreeMap · ตำบลมีแต่เส้น ไม่มีชื่อ</p>

    <footer><button type="button" data-role="reset">คืนค่าเริ่มต้น</button></footer>
  `;

  const $ = (sel, root = el) => root.querySelector(sel);

  // UI → store
  el.addEventListener("input", (e) => {
    const t = e.target;
    const level = t.closest("[data-level]")?.dataset.level;
    if (t.dataset.role === "visible") store.setLevelVisible(level, t.checked);
    if (t.dataset.role === "labels") store.setLevelLabels(level, t.checked);
    if (t.dataset.role === "opacity") store.setLevelOpacity(level, t.value);
    if (t.dataset.role === "exaggeration") store.setTerrainExaggeration(t.value);
  });
  el.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.role === "basemap") onBasemap?.(t.value, basemaps[t.value]);
  });
  el.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.view) store.setView(t.dataset.view);
    if (t.dataset.role === "reset") store.reset();
  });

  // store → UI
  function sync(state) {
    for (const level of LEVELS) {
      const row = $(`[data-level="${level}"]`);
      const lv = state.levels[level];
      $('[data-role="visible"]', row).checked = lv.visible;
      $('[data-role="labels"]', row).checked = lv.labels;
      $('[data-role="labels"]', row).disabled = !lv.visible;
      $('[data-role="opacity"]', row).value = lv.opacity;
      $('[data-role="opacity"]', row).disabled = !lv.visible;
      $('[data-role="opacity-out"]', row).textContent = `${lv.opacity}%`;
    }
    for (const b of el.querySelectorAll("[data-view]")) {
      const active = (supports3d ? state.view : "2d") === b.dataset.view;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-pressed", active);
    }
    const ex = $('[data-role="exaggeration"]');
    if (ex) {
      ex.value = state.terrainExaggeration;
      $('[data-role="exaggeration-out"]').textContent = `×${state.terrainExaggeration}`;
      $('[data-role="exaggeration-row"]').hidden = state.view !== "3d";
    }
  }

  sync(store.getState());
  return store.subscribe(sync);
}
