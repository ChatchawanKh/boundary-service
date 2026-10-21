// ชุดข้อมูล (dataset): บอกตัวเชื่อมแผนที่ว่าเส้นและป้ายของแต่ละระดับมาจาก source ไหน
//
// ทุกอย่างมาจาก OpenFreeMap ผ่าน /boundary-tiles ที่ tileMiddleware() ฝั่ง server ทำให้ (src/server.js)
//   layer "boundary"  เส้น admin_level 4/6/8 = จังหวัด/อำเภอ/ตำบล ตัดเฉพาะในไทยแล้ว
//   layer "label"     จุดชื่อ field level = "Province" | "Amphoe" | "Tambon"
// ระดับตำบล (เส้นและป้าย) มาจาก service ของ GISTDA แทน OSM (src/tambon.js)
//
// dataset.load() คืนค่าที่ตัวเชื่อมใช้สร้าง source/layer และ cache ไว้

import { ATTRIBUTION, LEVELS, OPENFREEMAP_ADMIN_LEVELS, THAILAND_BOUNDS } from "./config.js";

// worker ของ MapLibre โหลด tile จาก blob: URL จึงใช้ path แบบ relative ไม่ได้ ต้องเป็น URL เต็ม
function absoluteUrl(url) {
  const base = globalThis.location?.href;
  return (base ? new URL(url, base).href : url).replace(/\/$/, "");
}

/** URL แบบ template ({fontstack}, {range}) → URL เต็ม โดยไม่ encode วงเล็บปีกกา */
export function absoluteTemplate(template) {
  const loc = globalThis.location;
  if (!loc || /^[a-z]+:\/\//i.test(template)) return template;
  return template.startsWith("/") ? loc.origin + template : new URL(".", loc.href).href + template;
}

/**
 * @param {object} [options]
 * @param {string} [options.tiles="/boundary-tiles"]  URL ของ tileMiddleware (tile อยู่ที่ {tiles}/{z}/{x}/{y})
 * @param {boolean} [options.labels=true]  false = เส้นอย่างเดียว
 * @param {boolean} [options.gistdaTambon=true]  server ใช้ตำบลของ GISTDA (ใส่เครดิตให้) ตรงกับ tileMiddleware({ boundary: { tambon } })
 * @param {Record<string, number>} [options.adminLevels]  ระดับ → admin_level ใน OpenMapTiles
 * @param {number[]} [options.bounds]  [west, south, east, north]
 */
export function boundaryDataset({
  tiles = "/boundary-tiles",
  labels = true,
  gistdaTambon = true,
  adminLevels = OPENFREEMAP_ADMIN_LEVELS,
  bounds = THAILAND_BOUNDS,
} = {}) {
  // ข้อความของ OpenFreeMap อยู่ต้นข้อความ MapLibre จึงซ่อนของ basemap ที่ซ้ำกัน (เป็นส่วนหนึ่งของข้อความนี้)
  const attribution = [ATTRIBUTION.openFreeMap, gistdaTambon && ATTRIBUTION.gistdaTambon].filter(Boolean).join(" · ");
  let resolved = null;

  function build() {
    const sources = {
      boundary: {
        type: "vector",
        tiles: [`${absoluteUrl(tiles)}/{z}/{x}/{y}`],
        minzoom: 0,
        maxzoom: 14, // tile ของ OpenFreeMap มีถึง z14 ซูมเกินนั้น MapLibre ขยายเอง
        bounds,
        // ข้อความเดียวกับ basemap ของ OpenFreeMap → MapLibre รวมเป็นอันเดียว ไม่ขึ้นซ้ำ
        attribution,
      },
    };
    const levels = {};

    for (const level of LEVELS) {
      if (adminLevels[level] == null) continue;
      levels[level] = {
        line: {
          source: "boundary",
          sourceLayer: "boundary",
          filter: ["all", ["==", ["get", "admin_level"], adminLevels[level]], ["!=", ["get", "maritime"], 1]],
        },
        label: labels
          ? {
              source: "boundary",
              sourceLayer: "label",
              filter: ["==", ["get", "level"], level],
              name: "name",
              // rank น้อย = สำคัญกว่า ได้วางป้ายก่อนเมื่อชนกัน
              sortKey: ["to-number", ["get", "rank"], 99],
            }
          : null,
      };
    }

    return { sources, levels, attribution };
  }

  return {
    attribution,
    // async เพื่อให้ dataset แบบอื่นที่ต้องโหลดข้อมูลก่อนใช้ร่วมกับตัวเชื่อมได้
    load: async () => (resolved ??= build()),
  };
}
