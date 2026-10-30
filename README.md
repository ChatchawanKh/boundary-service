# boundary-service

ใส่ขอบเขตการปกครองของประเทศไทย (จังหวัด / อำเภอ / ตำบล) พร้อมป้ายชื่อภาษาไทย ลงบนแผนที่ **MapLibre GL** หรือ **Leaflet** ได้ในไม่กี่บรรทัด

- **ข้อมูลจาก GISTDA:** ทุกระดับดึงจาก ArcGIS MapServer ของ GISTDA (ข้อมูลกรมการปกครอง) ไม่ต้องเตรียมไฟล์ GeoJSON เอง
- **เส้นซ้อนกันพอดี:** เส้นทั้งสามระดับสร้างจากขอบตำบลชุดเดียว
- **ฟรี ไม่ต้องมี API key**
- **ใช้กับแผนที่ฐานได้ทุกแบบ:** หน้าตัวอย่างใช้ OpenFreeMap
- **มุมมอง 3D:** MapLibre แสดงได้ทั้ง 2D, 2.5D และ 3D (ภูมิประเทศ + เงาภูเขา)

ชื่อ package คือ `admin-boundary` ฝั่ง server ต้องใช้ Node 18 ขึ้นไป

หน้าอธิบายแนวคิดแบบมีภาพประกอบ: https://claude.ai/artifact/Mpe52yH5f8DYpMAaiDHSyG

| ระดับ | จำนวน | เส้น |
| --- | --- | --- |
| จังหวัด | 77 | ดำ เส้นทึบ |
| อำเภอ / เขต | 929 | เทาเข้ม เส้นประ |
| ตำบล / แขวง | 7,408 | ขาว เส้นประ บนเส้นรองพื้นเทาเข้ม |

## สารบัญ

- [ลองเปิดตัวอย่าง](#ลองเปิดตัวอย่าง)
- [ทำงานอย่างไร](#ทำงานอย่างไร)
- [ใส่ในโปรเจกต์ของคุณ](#ใส่ในโปรเจกต์ของคุณ)
- [ควบคุมจาก UI ด้วย store](#ควบคุมจาก-ui-ด้วย-store)
- [เห็นอะไรที่ซูมไหน](#เห็นอะไรที่ซูมไหน)
- [ปรับสไตล์](#ปรับสไตล์)
- [มุมมอง 3D](#มุมมอง-3d)
- [ฟอนต์ของป้าย](#ฟอนต์ของป้าย)
- [ใช้กับ Sphere / air_gistda](#ใช้กับ-sphere--air_gistda)
- [ก่อนขึ้นระบบจริง](#ก่อนขึ้นระบบจริง)
- [แนวทางพัฒนาต่อ](#แนวทางพัฒนาต่อ)
- [API](#api)
- [แก้ปัญหา](#แก้ปัญหา)
- [โครงสร้างไฟล์](#โครงสร้างไฟล์)

## ลองเปิดตัวอย่าง

```bash
npm install
npm run serve        # เปิด http://localhost:3300/examples/
npm test             # unit test ไม่ต้องใช้เบราว์เซอร์และไม่ออกเน็ต
```

| หน้า | แสดงอะไร |
| --- | --- |
| [`examples/maplibre/`](examples/maplibre/index.html) | MapLibre มุมมอง 2D / 2.5D / 3D และสลับแผนที่ฐาน |
| [`examples/leaflet/`](examples/leaflet/index.html) | Leaflet กับแผนที่ฐานแบบภาพ และ marker |
| [`examples/react/`](examples/react/index.html) | React ใช้ store เดียวคุม MapLibre และ Leaflet พร้อมกัน |

**ครั้งแรกต้องรอราว 30 วินาที:** server ดาวน์โหลดข้อมูลจาก GISTDA ราว 150 MB แล้วสร้างเส้น เสร็จแล้ว log จะขึ้น `admin-boundary: พร้อม 7408 ตำบล ...` ครั้งต่อไปอ่านจาก cache ใน `.cache/admin-boundary/`

**ข้อควรรู้:**
- ต้องเปิดผ่าน `npm run serve` เปิดไฟล์ HTML ตรงๆ ไม่ได้
- แก้ไฟล์ฝั่ง server แล้วต้องรีสตาร์ต (`Ctrl+C` แล้ว `npm run serve` ใหม่) ส่วนไฟล์หน้าเว็บแค่รีเฟรช
- พอร์ต 3300 ไม่ว่าง ให้ใช้ `node scripts/serve.mjs 8080`

## ทำงานอย่างไร

```
 GISTDA MapServer            server ของโปรเจกต์คุณ                หน้าเว็บ
 ────────────────            ─────────────────────                ────────
 layer 2 จังหวัด   ─ดึงครั้งแรก─▶  tileMiddleware()                     createBoundaryStore()
 layer 3 อำเภอ       cache 30 วัน   · รวมขอบร่วม จำแนกระดับ              │
 layer 4 ตำบล                     · ตัดเป็น vector tile      ─tile─▶   bindMapLibre / bindLeaflet
                                  · ส่งฟอนต์ Kanit ของป้าย              │
                                                                    แผนที่
```

โปรเจกต์ที่นำไปใช้ต้องมี 2 ส่วนเสมอ:

1. **ฝั่ง server:** `tileMiddleware()` ดึงข้อมูลจาก GISTDA ครั้งเดียว ทำเป็นเส้นที่แยกระดับแล้ว และส่งให้หน้าเว็บเป็น vector tile ขั้นนี้ทำในเบราว์เซอร์ไม่ได้ เหตุผลอยู่ใน [REF.md](REF.md#ทำไมต้องผ่าน-server)
2. **ฝั่งหน้าเว็บ:** มีชิ้นส่วน 2 อย่าง
   - **store:** เก็บสถานะว่าเปิด/ปิดระดับไหน ใช้สไตล์อะไร และมุมมองแบบไหน
   - **ตัวผูกแผนที่:** แปลงสถานะใน store เป็น layer บนแผนที่

| import | ใช้ที่ | มีอะไร |
| --- | --- | --- |
| `admin-boundary` | เบราว์เซอร์ | `createBoundaryStore`, `bindMapLibre`, `bindLeaflet`, `boundaryDataset`, ค่าตั้งต้น |
| `admin-boundary/react` | เบราว์เซอร์ | `BoundaryProvider`, `useBoundary`, `useMapLibreBoundary`, `useLeafletBoundary` |
| `admin-boundary/server` | Node 18+ | `tileMiddleware`, `createBoundaryTiles`, `createGlyphs` |

## ใส่ในโปรเจกต์ของคุณ

### 1. ติดตั้ง

package ส่ง source ESM ตรงๆ ไม่มีขั้น build

```bash
npm i "github:ChatchawanKh/boundary-service"

# ปักเวอร์ชันด้วย commit หรือ tag
npm i "github:ChatchawanKh/boundary-service#<commit หรือ tag>"
```

ติดตั้งไลบรารีแผนที่ที่ใช้เองด้วย:

```bash
npm i maplibre-gl                                          # MapLibre
npm i leaflet maplibre-gl @maplibre/maplibre-gl-leaflet    # Leaflet
```

ติดตั้งจากโฟลเดอร์ในเครื่องก็ได้ ใช้ `npm pack` ในโฟลเดอร์นี้ แล้ว `npm i <path ไปไฟล์ .tgz>` ในโปรเจกต์ของคุณ

ถ้าติดตั้งด้วย `npm i ../boundary-service` ซึ่งเป็น symlink และใช้คู่กับ Vite ให้เพิ่ม `resolve: { dedupe: ["react", "react-dom"] }` ใน `vite.config.js`

### 2. ใส่ middleware ฝั่ง server

`tileMiddleware()` เป็น middleware แบบ connect `(req, res, next)` ตอบแค่ 2 path ที่เหลือส่งต่อไปตามปกติ

| path | ส่งอะไร |
| --- | --- |
| `/boundary-tiles/{z}/{x}/{y}` | vector tile ของเส้นและป้าย |
| `/boundary-fonts/{fontstack}/{range}.pbf` | ฟอนต์ของป้าย (ดู [ฟอนต์ของป้าย](#ฟอนต์ของป้าย)) |

**Vite** ใช้ได้ทั้ง `npm run dev` และ `npm run preview`:

```js
// vite.config.js
import { defineConfig } from "vite";
import { tileMiddleware } from "admin-boundary/server";

export default defineConfig({
  plugins: [
    {
      name: "admin-boundary-tiles",
      configureServer: (server) => server.middlewares.use(tileMiddleware()),
      configurePreviewServer: (server) => server.middlewares.use(tileMiddleware()),
    },
  ],
});
```

**Express:**

```js
import express from "express";
import { tileMiddleware } from "admin-boundary/server";

const app = express();
app.use(tileMiddleware({ boundary: { cacheDir: "/var/cache/admin-boundary" } }));
app.use(express.static("dist"));
app.listen(8080);
```

**Node `http` ล้วน:** ดูตัวอย่างใน [`scripts/serve.mjs`](scripts/serve.mjs)

**อยากใช้ path อื่น:** ตั้งทั้งสองฝั่งให้ตรงกัน

```js
tileMiddleware({ path: "/api/boundary", fontsPath: "/api/fonts" });          // server
bindMapLibre(map, store, {                                                   // หน้าเว็บ
  dataset: boundaryDataset({ tiles: "/api/boundary" }),
  glyphs: "/api/fonts/{fontstack}/{range}.pbf",
});
```

### 3. ผูกกับแผนที่

**MapLibre**

```js
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { bindMapLibre, createBoundaryStore } from "admin-boundary";

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [100.9, 13],
  zoom: 5,
  maxPitch: 75, // ใส่เมื่อจะใช้มุมมอง 3D
});

const store = createBoundaryStore();
const boundary = bindMapLibre(map, store, {
  hideBasemapLayers: ["boundary_3", "boundary_state"], // ซ่อนเส้นจังหวัด/อำเภอของ OpenFreeMap
});
```

- เปลี่ยนแผนที่ฐานด้วย `map.setStyle()` ได้ ชั้นขอบเขตกลับมาเอง
- เลิกใช้เรียก `boundary.destroy()` ซึ่งจะถอดทุกอย่างที่ใส่ไว้และคืนค่าเดิมให้แผนที่

**Leaflet**

```js
import L from "leaflet";
import "maplibre-gl";
import "@maplibre/maplibre-gl-leaflet";
import { bindLeaflet, createBoundaryStore } from "admin-boundary";

const map = L.map("map").setView([13, 100.9], 6);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

const boundary = bindLeaflet(map, createBoundaryStore(), { L });
```

- Leaflet วาดเส้นและป้ายผ่าน MapLibre ที่ซ้อนเป็น layer หนึ่งใน Leaflet จึงได้สไตล์และฟอนต์เหมือนกัน
- เอียงหรือหมุนไม่ได้ จึงแสดงแบบ 2D เสมอ
- ซูมของ Leaflet มากกว่าซูมของ MapLibre 1 ระดับ

**React**

```js
// src/stores/boundary.js
import { createBoundaryStore } from "admin-boundary";

export const boundaryStore = createBoundaryStore({
  persist: { key: "my-app:boundary" }, // จำการเปิด/ปิดชั้นไว้ใน localStorage ไม่ใส่ก็ได้
});
```

```jsx
// main.jsx
import { BoundaryProvider } from "admin-boundary/react";
import { boundaryStore } from "./stores/boundary";

<BoundaryProvider store={boundaryStore}>
  <App />
</BoundaryProvider>;
```

```jsx
// MapView.jsx
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { useMapLibreBoundary } from "admin-boundary/react";

export function MapView() {
  const ref = useRef(null);
  const [map, setMap] = useState(null);

  useEffect(() => {
    const m = new maplibregl.Map({
      container: ref.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [100.9, 13],
      zoom: 5,
    });
    setMap(m);
    return () => m.remove();
  }, []);

  useMapLibreBoundary(map, { hideBasemapLayers: ["boundary_3", "boundary_state"] });

  return <div ref={ref} style={{ height: "100vh" }} />;
}
```

- Leaflet ใช้ `useLeafletBoundary(leafletMap, { L })` แบบเดียวกัน
- hook อ่าน options ครั้งเดียวตอนผูก ถ้าจะเปลี่ยน options ให้เปลี่ยน `key` ของ component

### ใช้ tile ตรงๆ โดยไม่ผ่านตัวผูก

ถ้าโปรเจกต์มี style ของตัวเองอยู่แล้ว ใส่ source และ layer เองได้ ฝั่ง server ยังต้องมี `tileMiddleware()` เหมือนเดิม

tile มี 2 layer:
- **`boundary`:** เส้น มี field `admin_level` คือ 4 = จังหวัด, 6 = อำเภอ, 8 = ตำบล
- **`label`:** จุดวางป้าย มี field `level` (`"Province"` / `"Amphoe"` / `"Tambon"`), `name` และ `rank` (ยิ่งน้อยยิ่งเป็นพื้นที่ใหญ่)

```js
map.addSource("admin", {
  type: "vector",
  tiles: [location.origin + "/boundary-tiles/{z}/{x}/{y}"], // ต้องเป็น URL เต็ม
  maxzoom: 14,
});
map.addLayer({
  id: "amphoe-line", type: "line", source: "admin", "source-layer": "boundary",
  filter: ["==", ["get", "admin_level"], 6],
  paint: { "line-color": "#4d4d4d", "line-dasharray": [3, 2] },
});
```

## ควบคุมจาก UI ด้วย store

ปุ่มหรือ checkbox ในโปรเจกต์ของคุณสั่งผ่าน store แผนที่ทุกตัวที่ผูกกับ store นั้นจะเปลี่ยนตามเอง ไม่ต้องจัดการ layer ของแผนที่โดยตรง แผนที่กี่ตัวก็ใช้ store เดียวกันได้

```js
store.setLevelVisible("Tambon", false);   // ซ่อนตำบล
store.setLevelLabels("Amphoe", false);    // ซ่อนป้ายอำเภอ เส้นยังอยู่
store.setLevelOpacity("Province", 50);    // ความทึบ 0–100
store.setView("3d");                      // "2d" | "2.5d" | "3d"
store.reset();                            // กลับค่าเริ่มต้น

store.subscribe((state, prev) => console.log(state.levels.Tambon.visible));
```

ตั้งค่าเริ่มต้นตอนสร้าง store:

```js
createBoundaryStore({
  levels: { Tambon: { visible: false }, Amphoe: { labels: false } },
  view: "2d",
  persist: { key: "my-app:boundary" },
});
```

React อ่านค่าใน store ด้วย hook ฟังก์ชันที่ส่งให้ `useBoundary` ต้องคืนค่าที่มีอยู่ใน state แล้ว ห้ามสร้าง object ใหม่

```jsx
import { useBoundary, useBoundaryStore } from "admin-boundary/react";

function TambonToggle() {
  const store = useBoundaryStore();
  const visible = useBoundary((s) => s.levels.Tambon.visible);
  return (
    <label>
      <input type="checkbox" checked={visible} onChange={(e) => store.setLevelVisible("Tambon", e.target.checked)} />
      ตำบล
    </label>
  );
}
```

## เห็นอะไรที่ซูมไหน

เกณฑ์เดียวกับ air_gistda:
- **เส้นแสดงสะสม:** ซูมลึกขึ้นจะเห็นระดับเล็กเพิ่ม
- **ป้ายแสดงทีละระดับ:** ป้ายไม่ซ้อนกัน

| ซูม (MapLibre) | เส้นที่เห็น | ป้ายที่เห็น |
| --- | --- | --- |
| 1–3 | – | จังหวัด |
| 4–7 | จังหวัด | จังหวัด |
| 8–9 | จังหวัด + อำเภอ | จังหวัด |
| 10–12 | จังหวัด + อำเภอ | อำเภอ |
| 13 ขึ้นไป | จังหวัด + อำเภอ + ตำบล | ตำบล |

ป้ายวางที่จุดที่อยู่ลึกที่สุดในพื้นที่ ถ้าป้ายชนกัน พื้นที่ที่ใหญ่กว่าได้วางก่อน ปรับช่วงซูมได้ด้วย `minzoom`, `labelMinzoom` และ `labelMaxzoom` ในหัวข้อถัดไป

## ปรับสไตล์

ปรับได้ทั้งตอนสร้าง store และระหว่างใช้งาน:

```js
createBoundaryStore({
  styles: { Province: { color: "#000000", width: [[5, 1.5], [12, 4]] } },
});

store.setLevelStyle("Tambon", { dash: [1, 2], color: "#999999" });
store.setLevelStyle("Amphoe", { labelMinzoom: 9, labelSize: 14 }); // ป้ายอำเภอขึ้นเร็วขึ้นและเล็กลง
```

| ค่า | ความหมาย |
| --- | --- |
| `color`, `width`, `opacity` | สี ความหนา (px) และความทึบของเส้น |
| `dash` | เส้นประ `[ยาว, เว้น]` นับเป็นเท่าของความหนาเส้น |
| `casingColor`, `casingWidth`, `casingOpacity` | เส้นรองพื้นใต้เส้นหลัก ช่วยให้เส้นเด่นบนพื้นหลังทุกสี |
| `minzoom` | ซูมที่เส้นเริ่มแสดง |
| `labelMinzoom`, `labelMaxzoom` | ช่วงซูมของป้าย (`labelMaxzoom` คือซูมที่ป้ายเริ่มหาย) |
| `labelSize`, `labelColor` | ขนาดและสีของป้าย |

ค่าตัวเลขใส่เป็นค่าเดียว หรือ `[[ซูม, ค่า], ...]` ให้เปลี่ยนตามซูมก็ได้ `opacity` จะคูณกับความทึบของระดับนั้นใน store อีกที

แผนที่ฐานสีเข้มให้เปลี่ยนเส้นเป็นโทนสว่าง เช่น `color: "#f2f2f2", casingColor: "#000000"`

<details>
<summary>ค่าตั้งต้นทั้งหมด (<code>DEFAULT_LEVEL_STYLES</code> ใน <a href="src/config.js">src/config.js</a>)</summary>

ลูกศรคือ ซูม → ค่า ค่าระหว่างซูมสอดแทรกให้เอง

| ระดับ | `minzoom` | `color` | `width` (px) | `opacity` | `dash` | เส้นรองพื้น (สี, ความหนา, ความทึบ) |
| --- | --- | --- | --- | --- | --- | --- |
| Province | 4 | `#1a1a1a` | 4→0.5, 8→1.2, 12→2, 16→2.6 | 4→0.45, 8→1 | ทึบ | ขาว, 4→1.2 … 16→5, 4→0.3, 8→0.6 |
| Amphoe | 8 | `#4d4d4d` | 8→0.8, 14→1.6 | 1 | `[3, 2]` | ขาว, 8→1.6, 14→3, 0.35 |
| Tambon | 13 | `#ffffff` | 0.94 (0.25 มม.) | 1 | ขีด 4 px เว้น 3 px | `#383838`, 2.2, 0.55 |

| ระดับ | `labelMinzoom` | `labelMaxzoom` |
| --- | --- | --- |
| Province | 1 | 10 |
| Amphoe | 10 | 13 |
| Tambon | 13 | 24 |

ป้ายทุกระดับ: 16 px สี `#383838` ขอบขาวฟุ้ง (halo 2 px, blur 1) ห่างกันอย่างน้อย 6 px ไม่ตัดบรรทัด

</details>

## มุมมอง 3D

ใช้ได้เฉพาะ MapLibre สั่งด้วย `store.setView(...)`

| มุมมอง | กล้อง (เอียง / หมุน) | ภูมิประเทศ | เงาภูเขา |
| --- | --- | --- | --- |
| `"2d"` | 0° / 0° | – | – |
| `"2.5d"` | 55° / −15° | – | – |
| `"3d"` | 65° / −20° | ยกตามความสูงจริง ×1.5 | มี |

- **ความสูง:** มาจาก Terrain Tiles (Mapzen บน AWS) ฟรี ไม่ต้องมี key แผนที่แสดงเครดิตให้เอง
- **ปรับความสูง:** `store.setTerrainExaggeration(2)` ปรับได้ 0.1–10
- **มุมเอียง:** ต้องตั้ง `maxPitch: 75` ตอนสร้างแผนที่ เพราะค่าเริ่มต้นของ MapLibre (60°) เอียงถึงมุม 3D ไม่ได้
- **เส้นและป้าย:** เส้นขอบเขตปูไปตามสันเขาและหุบเขา ป้ายหันหน้าเข้าจอเสมอ
- **DEM อื่น:** ส่ง `terrain: { tiles, encoding, tileSize, maxzoom, attribution }` ให้ `bindMapLibre`
- **ไม่ใช้ 3D:** ส่ง `terrain: false` ส่วน `camera: false` คือไม่ต้องขยับกล้องให้เมื่อเปลี่ยนมุมมอง

## ฟอนต์ของป้าย

ป้ายใช้ฟอนต์ [Kanit](https://fonts.google.com/specimen/Kanit) Regular

MapLibre วาดป้ายด้วยไฟล์ glyph (`.pbf`) ที่โหลดจาก glyph server เท่านั้น ใช้ฟอนต์เว็บแบบ CSS ไม่ได้ และ glyph server ของแผนที่ฐานทั่วไปไม่มี Kanit จึงทำแบบนี้:

1. แปลง Kanit เป็น glyph เก็บไว้ใน [`fonts/Kanit Regular/`](fonts/) (313 KB พร้อมสัญญาอนุญาต `OFL.txt`)
2. `tileMiddleware` ส่ง glyph ที่ `/boundary-fonts/...`
   - ฟอนต์อื่นที่แผนที่ฐานใช้ ส่งต่อไป glyph server ของ OpenFreeMap
   - ถ้าใช้แผนที่ฐานอื่น ให้ตั้ง `tileMiddleware({ glyphs: { upstream } })`
3. `bindMapLibre` ชี้แผนที่ไปที่ glyph ชุดนี้ ป้ายของแผนที่ฐานยังเป็นฟอนต์เดิม และคืนค่าเดิมเมื่อ `destroy()`

**ใช้ฟอนต์อื่น** เช่น Kanit Medium หรือ Sarabun: ดาวน์โหลดไฟล์ TTF ที่อนุญาตให้แจกจ่ายต่อได้ แล้วแปลงด้วยสคริปต์ที่มากับ repo

```bash
npm run build:glyphs -- Kanit-Medium.ttf "Kanit Medium"     # ได้ fonts/Kanit Medium/*.pbf
```

แล้วใช้ `bindMapLibre(map, store, { font: ["Kanit Medium"] })`

**ข้อจำกัด:** MapLibre จัดวางสระบนและวรรณยุกต์ไทยได้ไม่สมบูรณ์ คำอย่าง "ปั้น" อาจซ้อนกันเล็กน้อย เป็นแบบนี้กับทุกฟอนต์

## ใช้กับ Sphere / air_gistda

Sphere ครอบ MapLibre ไว้ ให้ส่ง MapLibre map ที่อยู่ข้างใน (`resolveNativeMap` ของ air_gistda) พร้อมค่าเฉพาะของ Sphere:

```js
bindMapLibre(resolveNativeMap(sphereMap), store, {
  glyphs: false,                   // ไม่แตะ glyph server ของ Sphere
  font: ["noto"],                  // ฟอนต์ภาษาไทยของ Sphere (ไม่มี Kanit)
  lineMetadata: { zIndex: 1000 },  // ให้ชั้นที่ Sphere เพิ่มทีหลังอยู่ใต้เส้นขอบเขต
});
```

ต้องเพิ่ม `app.use(tileMiddleware())` ใน proxy-server ของ air_gistda ด้วย

ถ้าต้องการป้าย Kanit บน Sphere:
- ตั้ง `tileMiddleware({ glyphs: { upstream: "<glyph server ของ Sphere>/{fontstack}/{range}.pbf" } })`
- ใช้ `glyphs` ค่าเริ่มต้นแทน `false`

ส่วนนี้ยังไม่ได้ทดสอบกับ Sphere จริง

## ก่อนขึ้นระบบจริง

| เรื่อง | ต้องรู้ |
| --- | --- |
| ต้องมี server | โฮสต์แบบไฟล์ static อย่างเดียว เช่น GitHub Pages ใช้ไม่ได้ |
| หน้าเว็บกับ server คนละ origin | middleware ไม่ส่ง CORS header ให้วางไว้ใต้ origin เดียวกับหน้าเว็บ ผ่าน proxy หรือเพิ่ม CORS เอง แล้วส่ง URL เต็มให้ `boundaryDataset({ tiles })` และ `glyphs` |
| ครั้งแรกหลังเปิด server | ดาวน์โหลดราว 20 วินาที สร้างเส้นราว 7 วินาที คำขอ tile ระหว่างนั้นรอจนพร้อม |
| หน่วยความจำ | ราว 750 MB ระหว่างสร้างเส้น เหลือราว 60 MB หลังเสร็จ |
| cache | เก็บที่ `.cache/admin-boundary/` นับจากโฟลเดอร์ที่รัน server อายุ 30 วัน บน server จริงตั้ง `cacheDir` ให้อยู่ถาวร |
| GISTDA ล่ม | ถ้ามี cache บนดิสก์ ใช้ต่อได้ ถ้าไม่มี tile ตอบ 502 และลองใหม่ทุก 60 วินาที |
| แผนที่ฐานของ Leaflet | `tile.openstreetmap.org` ในตัวอย่างไม่เหมาะกับระบบที่มีคนใช้มาก ตามนโยบายของ OSM ให้เปลี่ยนผู้ให้บริการหรือโฮสต์เอง |
| สัญญาอนุญาตข้อมูล | service ของ GISTDA ไม่ได้ระบุสัญญาอนุญาต ควรสอบถามก่อนเปิดให้คนทั่วไปใช้ ข้อมูลเป็นของปี 2556 ไม่ใช้เป็นหลักฐานทางกฎหมาย |

ทุกบริการที่ใช้ฟรีและไม่ต้องมี API key: GISTDA MapServer, OpenFreeMap, Terrain Tiles บน AWS และฟอนต์ Kanit (OFL) แต่ไม่มีบริการไหนรับประกันว่าจะเปิดตลอด

## แนวทางพัฒนาต่อ

air_gistda นำ library นี้ไปใช้จริงแล้ว แต่ต้องคัดลอกโค้ดไปแก้เองใน `vendor/` และเขียนส่วนเสริมหลายจุด ถ้าจะให้โปรเจกต์ถัดไปใช้ได้โดยไม่ต้องทำซ้ำ library ต้องมีสิ่งเหล่านี้ในตัว

เรื่องแรกสำคัญที่สุด: ถ้าไม่มี index สำเร็จรูป server ที่มีหน่วยความจำ 512 MiB อย่าง Cloud Run จะสร้างเส้นไม่ไหว

| เรื่อง | air_gistda ต้องทำเอง | library ควรมี | ตอนนี้ |
| --- | --- | --- | --- |
| index สำเร็จรูป | การสร้างเส้นใช้หน่วยความจำราว 800 MB เกิน Cloud Run จึงต้องสร้างไฟล์ index (19 MB) ตอน build Docker เอง หลังทำแบบนี้ server เริ่มใน 0.5 วินาที ใช้ 160–350 MB | คำสั่งสร้างไฟล์ index และ `tileMiddleware({ index })` ที่อ่านไฟล์นั้นแทนการดึง GISTDA ตอนรัน | ยังไม่มี |
| cache ตามรุ่น | เพิ่ม `/boundary-tiles/version` และต่อ `?v=<รุ่น>` ท้าย URL ให้เบราว์เซอร์เก็บ tile ได้ 1 ปี | endpoint บอกรุ่น และให้ตัวผูกต่อ `?v=` เอง ตอนนี้ทุก tile ต้องถาม server ทุกครั้ง (no-cache + ETag) | ยังไม่มี |
| ไม่ต้องคัดลอกโค้ดไปแก้ | เก็บสำเนาไว้ใน `vendor/admin-boundary` แก้โดยทำเครื่องหมาย `[air_gistda]` อัปเดตต้องคัดลอกทับเอง | ออกรุ่นด้วย tag พร้อม changelog และเปลี่ยนจุดที่ air_gistda แก้ให้เป็น option | ยังไม่มี |
| ป้ายอยู่บนสุดเสมอ | ตัวครอบย้ายป้ายขึ้นบนสุดทุกครั้งที่มีชั้นใหม่เข้ามาทับ | option ให้ตัวผูกทำเอง | ยังไม่มี |
| MapLibre รุ่นเก่า | Sphere ใช้ MapLibre 2.4 ซึ่งไม่มี `map.setGlyphs()` จึงให้ proxy ตอบฟอนต์ Kanit บนเส้นทาง glyph ของ Sphere | ตัวอย่างการเสิร์ฟ glyph บน path ของ host ด้วย `createGlyphs` และทดสอบกับ MapLibre 2.x | มีบางส่วน |
| เงาภูเขาแยกจากมุมมอง | เปิด/ปิดเงาภูเขาและปรับความทึบได้เอง ยกพื้นผิวเมื่อเอียงแผนที่ (pitch > 0) | เงาภูเขาเป็นชั้นหนึ่งใน store (เปิด/ปิด ความทึบ) และโหมดยกพื้นผิวตามมุมเอียง ตอนนี้ผูกกับมุมมอง 3D และความเข้มตายตัว | มีบางส่วน |
| deploy แบบ container | ใช้ index จาก image รอบก่อนเป็น seed กัน GISTDA ล่มตอน build และ smoke test `/boundary-tiles` ก่อนสลับ traffic | ตัวอย่าง Dockerfile สำหรับ Cloud Run และ endpoint ตรวจสถานะ | ยังไม่มี |

สิ่งที่ library ทำได้อยู่แล้ว:
- แผนที่ส่งออกใช้ store เดียวกันสร้างชั้นใหม่จาก state ได้
- `lineMetadata: { zIndex }` วางเส้นให้อยู่เหนือชั้นที่ Sphere เพิ่มทีหลัง

ที่มา: บันทึกการนำไปใช้ใน air_gistda https://claude.ai/artifact/9AnJUB3fRMFm7mRutYv8qJ

## API

### `createBoundaryStore(options?)`

| option | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `levels` | ทุกระดับ `{ visible: true, opacity: 100, labels: true }` | ค่าเริ่มต้นต่อระดับ |
| `styles` | `DEFAULT_LEVEL_STYLES` | สไตล์ต่อระดับ ดู [ปรับสไตล์](#ปรับสไตล์) |
| `view` | `"2d"` | `"2d"` \| `"2.5d"` \| `"3d"` |
| `terrainExaggeration` | `1.5` | ความสูงภูมิประเทศใน 3D |
| `persist` | ไม่จำ | `{ key, storage? }` จำ `levels`, `view`, `terrainExaggeration` |

- action: `setLevelVisible`, `toggleLevel`, `setLevelOpacity`, `setLevelLabels`, `setLevelStyle`, `setView`, `setTerrainExaggeration`, `reset`
- พื้นฐาน: `getState`, `subscribe`, `setState`

### `bindMapLibre(map, store, options?)` → `{ ready, attribution, destroy() }`

| option | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `dataset` | `boundaryDataset()` | แหล่ง tile |
| `hideBasemapLayers` | `[]` | id หรือฟังก์ชันเลือก layer ของแผนที่ฐานที่จะซ่อน คืนค่าเดิมตอน `destroy` |
| `font` | `["Kanit Regular"]` | ฟอนต์ของป้าย |
| `glyphs` | `"/boundary-fonts/{fontstack}/{range}.pbf"` | glyph server หรือ `false` = ใช้ของ style เดิม |
| `beforeId` | ป้ายแรกของแผนที่ฐาน | วางเส้นไว้ใต้ layer นี้ |
| `terrain` | Terrain Tiles บน AWS | DEM สำหรับ 3D หรือ `false` |
| `camera` | `true` | เอียง/หมุนกล้องให้เมื่อเปลี่ยนมุมมอง |
| `prefix` | `"admin-boundary"` | คำนำหน้า id ของทุก layer และ source |
| `lineMetadata` | `{}` | metadata เพิ่มให้ layer เส้น |

### `bindLeaflet(leafletMap, store, options?)` → `{ glLayer, glMap, ready, destroy() }`

option เหมือน `bindMapLibre` ยกเว้นเรื่อง 3D และเพิ่ม `L` (ค่าเริ่มต้น `window.L`), `pane`, `glOptions`

### `boundaryDataset(options?)`

| option | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `tiles` | `"/boundary-tiles"` | URL ของ tileMiddleware ใส่แบบ relative ได้ |
| `labels` | `true` | `false` = มีแต่เส้น |
| `adminLevels` | `{ Province: 4, Amphoe: 6, Tambon: 8 }` | ระดับ → `admin_level` ใน tile |
| `bounds` | กรอบประเทศไทย | ไม่ขอ tile นอกกรอบนี้ |

### `admin-boundary/server`

| ฟังก์ชัน | ความหมาย |
| --- | --- |
| `tileMiddleware({ path?, fontsPath?, boundary?, glyphs?, preload?, fetch? })` | middleware แบบ connect มี `.ready()` ไว้รอจนข้อมูลพร้อม |
| `createBoundaryTiles({ cacheDir?, maxAge?, concurrency?, service?, minzoom?, fetch? })` | `(z, x, y) => Promise<Uint8Array \| null>` สำหรับ server ที่ไม่ใช่แบบ connect |
| `createGlyphs({ dir?, upstream?, fetch? })` | `(fontstack, start) => Promise<Uint8Array>` ส่ง glyph |
| `encodeTile(layers, extent?)` | เขียน Mapbox Vector Tile (เส้นและจุด) |

- `boundary` ของ `tileMiddleware` ส่งต่อให้ `createBoundaryTiles` เช่น `{ cacheDir, maxAge, concurrency, service }`
- `service` ค่าเริ่มต้นคือ `GISTDA_ADMIN_SERVICE` ซึ่งมี URL ของ MapServer เลข layer และชื่อ field
- `minzoom` ค่าเริ่มต้น `{ Province: 0, Amphoe: 6, Tambon: 10 }` คือซูมต่ำสุดที่ server ใส่แต่ละระดับลงใน tile ตั้งต่ำกว่าเกณฑ์การแสดงผลไว้ เผื่อปรับ `minzoom` ของสไตล์ลง

### React (`admin-boundary/react`)

`BoundaryProvider`, `useBoundaryStore(store?)`, `useBoundary(selector, store?)`, `useMapLibreBoundary(map, options?, store?)`, `useLeafletBoundary(leafletMap, options?, store?)`

## แก้ปัญหา

| อาการ | สาเหตุและวิธีแก้ |
| --- | --- |
| ไม่มีเส้นและป้ายเลย | ดู `/boundary-tiles` ใน DevTools > Network ถ้าได้ 404 แปลว่า server ยังไม่มี `tileMiddleware` หรือยังไม่ได้รีสตาร์ตหลังแก้ |
| เปิดหน้าแรกแล้วเส้นยังไม่ขึ้นสักพัก | ครั้งแรกต้องรอดาวน์โหลดและสร้างเส้นราว 30 วินาที รอ log `admin-boundary: พร้อม ...` |
| `/boundary-tiles` ได้ 502 | server ต่อ `gistdaportal.gistda.or.th` ไม่ได้และยังไม่มี cache ดู log `admin-boundary: โหลดข้อมูล GISTDA ไม่สำเร็จ` server จะลองใหม่เองหลัง 60 วินาที |
| แก้แล้วแผนที่ยังเหมือนเดิม | รีสตาร์ต server แล้วรีเฟรช ถ้ายังไม่เปลี่ยน ให้เปิด DevTools แล้วคลิกขวาที่ปุ่มรีโหลด เลือก "Empty Cache and Hard Reload" |
| ข้อมูลไม่อัปเดต | cache อายุ 30 วัน ลบ `.cache/admin-boundary/` แล้วรีสตาร์ตเพื่อดึงใหม่ |
| `EADDRINUSE` ตอน `npm run serve` | มีโปรแกรมใช้พอร์ตอยู่แล้ว ปิดตัวเก่าหรือใช้ `node scripts/serve.mjs 8080` |
| server หน่วยความจำไม่พอตอนเริ่ม | ให้ Node มี heap พอ เช่น `node --max-old-space-size=1024` |
| ป้ายไม่ขึ้นหรือเป็นกล่องสี่เหลี่ยม | ดู `/boundary-fonts/...` ใน DevTools > Network ถ้าได้ 404 แปลว่า server ยังไม่มี `tileMiddleware` หรือ `font` ไม่ตรงกับชื่อโฟลเดอร์ใน `fonts/` |
| เห็นเส้นจังหวัด/อำเภอซ้อนกันสองชุด | ชุดหนึ่งเป็นของแผนที่ฐาน ให้ซ่อนด้วย `hideBasemapLayers` ถ้าแผนที่ฐานเป็นภาพ (Leaflet) จะซ่อนไม่ได้ |
| เส้นตามชายแดน/ชายฝั่งไม่ตรงกับแผนที่ฐาน | เส้นของเราตามข้อมูลกรมการปกครอง ส่วนเส้นประเทศและชายฝั่งเป็นของแผนที่ฐาน อาจห่างกันหลายร้อยเมตรเมื่อซูมลึก ดู [REF.md](REF.md#1-ข้อมูลขอบเขตการปกครอง-gistda) |

## โครงสร้างไฟล์

```
src/
  config.js     ระดับ สไตล์ตั้งต้น service ของ GISTDA มุมกล้อง เครดิต DEM
  store.js      createBoundaryStore()
  sources.js    boundaryDataset()
  style.js      แปลงสถานะใน store เป็น layer ของแผนที่
  maplibre.js   bindMapLibre()
  leaflet.js    bindLeaflet()
  react.js      hook ของ React
  index.js      export ฝั่งเบราว์เซอร์ (ยกเว้น react)
  server.js     tileMiddleware() createBoundaryTiles() createGlyphs()  (Node)
  gistda.js     โหลดข้อมูล GISTDA สร้างเส้นแยกระดับ ย่อจุด ตัด tile  (Node)
examples/       หน้าตัวอย่าง
fonts/          glyph ของป้าย (Kanit Regular) + OFL.txt
scripts/        serve.mjs (server ของหน้าตัวอย่าง) build-glyphs.mjs (แปลง TTF เป็น glyph)
test/           unit test (node:test)
REF.md          แหล่งข้อมูล วิธีสร้างเส้น คุณภาพข้อมูล และการอ้างอิง
```

ทดสอบกับ MapLibre GL 5.24.0, Leaflet 1.9.4, @maplibre/maplibre-gl-leaflet 0.1.4, React 18.3.1, Node 24

## License

- **โค้ด:** MIT
- **ข้อมูลขอบเขตการปกครอง:** GISTDA (ข้อมูลกรมการปกครอง) service ไม่ได้ระบุสัญญาอนุญาต ควรสอบถาม GISTDA ก่อนเปิดให้คนทั่วไปใช้ แผนที่แสดงเครดิตให้แล้ว รายละเอียดและข้อความอ้างอิงอยู่ใน [REF.md](REF.md)
- **ฟอนต์ Kanit:** SIL Open Font License ดู [`fonts/Kanit Regular/OFL.txt`](fonts/Kanit%20Regular/OFL.txt)
