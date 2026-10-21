// แปลง state ของ store เป็นรายการ layer ตาม MapLibre style spec (ฟังก์ชันล้วน ไม่แตะแผนที่)
// ตัวเชื่อมแผนที่เรียก describeLayers() ทุกครั้งที่ state เปลี่ยน แล้วอัปเดตเฉพาะค่าที่ต่างจากเดิม

import { LEVELS, META_KEY } from "./config.js";

export function layerIds(prefix, level) {
  return {
    casing: `${prefix}-${level}-casing`,
    line: `${prefix}-${level}-line`,
    label: `${prefix}-${level}-label`,
  };
}

export function sourceId(prefix, key) {
  return `${prefix}-src-${key}`;
}

/** [[zoom, value], ...] → expression สอดแทรกตามซูม (บวก add ทุกค่า) */
export function zoomRamp(stops, add = 0) {
  if (typeof stops === "number") return stops + add;
  if (stops.length === 1) return stops[0][1] + add;
  return ["interpolate", ["linear"], ["zoom"], ...stops.flatMap(([z, v]) => [z, v + add])];
}

function withSourceLayer(layer, ref) {
  if (ref.sourceLayer) layer["source-layer"] = ref.sourceLayer;
  if (ref.filter) layer.filter = ref.filter;
  return layer;
}

/**
 * @param {object} state  จาก store.getState()
 * @param {object} resolved  ผลของ dataset.load()
 * @param {object} ctx
 * @param {string} ctx.prefix
 * @param {string[]} ctx.font
 * @param {boolean} ctx.terrain  มี source DEM หรือไม่
 * @param {boolean} [ctx.supports3d]  false = แสดงแบบ 2d เสมอ (เช่น Leaflet)
 * @param {object} [ctx.metadata]  metadata เพิ่มเติมของทุก layer
 * @param {object} [ctx.lineMetadata]  metadata เพิ่มเติมของ layer เส้น
 * @returns {{below: object[], top: object[]}}  below = แทรกใต้ป้ายของแผนที่ฐาน, top = บนสุด
 */
export function describeLayers(state, resolved, ctx) {
  const view = ctx.supports3d === false ? "2d" : state.view;
  const meta = (level, role) => ({ ...ctx.metadata, [META_KEY]: { level, role } });

  const hillshade = [];
  const casings = [];
  const lines = [];
  const labels = [];

  if (ctx.terrain) {
    hillshade.push({
      id: `${ctx.prefix}-hillshade`,
      type: "hillshade",
      source: `${ctx.prefix}-dem-hs`,
      metadata: meta(null, "hillshade"),
      layout: { visibility: view === "3d" ? "visible" : "none" },
      paint: {
        "hillshade-exaggeration": 0.35,
        "hillshade-shadow-color": "#473b24",
      },
    });
  }

  // unshift: ระดับใหญ่อยู่ท้ายรายการ จึงวาดทับระดับเล็ก และได้วางป้ายก่อน
  for (const level of LEVELS) {
    const refs = resolved.levels[level];
    if (!refs) continue;
    const lv = state.levels[level];
    const st = state.styles[level];
    const ids = layerIds(ctx.prefix, level);
    const op = lv.opacity / 100;
    const visibility = lv.visible ? "visible" : "none";
    const lineSrc = sourceId(ctx.prefix, refs.line.source);

    casings.unshift(
      withSourceLayer(
        {
          id: ids.casing,
          type: "line",
          source: lineSrc,
          minzoom: st.minzoom,
          metadata: { ...meta(level, "casing"), ...ctx.lineMetadata },
          layout: { visibility, "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": st.casingColor,
            "line-width": zoomRamp(st.width, st.casingWidth),
            "line-opacity": 0.7 * op,
          },
        },
        refs.line,
      ),
    );

    const linePaint = {
      "line-color": st.color,
      "line-width": zoomRamp(st.width),
      "line-opacity": op,
    };
    if (st.dash) linePaint["line-dasharray"] = st.dash;
    lines.unshift(
      withSourceLayer(
        {
          id: ids.line,
          type: "line",
          source: lineSrc,
          minzoom: st.minzoom,
          metadata: { ...meta(level, "line"), ...ctx.lineMetadata },
          layout: { visibility, "line-join": "round", "line-cap": st.dash ? "butt" : "round" },
          paint: linePaint,
        },
        refs.line,
      ),
    );

    if (refs.label) {
      const layout = {
        visibility: lv.visible && lv.labels ? "visible" : "none",
        "text-field": ["to-string", ["get", refs.label.name]],
        "text-font": ctx.font,
        "text-size": zoomRamp(st.labelSize),
        "text-max-width": 7,
        "text-padding": 3,
        "text-pitch-alignment": "viewport",
        "text-rotation-alignment": "viewport",
      };
      // ค่าน้อยได้วางป้ายก่อนเมื่อชนกัน (dataset กำหนดว่าวัดจากอะไร)
      if (refs.label.sortKey) layout["symbol-sort-key"] = refs.label.sortKey;
      labels.unshift(
        withSourceLayer(
          {
            id: ids.label,
            type: "symbol",
            source: sourceId(ctx.prefix, refs.label.source),
            minzoom: st.labelMinzoom,
            maxzoom: st.labelMaxzoom,
            metadata: meta(level, "label"),
            layout,
            paint: {
              "text-color": st.labelColor ?? st.color,
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.5,
              "text-opacity": op,
            },
          },
          refs.label,
        ),
      );
    }
  }

  return { below: [...hillshade, ...casings, ...lines], top: labels };
}
