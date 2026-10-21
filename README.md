# boundary-service

ชั้นข้อมูลขอบเขตการปกครอง **เฉพาะประเทศไทย** (จังหวัด / อำเภอ / ตำบล) พร้อมป้ายชื่อภาษาไทย สำหรับแผนที่ MapLibre GL, Leaflet และ React ไม่ต้องเตรียมไฟล์ข้อมูลเอง: ทุกระดับมาจาก ArcGIS MapServer ของ GISTDA (ข้อมูลกรมการปกครอง)

ติดตั้งเป็น npm package ชื่อ `admin-boundary` (ดู [ข้อ 3](#3-ติดตั้งในโปรเจกต์)) ต้องใช้ Node 18 ขึ้นไปฝั่ง server

เกณฑ์การแสดงผลเดียวกับ air_gistda: **เส้นแสดงสะสม** (ซูมลึกขึ้นเห็นระดับเล็กเพิ่ม) **ป้ายแสดงทีละระดับ** (ไม่ซ้อนกัน)

| ซูม | เส้นที่เห็น | ป้ายชื่อที่เห็น |
| --- | --- | --- |
| 1–3 | – | จังหวัด |
| 4–7 | จังหวัด | จังหวัด |
| 8–9 | จังหวัด + อำเภอ | จังหวัด |
| 10–12 | จังหวัด + อำเภอ | อำเภอ |
| 13 ขึ้นไป | จังหวัด + อำเภอ + ตำบล | ตำบล |

| ระดับ | เส้น | ป้ายชื่อ |
| --- | --- | --- |
| ระดับ | จำนวน | เส้น | ป้ายชื่อ |
| --- | --- | --- | --- |
| จังหวัด | 77 | ดำ เส้นทึบ ซูมไกลจาง 45% ชัดเต็มที่ซูม 8 | กลางพื้นที่ |
| อำเภอ/เขต | 929 | เทาเข้ม เส้นประ | กลางพื้นที่ |
| ตำบล/แขวง | 7,408 | ขาว เส้นประบนเส้นรองเทาเข้ม | กลางพื้นที่ |

เส้นทั้งสามระดับสร้างจากขอบตำบลชุดเดียว จึงซ้อนกันพอดีทุกจุด แผนที่ฐานเลือกได้อิสระ (หน้าตัวอย่างใช้ของ OpenFreeMap) รายละเอียดแหล่งข้อมูล ข้อจำกัด และการอ้างอิงอยู่ใน [REF.md](REF.md)

## สารบัญ

1. [ลองเปิดตัวอย่าง](#1-ลองเปิดตัวอย่าง)
2. [ภาพรวม: ต้องมีอะไรบ้าง](#2-ภาพรวม-ต้องมีอะไรบ้าง)
3. [ติดตั้งในโปรเจกต์](#3-ติดตั้งในโปรเจกต์)
4. [ฝั่ง server: ใส่ tileMiddleware](#4-ฝั่ง-server-ใส่-tilemiddleware)
5. [ฝั่งหน้าเว็บ: ผูกกับแผนที่](#5-ฝั่งหน้าเว็บ-ผูกกับแผนที่)
6. [ควบคุมชั้นข้อมูลด้วย store](#6-ควบคุมชั้นข้อมูลด้วย-store)
7. [ปรับสไตล์เส้นและป้าย](#7-ปรับสไตล์เส้นและป้าย)
8. [API](#8-api)
9. [แก้ปัญหา](#9-แก้ปัญหา)

## 1. ลองเปิดตัวอย่าง

```bash
npm install
npm run serve        # http://localhost:3300/examples/
npm test             # unit test (ไม่ต้องใช้เบราว์เซอร์และไม่ออกเน็ต)
```

| หน้า | แสดงอะไร |
| --- | --- |
| [`examples/maplibre/`](examples/maplibre/index.html) | 2D / 2.5D / 3D และสลับแผนที่ฐาน |
| [`examples/leaflet/`](examples/leaflet/index.html) | Leaflet + basemap raster + marker เดิม |
| [`examples/react/`](examples/react/index.html) | store เดียวคุม MapLibre และ Leaflet พร้อมกัน |

**ครั้งแรก** server ดาวน์โหลดข้อมูลจาก GISTDA ราว 150 MB (ราว 20 วินาที) เก็บไว้ที่ `.cache/admin-boundary/` แล้วสร้างเส้นราว 7 วินาที ครั้งต่อไปอ่านจาก cache (log ขึ้น `admin-boundary: พร้อม 7408 ตำบล ...` เมื่อเสร็จ)

ต้องเปิดผ่าน `npm run serve` เท่านั้น (เปิดไฟล์ HTML ตรงๆ ไม่ได้) และ**แก้ไฟล์ฝั่ง server แล้วต้องรีสตาร์ต** (`Ctrl+C` แล้ว `npm run serve` ใหม่) ส่วนไฟล์หน้าเว็บแค่รีเฟรช

พอร์ตชน: `node scripts/serve.mjs 8080`

## 2. ภาพรวม: ต้องมีอะไรบ้าง

```
 เบราว์เซอร์                                      server ของแอป
 ───────────                                      ─────────────
 UI ─action─▶ createBoundaryStore                 tileMiddleware()
                    │ subscribe                     │
                    ▼                               │
 bindMapLibre / bindLeaflet ──/boundary-tiles──▶ เส้น + ป้าย (สร้างไว้ในหน่วยความจำ)
                                                    ▲ ครั้งแรก: ดึงจาก GISTDA MapServer
                                                    │ แล้วเก็บ cache ใน .cache/admin-boundary
```

ต้องมี 2 ส่วนเสมอ:

1. **server:** `tileMiddleware()` ดึงข้อมูลจาก GISTDA ครั้งเดียว สร้างเส้นที่จำแนกระดับแล้ว และตัด tile ให้ (ทำในเบราว์เซอร์ไม่ได้ เหตุผลอยู่ใน [REF.md](REF.md#ทำไมต้องผ่าน-server))
2. **หน้าเว็บ:** store + ตัวเชื่อมแผนที่ (`bindMapLibre`, `bindLeaflet` หรือ hook ของ React)

| import | ใช้ที่ | มีอะไร |
| --- | --- | --- |
| `admin-boundary` | เบราว์เซอร์ | `createBoundaryStore`, `bindMapLibre`, `bindLeaflet`, `boundaryDataset`, ค่าตั้งต้น |
| `admin-boundary/react` | เบราว์เซอร์ | `BoundaryProvider`, `useBoundary`, `useMapLibreBoundary`, `useLeafletBoundary` |
| `admin-boundary/server` | Node 18+ | `tileMiddleware`, `createBoundaryTiles`, `createGlyphs` |

## 3. ติดตั้งในโปรเจกต์

package ส่ง source ESM ตรงๆ ไม่มีขั้น build ติดตั้งจาก GitHub แล้ว import ด้วยชื่อ `admin-boundary`

```bash
# จาก GitHub (branch main)
npm i "github:ChatchawanKh/boundary-service"

# ปักเวอร์ชันด้วย commit หรือ tag (ถ้ามีการสร้าง tag ไว้)
npm i "github:ChatchawanKh/boundary-service#<commit หรือ tag>"

# หรือจากเครื่อง (คัดลอกไฟล์ ไม่ใช่ symlink)
cd boundary-service && npm pack
cd ../my-app && npm i ../boundary-service/admin-boundary-0.1.0.tgz
```

ติดตั้งแผนที่ที่ใช้เอง (เป็น peer dependency):

```bash
npm i maplibre-gl                                          # MapLibre
npm i leaflet maplibre-gl @maplibre/maplibre-gl-leaflet    # Leaflet
```

ถ้าใช้ `npm i ../boundary-service` (symlink) กับ Vite ให้เพิ่ม `resolve: { dedupe: ["react", "react-dom"] }` ใน `vite.config.js`

## 4. ฝั่ง server: ใส่ tileMiddleware

middleware แบบ connect `(req, res, next)` ตอบ 2 path ที่เหลือส่งต่อ `next()`

| path | ทำอะไร |
| --- | --- |
| `/boundary-tiles/{z}/{x}/{y}` | tile มี 2 layer: `boundary` (เส้น `admin_level` 4/6/8 = จังหวัด/อำเภอ/ตำบล) และ `label` (จุดชื่อ `level`, `name`, `rank`) |
| `/boundary-fonts/{fontstack}/{range}.pbf` | glyph ของป้าย: `Kanit Regular` จากโฟลเดอร์ `fonts/` ที่มากับ package ส่วน fontstack อื่น (ฟอนต์ของแผนที่ฐาน) ส่งต่อไป glyph server ของแผนที่ฐาน ดู [ข้อ 7.1](#71-ฟอนต์ของป้าย-kanit) |

**Vite** (ทั้ง `npm run dev` และ `npm run preview`):

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

**Express** (production):

```js
import express from "express";
import { tileMiddleware } from "admin-boundary/server";

const app = express();
app.use(tileMiddleware());
app.use(express.static("dist"));
app.listen(8080);
```

**Node `http` ล้วน:** ดู [`scripts/serve.mjs`](scripts/serve.mjs)

**ข้อมูลและ cache**

| | |
| --- | --- |
| เริ่ม server | เริ่มโหลดทันที (`preload: true`) คำขอ tile ระหว่างนั้นรอจนพร้อม |
| ครั้งแรก | ดาวน์โหลดตำบลทีละจังหวัด (77 ครั้ง พร้อมกัน 4 request) + จังหวัด/อำเภอ รวมราว 150 MB ราว 20 วินาที |
| cache บนดิสก์ | `.cache/admin-boundary/` (นับจากโฟลเดอร์ที่รัน server) อายุ 30 วัน ลบโฟลเดอร์เพื่อดึงใหม่ |
| สร้างเส้น | ราว 7 วินาที ใช้หน่วยความจำราว 750 MB ระหว่างสร้าง เหลือราว 60 MB หลังเสร็จ |
| ตัด tile | 2–60 ms ต่อ tile (ครั้งแรกของซูม 6–11 นานกว่าเพราะย่อจุดทั้งประเทศ) cache ในหน่วยความจำ 2,000 tile และส่ง `Cache-Control: public, max-age=86400` |
| GISTDA ล่ม | ตอบ 502 แล้วลองโหลดใหม่หลัง 60 วินาที (ถ้ามี cache บนดิสก์ ใช้ cache ได้โดยไม่ต้องต่อ GISTDA) |

ตั้งค่าได้ที่ `tileMiddleware({ boundary: { cacheDir, maxAge, concurrency, service } })` เช่น `cacheDir: "/var/cache/admin-boundary"` สำหรับ server จริง

ใช้ path อื่น: `tileMiddleware({ path: "/api/boundary", fontsPath: "/api/fonts" })` แล้วส่ง path เดียวกันให้ฝั่งหน้าเว็บ: `boundaryDataset({ tiles: "/api/boundary" })` และ `bindMapLibre(map, store, { glyphs: "/api/fonts/{fontstack}/{range}.pbf" })`

## 5. ฝั่งหน้าเว็บ: ผูกกับแผนที่

### MapLibre

```js
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { bindMapLibre, createBoundaryStore } from "admin-boundary";

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/liberty",
  center: [100.9, 13],
  zoom: 5,
  maxPitch: 75, // ถ้าจะใช้มุมมอง 3D
});

const store = createBoundaryStore();
const boundary = bindMapLibre(map, store, {
  hideBasemapLayers: ["boundary_3", "boundary_state"], // ซ่อนเส้นจังหวัด/อำเภอของแผนที่ฐาน OpenFreeMap
});
```

- เปลี่ยน style ด้วย `map.setStyle()` ได้ ชั้นขอบเขตกลับมาเอง
- เลิกใช้: `boundary.destroy()`

### Leaflet

```js
import L from "leaflet";
import "maplibre-gl";
import "@maplibre/maplibre-gl-leaflet";
import { bindLeaflet, createBoundaryStore } from "admin-boundary";

const map = L.map("map").setView([13, 100.9], 6); // ซูม Leaflet = ซูม MapLibre + 1
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

const boundary = bindLeaflet(map, createBoundaryStore(), { L });
```

Leaflet เอียงหรือหมุนไม่ได้ จึงแสดงแบบ 2D เสมอ

### React (Vite)

```js
// src/stores/boundary.js
import { createBoundaryStore } from "admin-boundary";

export const boundaryStore = createBoundaryStore({
  persist: { key: "my-app:boundary" }, // จำการเปิด/ปิดชั้นใน localStorage (ไม่ใส่ก็ได้)
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

Leaflet ใช้ `useLeafletBoundary(leafletMap, { L })` แบบเดียวกัน hook อ่าน options ครั้งเดียวตอนผูก ถ้าจะเปลี่ยนให้เปลี่ยน `key` ของ component

### Sphere / air_gistda

Sphere ครอบ MapLibre ไว้ ให้ส่ง MapLibre map ข้างใน (`resolveNativeMap` ของ air_gistda) พร้อมค่าเฉพาะของ Sphere:

```js
import { bindMapLibre } from "admin-boundary";

bindMapLibre(resolveNativeMap(sphereMap), store, {
  glyphs: false,                   // ไม่แตะ glyph server ของ Sphere (ป้ายของ Sphere ใช้ fontstack "noto")
  font: ["noto"],                  // fontstack ภาษาไทยของ Sphere (ไม่มี Kanit)
  lineMetadata: { zIndex: 1000 },  // ให้ชั้นที่ Sphere เพิ่มทีหลังอยู่ใต้เส้นขอบเขต
});
```

ต้องเพิ่ม `tileMiddleware()` ใน proxy-server ของ air_gistda ด้วย (Express: `app.use(tileMiddleware())`) ถ้าต้องการป้าย Kanit บน Sphere ให้ตั้ง `tileMiddleware({ glyphs: { upstream: "<glyph server ของ Sphere>/{fontstack}/{range}.pbf" } })` แล้วใช้ `glyphs` ค่าเริ่มต้นแทน `false` ยังไม่ได้ทดสอบกับ Sphere จริง

## 6. ควบคุมชั้นข้อมูลด้วย store

store คือ state กลางของชั้นขอบเขต UI สั่ง store แล้วแผนที่ทุกตัวที่ผูกไว้เปลี่ยนตามเอง (แผนที่กี่ตัวก็ใช้ store เดียวกันได้)

```js
store.setLevelVisible("Tambon", false);   // ซ่อนตำบล
store.setLevelLabels("Amphoe", false);    // ซ่อนป้ายอำเภอ (เส้นยังอยู่)
store.setLevelOpacity("Province", 50);    // ความทึบ 0-100
store.setView("3d");                      // "2d" | "2.5d" (เอียง) | "3d" (ภูมิประเทศ)
store.setTerrainExaggeration(2);          // ความสูงภูมิประเทศใน 3D
store.reset();                            // กลับค่าเริ่มต้น

store.subscribe((state, prev) => console.log(state.levels.Tambon.visible));
```

React อ่านด้วย hook (selector ต้องคืนค่าที่อยู่ใน state อยู่แล้ว ห้ามสร้าง object ใหม่):

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

ค่าเริ่มต้นตอนสร้าง:

```js
createBoundaryStore({
  levels: { Tambon: { visible: false }, Amphoe: { labels: false } },
  view: "2d",
  persist: { key: "my-app:boundary" },
});
```

## 7. ปรับสไตล์เส้นและป้าย

ค่าตั้งต้นอยู่ใน `DEFAULT_LEVEL_STYLES` ([src/config.js](src/config.js)):

**เส้น** (ค่าที่มีลูกศรคือ ซูม→ค่า สอดแทรกตามซูม)

| ระดับ | `minzoom` | `color` | `width` (px) | `opacity` | `dash` | เส้นรองพื้น (`casingColor`, `casingWidth`, `casingOpacity`) |
| --- | --- | --- | --- | --- | --- | --- |
| Province | 4 | `#1a1a1a` | 4→0.5, 8→1.2, 12→2, 16→2.6 | 4→0.45, 8→1 | ทึบ | ขาว, 4→1.2 … 16→5, 4→0.3, 8→0.6 |
| Amphoe | 8 | `#4d4d4d` | 8→0.8, 14→1.6 | 1 | `[3, 2]` | ขาว, 8→1.6, 14→3, 0.35 |
| Tambon | 13 | `#ffffff` | 0.94 (0.25 มม.) | 1 | ขีด 4 px เว้น 3 px | `#383838`, 2.2, 0.55 |

**ป้าย** ทุกระดับใช้ขนาด 16 px สี `#383838` ขอบขาวฟุ้ง (`LABEL_STYLE`: halo 2 px, blur 1) ห่างกันอย่างน้อย 6 px ไม่ตัดบรรทัด ป้ายที่สำคัญกว่า (`rank` น้อย) ได้วางก่อน

| ระดับ | `labelMinzoom` | `labelMaxzoom` (ไม่รวมขอบ) |
| --- | --- | --- |
| Province | 1 | 10 |
| Amphoe | 10 | 13 |
| Tambon | 13 | 24 |

`dash` เป็นเท่าของความหนาเส้น `[ยาว, เว้น]` ส่วน `opacity` คูณกับความทึบของระดับใน store อีกที

### 7.1 ฟอนต์ของป้าย (Kanit)

ป้ายใช้ฟอนต์ [Kanit](https://fonts.google.com/specimen/Kanit) Regular จาก Google Fonts

MapLibre วาดป้ายจาก glyph แบบ SDF (ไฟล์ `.pbf`) ที่โหลดจาก glyph server ของ style เท่านั้น ใช้ฟอนต์เว็บ (CSS `@font-face`) กับป้ายบนแผนที่ไม่ได้ และ glyph server ของแผนที่ฐานทั่วไปไม่มี Kanit จึงทำแบบนี้:

1. แปลง `Kanit-Regular.ttf` เป็น glyph ไว้ใน [`fonts/Kanit Regular/`](fonts/) (725 ตัวอักษร 12 ไฟล์ รวม 313 KB พร้อม `OFL.txt`)
2. `tileMiddleware` ส่ง glyph ที่ `/boundary-fonts/{fontstack}/{range}.pbf` (fontstack อื่นส่งต่อไป glyph server ของแผนที่ฐาน ค่าเริ่มต้นเป็นของ OpenFreeMap ตามแผนที่ฐานในหน้าตัวอย่าง เปลี่ยนได้ด้วย `tileMiddleware({ glyphs: { upstream } })`)
3. `bindMapLibre` เปลี่ยน glyph ของ style เป็น URL นั้น (`map.setGlyphs`) แล้วใช้ `font: ["Kanit Regular"]` กับป้าย ป้ายของ basemap ยังเป็น Noto Sans ตามเดิม ตอน `destroy()` คืน glyph เดิมให้

| option ของ `bindMapLibre` | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `font` | `["Kanit Regular"]` | fontstack ของป้าย |
| `glyphs` | `"/boundary-fonts/{fontstack}/{range}.pbf"` | glyph server ของแผนที่ หรือ `false` = ใช้ของ style เดิม |

**ข้อจำกัด:** MapLibre ไม่ทำ complex text shaping สระบนและวรรณยุกต์ไทยจึงวางตามตำแหน่งเริ่มต้นในตัวฟอนต์ (เหมือนตอนใช้ Noto) คำที่มีสระบน + วรรณยุกต์ เช่น "ปั้น" อาจซ้อนกันเล็กน้อย

**ใช้ฟอนต์อื่น** (เช่น Kanit Medium หรือ Sarabun): ดาวน์โหลด TTF ที่มีสัญญาอนุญาตให้แจกจ่ายต่อได้ แล้วสร้าง glyph ด้วยสคริปต์ที่มากับ repo

```bash
npm run build:glyphs -- Kanit-Medium.ttf "Kanit Medium"     # → fonts/Kanit Medium/*.pbf
```

แล้วใช้ `bindMapLibre(map, store, { font: ["Kanit Medium"] })` สคริปต์สร้าง glyph ขนาด 24 px, buffer 3, รัศมี 8 ตามมาตรฐานของ glyph server ทั่วไป (ตรวจกับ glyph Noto Sans ของ OpenFreeMap แล้ว ตำแหน่งและขนาดตรงกัน)

เปลี่ยนตอนสร้างหรือระหว่างใช้งาน:

```js
createBoundaryStore({
  styles: { Province: { color: "#000000", width: [[5, 1.5], [12, 4]] } },
});

store.setLevelStyle("Tambon", { dash: [1, 2], color: "#999999" });
store.setLevelStyle("Amphoe", { labelMinzoom: 9, labelSize: 14 }); // ป้ายอำเภอขึ้นเร็วขึ้นและเล็กลง
```

| ค่า | ความหมาย |
| --- | --- |
| `color`, `width`, `opacity`, `dash` | สี ความหนา ความทึบ และรูปแบบเส้นประ |
| `casingColor`, `casingWidth`, `casingOpacity` | เส้นรองพื้นใต้เส้นหลัก |
| `minzoom` | ซูมที่เส้นเริ่มแสดง |
| `labelMinzoom`, `labelMaxzoom` | ช่วงซูมของป้าย (`labelMaxzoom` ไม่รวมขอบ) |
| `labelSize`, `labelColor` | ขนาดและสีของป้าย |

ค่าตัวเลขทุกตัวใส่เป็นค่าเดียว หรือ `[[ซูม, ค่า], ...]` ให้เปลี่ยนตามซูมก็ได้

แผนที่ฐานสีเข้มให้เปลี่ยนเส้นเป็นโทนสว่าง เช่น `color: "#f2f2f2", casingColor: "#000000"`

## 8. API

### `createBoundaryStore(options?)`

| option | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `levels` | ทุกระดับ `{ visible: true, opacity: 100, labels: true }` | ค่าเริ่มต้นต่อระดับ |
| `styles` | `DEFAULT_LEVEL_STYLES` | override สไตล์ต่อระดับ |
| `view` | `"2d"` | `"2d"` \| `"2.5d"` \| `"3d"` |
| `terrainExaggeration` | `1.5` | ความสูงภูมิประเทศใน 3D |
| `persist` | ไม่จำ | `{ key, storage? }` จำ `levels`, `view`, `terrainExaggeration` |

action: `setLevelVisible`, `toggleLevel`, `setLevelOpacity`, `setLevelLabels`, `setLevelStyle`, `setView`, `setTerrainExaggeration`, `reset` · พื้นฐาน: `getState`, `subscribe`, `setState`

### `bindMapLibre(map, store, options?)` → `{ ready, attribution, destroy() }`

| option | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `dataset` | `boundaryDataset()` | แหล่ง tile |
| `hideBasemapLayers` | `[]` | id หรือ predicate ของ layer basemap ที่จะซ่อน (คืนค่าตอน `destroy`) |
| `font` | `["Kanit Regular"]` | fontstack ของป้าย ดู [ข้อ 7.1](#71-ฟอนต์ของป้าย-kanit) |
| `glyphs` | `"/boundary-fonts/{fontstack}/{range}.pbf"` | glyph server ของแผนที่ หรือ `false` = ใช้ของ style เดิม |
| `beforeId` | ป้ายแรกของ basemap | แทรกเส้นไว้ใต้ layer นี้ |
| `terrain` | Terrarium บน AWS | raster-dem สำหรับ 3D หรือ `false` |
| `camera` | `true` | เอียง/หมุนกล้องเองเมื่อเปลี่ยนมุมมอง |
| `prefix` | `"admin-boundary"` | prefix ของ id ทุก layer/source |
| `lineMetadata` | `{}` | metadata เพิ่มให้ layer เส้น |

### `bindLeaflet(leafletMap, store, options?)` → `{ glLayer, glMap, ready, destroy() }`

option เหมือน `bindMapLibre` และเพิ่ม `L` (ค่าเริ่มต้น `window.L`), `glyphs`, `pane`, `glOptions`

### `boundaryDataset(options?)`

| option | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `tiles` | `"/boundary-tiles"` | URL ของ tileMiddleware (relative ได้) |
| `labels` | `true` | `false` = เส้นอย่างเดียว |
| `adminLevels` | `{ Province: 4, Amphoe: 6, Tambon: 8 }` | ระดับ → `admin_level` ใน tile |
| `bounds` | `THAILAND_BOUNDS` | ไม่ขอ tile นอกกรอบนี้ |

### `admin-boundary/server`

| ฟังก์ชัน | ความหมาย |
| --- | --- |
| `tileMiddleware({ path?, fontsPath?, boundary?, glyphs?, preload?, fetch? })` | middleware แบบ connect มี `.ready()` รอจนข้อมูลพร้อม คืนสถิติ |
| `createGlyphs({ dir?, upstream?, fetch? })` | `(fontstack, start) => Promise<Uint8Array>` glyph จากโฟลเดอร์ `fonts/` หรือ upstream |
| `createBoundaryTiles({ cacheDir?, maxAge?, concurrency?, service?, minzoom?, fetch? })` | `(z, x, y) => Promise<Uint8Array \| null>` สำหรับ server ที่ไม่ใช่แบบ connect มี `.ready()` |
| `encodeTile(layers, extent?)` | เขียน Mapbox Vector Tile (เส้นและจุด) |

`service` ค่าเริ่มต้น `GISTDA_ADMIN_SERVICE` (URL ของ MapServer, เลข layer และชื่อ field) `minzoom` ค่าเริ่มต้น `{ Province: 0, Amphoe: 6, Tambon: 10 }` คือซูมต่ำสุดที่ server ใส่แต่ละระดับลงใน tile (ต่ำกว่าเกณฑ์การแสดงผล เผื่อปรับ `minzoom` ของสไตล์ลงได้)

### React (`admin-boundary/react`)

`BoundaryProvider`, `useBoundaryStore(store?)`, `useBoundary(selector, store?)`, `useMapLibreBoundary(map, options?, store?)`, `useLeafletBoundary(leafletMap, options?, store?)`

## 9. แก้ปัญหา

| อาการ | สาเหตุ / วิธีแก้ |
| --- | --- |
| ไม่มีเส้นและป้ายเลย | ใน DevTools > Network ดู `/boundary-tiles` ถ้า 404 = server ยังไม่มี `tileMiddleware` หรือยังไม่ได้รีสตาร์ตหลังแก้ |
| `EADDRINUSE` ตอน `npm run serve` | มีเซิร์ฟเวอร์ใช้พอร์ตอยู่แล้ว ปิดตัวเก่าหรือใช้ `node scripts/serve.mjs 8080` |
| เปิดหน้าแรกแล้วเส้นยังไม่ขึ้นสักพัก | ครั้งแรกต้องดาวน์โหลดจาก GISTDA ราว 20 วินาที + สร้างเส้นราว 7 วินาที รอ log `admin-boundary: พร้อม ...` |
| `/boundary-tiles` ได้ 502 | server ต่อ `gistdaportal.gistda.or.th` ไม่ได้ และยังไม่มี cache ดู log `admin-boundary: โหลดข้อมูล GISTDA ไม่สำเร็จ` จะลองใหม่เองหลัง 60 วินาที |
| ข้อมูลไม่อัปเดต | cache อายุ 30 วัน ลบ `.cache/admin-boundary/` แล้วรีสตาร์ตเพื่อดึงใหม่ |
| server หน่วยความจำไม่พอตอนเริ่ม | ระหว่างสร้างเส้นใช้ราว 750 MB ให้ Node มี heap พอ (`node --max-old-space-size=1024`) |
| ป้ายไม่ขึ้นหรือเป็นกล่องสี่เหลี่ยม | ดู `/boundary-fonts/...` ใน DevTools > Network ถ้า 404 = server ยังไม่มี `tileMiddleware` รุ่นที่มี glyph หรือ `font` ไม่ตรงชื่อโฟลเดอร์ใน `fonts/` (Sphere: `glyphs: false, font: ["noto"]`) |
| เส้นจังหวัด/อำเภอของแผนที่ฐานซ้อนกับของเรา | เป็นเส้นของแผนที่ฐาน (OSM) ให้ใส่ `hideBasemapLayers` (Leaflet ที่ใช้แผนที่ฐานแบบภาพ raster ซ่อนไม่ได้) |
| เส้นจังหวัดตามแนวชายแดน/ชายฝั่งไม่ขึ้น | ตั้งใจไม่วาดขอบที่มีพื้นที่ฝั่งเดียว ให้แผนที่ฐานวาดเส้นประเทศและชายฝั่ง ดู [REF.md](REF.md#1-ข้อมูลขอบเขตการปกครอง-gistda) |

## โครงสร้าง

```
src/
  config.js     ระดับ, สไตล์ตั้งต้น, service ของ GISTDA, มุมกล้อง, attribution, DEM
  store.js      createBoundaryStore()
  sources.js    boundaryDataset()
  style.js      state → layer ตาม MapLibre style spec
  maplibre.js   bindMapLibre()
  leaflet.js    bindLeaflet()
  react.js      React bindings
  index.js      export ฝั่งเบราว์เซอร์ (ยกเว้น react)
  server.js     tileMiddleware(), createBoundaryTiles(), createGlyphs()  (Node)
  gistda.js     โหลดข้อมูล GISTDA, สร้างเส้นจำแนกระดับ, ย่อจุด, ตัด tile  (Node)
examples/       หน้าตัวอย่าง
fonts/          glyph ของป้าย (Kanit Regular) + OFL.txt
scripts/        serve.mjs (static server + tileMiddleware สำหรับหน้าตัวอย่าง), build-glyphs.mjs (TTF → glyph)
test/           unit test (node:test)
REF.md          แหล่งข้อมูล สัญญาอนุญาต และการอ้างอิง
```

ทดสอบกับ MapLibre GL 5.24.0, Leaflet 1.9.4, @maplibre/maplibre-gl-leaflet 0.1.4, React 18.3.1, Node 24

## License

- โค้ด: MIT (ตาม `license` ใน `package.json`)
- ข้อมูลขอบเขตการปกครอง: GISTDA (ข้อมูลกรมการปกครอง) service ไม่ได้ระบุสัญญาอนุญาต ควรสอบถาม GISTDA ก่อนเปิดให้คนทั่วไปใช้ แผนที่แสดงเครดิตให้แล้ว รายละเอียดและข้อความอ้างอิงอยู่ใน [REF.md](REF.md)
