// Store กลางของชั้นขอบเขตการปกครอง ไม่ผูกกับ SDK หรือ framework ใด
//
// - UI (React, ปุ่ม HTML) เรียก action เพื่อเปลี่ยน state
// - ตัวเชื่อมแผนที่ (bindMapLibre, bindLeaflet) subscribe แล้ววาดตาม state
//
// แผนที่หลายตัวใช้ store เดียวกันได้ เช่น MapLibre กับ Leaflet วางคู่กันแล้วซิงก์กันเอง
// state เป็น immutable: ทุก action คืน object ใหม่ ส่วนที่ไม่เปลี่ยนคง reference เดิม
// จึงใช้กับ React useSyncExternalStore ได้ตรงๆ

import { DEFAULT_LEVEL_STYLES, LEVELS, VIEWS } from "./config.js";

const PERSIST_FIELDS = ["levels", "view", "terrainExaggeration"];

function assertLevel(level) {
  if (!LEVELS.includes(level)) {
    throw new Error(`admin-boundary: ไม่รู้จักระดับ "${level}" (ใช้ได้: ${LEVELS.join(", ")})`);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

function buildInitialState(options) {
  const levels = {};
  const styles = {};
  for (const level of LEVELS) {
    levels[level] = {
      visible: true,
      opacity: 100,
      labels: true,
      ...options.levels?.[level],
    };
    styles[level] = { ...DEFAULT_LEVEL_STYLES[level], ...options.styles?.[level] };
  }
  return {
    levels,
    styles,
    view: options.view ?? "2d",
    terrainExaggeration: options.terrainExaggeration ?? 1.5,
  };
}

function readPersisted(persist) {
  if (!persist) return null;
  try {
    const raw = (persist.storage ?? globalThis.localStorage)?.getItem(persist.key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePersisted(persist, state) {
  if (!persist) return;
  try {
    const picked = {};
    for (const field of PERSIST_FIELDS) picked[field] = state[field];
    (persist.storage ?? globalThis.localStorage)?.setItem(persist.key, JSON.stringify(picked));
  } catch {
    // storage เต็มหรือถูกปิด (private mode) ไม่ต้องทำอะไร
  }
}

/**
 * @param {object} [options]
 * @param {Record<string, {visible?: boolean, opacity?: number, labels?: boolean}>} [options.levels]
 * @param {Record<string, object>} [options.styles]  override DEFAULT_LEVEL_STYLES บางค่า
 * @param {"2d"|"2.5d"|"3d"} [options.view]
 * @param {number} [options.terrainExaggeration]
 * @param {{key: string, storage?: Storage}} [options.persist]  จำการเปิด/ปิดชั้นและมุมมองไว้ใน localStorage
 */
export function createBoundaryStore(options = {}) {
  const initial = buildInitialState(options);
  const persisted = readPersisted(options.persist);
  let state = initial;
  if (persisted) {
    const levels = { ...initial.levels };
    for (const level of LEVELS) {
      if (persisted.levels?.[level]) levels[level] = { ...levels[level], ...persisted.levels[level] };
    }
    state = {
      ...initial,
      levels,
      view: VIEWS.includes(persisted.view) ? persisted.view : initial.view,
      terrainExaggeration: persisted.terrainExaggeration ?? initial.terrainExaggeration,
    };
  }

  const listeners = new Set();

  function getState() {
    return state;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function setState(updater) {
    const prev = state;
    const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
    if (next === prev) return;
    state = next;
    if (PERSIST_FIELDS.some((f) => next[f] !== prev[f])) writePersisted(options.persist, next);
    for (const listener of [...listeners]) listener(next, prev);
  }

  function patchLevel(level, patch) {
    assertLevel(level);
    setState((s) => {
      const merged = { ...s.levels[level], ...patch };
      if (shallowEqual(merged, s.levels[level])) return s;
      return { ...s, levels: { ...s.levels, [level]: merged } };
    });
  }

  return {
    getState,
    subscribe,
    setState,

    setLevelVisible(level, visible) {
      patchLevel(level, { visible: Boolean(visible) });
    },
    toggleLevel(level) {
      assertLevel(level);
      patchLevel(level, { visible: !state.levels[level].visible });
    },
    /** @param {number} opacity 0-100 */
    setLevelOpacity(level, opacity) {
      patchLevel(level, { opacity: clamp(Math.round(Number(opacity) || 0), 0, 100) });
    },
    setLevelLabels(level, labels) {
      patchLevel(level, { labels: Boolean(labels) });
    },
    setLevelStyle(level, stylePatch) {
      assertLevel(level);
      setState((s) => {
        const merged = { ...s.styles[level], ...stylePatch };
        if (shallowEqual(merged, s.styles[level])) return s;
        return { ...s, styles: { ...s.styles, [level]: merged } };
      });
    },

    /** @param {"2d"|"2.5d"|"3d"} view */
    setView(view) {
      if (!VIEWS.includes(view)) {
        throw new Error(`admin-boundary: view ต้องเป็น ${VIEWS.join(", ")}`);
      }
      setState((s) => (s.view === view ? s : { ...s, view }));
    },
    setTerrainExaggeration(value) {
      const v = clamp(Number(value) || 1, 0.1, 10);
      setState((s) => (s.terrainExaggeration === v ? s : { ...s, terrainExaggeration: v }));
    },

    /** คืนค่าเริ่มต้นทั้งหมด (รวมค่าที่จำไว้ใน storage) */
    reset() {
      setState(() => buildInitialState(options));
    },
  };
}
