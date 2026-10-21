# boundary-service

ชั้นข้อมูลขอบเขตการปกครอง **เฉพาะประเทศไทย** (จังหวัด / อำเภอ / ตำบล) พร้อมป้ายชื่อภาษาไทย สำหรับแผนที่ MapLibre GL, Leaflet และ React ข้อมูลทั้งหมดมาจาก OpenFreeMap ไม่ต้องเตรียมไฟล์ข้อมูลเอง

ติดตั้งเป็น npm package ชื่อ `admin-boundary` (ดู [ข้อ 3](#3-ติดตั้งในโปรเจกต์)) ต้องใช้ Node 18 ขึ้นไปฝั่ง server

| ระดับ | เส้น | ป้ายชื่อ |
| --- | --- | --- |
| จังหวัด | ดำ เส้นทึบ (ซูม 5 ขึ้นไป) | ซูม 5–8 วางที่ตัวเมือง (ที่ตั้งศาลากลาง) |
| อำเภอ | เทาเข้ม เส้นประยาว (ซูม 9 ขึ้นไป) | ซูม 9–11 วางที่ตัวอำเภอ (มีราว 80%) |
| ตำบล | เทา เส้นประสั้น (ซูม 11 ขึ้นไป, มีราว 11% ของตำบล) | ไม่มี (OpenFreeMap ไม่มีชื่อตำบล) |

เส้นและป้ายมาจาก OpenFreeMap (ข้อมูล OpenStreetMap) server ตัดให้เหลือเฉพาะในไทย รายละเอียดแหล่งข้อมูล ข้อจำกัด และการอ้างอิงอยู่ใน [REF.md](REF.md)

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

ต้องเปิดผ่าน `npm run serve` เท่านั้น (เปิดไฟล์ HTML ตรงๆ ไม่ได้) และ**แก้ไฟล์ฝั่ง server แล้วต้องรีสตาร์ต** (`Ctrl+C` แล้ว `npm run serve` ใหม่) ส่วนไฟล์หน้าเว็บแค่รีเฟรช

พอร์ตชน: `node scripts/serve.mjs 8080`

## 2. ภาพรวม: ต้องมีอะไรบ้าง

```
 เบราว์เซอร์                                      server ของแอป
 ───────────                                      ─────────────
 UI ─action─▶ createBoundaryStore                 tileMiddleware()
                    │ subscribe                     │
                    ▼                               │
 bindMapLibre / bindLeaflet ──/boundary-tiles──▶ OpenFreeMap → เส้น + ป้าย เฉพาะในไทย
```

ต้องมี 2 ส่วนเสมอ:

1. **server:** `tileMiddleware()` ดึง tile ของ OpenFreeMap แล้วตัดให้เหลือเฉพาะประเทศไทย (ทำในเบราว์เซอร์ไม่ได้ เหตุผลอยู่ใน [REF.md](REF.md#ทำไมต้องผ่าน-server))
2. **หน้าเว็บ:** store + ตัวเชื่อมแผนที่ (`bindMapLibre`, `bindLeaflet` หรือ hook ของ React)

| import | ใช้ที่ | มีอะไร |
| --- | --- | --- |
| `admin-boundary` | เบราว์เซอร์ | `createBoundaryStore`, `bindMapLibre`, `bindLeaflet`, `boundaryDataset`, ค่าตั้งต้น |
| `admin-boundary/react` | เบราว์เซอร์ | `BoundaryProvider`, `useBoundary`, `useMapLibreBoundary`, `useLeafletBoundary` |
| `admin-boundary/server` | Node 18+ | `tileMiddleware`, `createBoundaryTiles` |

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

middleware แบบ connect `(req, res, next)` ตอบ `/boundary-tiles/{z}/{x}/{y}` ที่เหลือส่งต่อ `next()`

แต่ละ tile มี 2 layer ที่ server ทำจาก tile ของ OpenFreeMap:

- `boundary`: เส้น `admin_level` 4/6/8 ตัดเฉพาะในไทย
- `label`: จุดชื่อจังหวัด/อำเภอ (`level`, `name`, `rank`)

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

tile ที่ตัดแล้ว cache ในหน่วยความจำ 2,000 tile และส่ง `Cache-Control: public, max-age=86400` ให้เบราว์เซอร์/CDN cache ต่อ tile ที่ต้องตัดใช้เวลาครั้งแรกราว 70–200 ms

ใช้ path อื่น: `tileMiddleware({ path: "/api/boundary" })` แล้วส่ง path เดียวกันให้ `boundaryDataset({ tiles: "/api/boundary" })` ฝั่งหน้าเว็บ

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
  hideBasemapLayers: ["boundary_3", "boundary_state"], // ซ่อนเส้นจังหวัดของ basemap (เป็นของทุกประเทศ)
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
  font: ["noto"],                  // fontstack ภาษาไทยของ Sphere
  lineMetadata: { zIndex: 1000 },  // ให้ชั้นที่ Sphere เพิ่มทีหลังอยู่ใต้เส้นขอบเขต
});
```

ต้องเพิ่ม `tileMiddleware()` ใน proxy-server ของ air_gistda ด้วย (Express: `app.use(tileMiddleware())`) ยังไม่ได้ทดสอบกับ Sphere จริง

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

| ระดับ | `color` | `dash` | `width` (ซูม → px) | `labelColor` |
| --- | --- | --- | --- | --- |
| Province | `#1a1a1a` | ทึบ (`null`) | 5→1.2, 8→2, 12→3 | `#1a1a1a` |
| Amphoe | `#4d4d4d` | `[5, 2.5]` | 7→0.8, 10→1.4, 14→2 | `#333333` |
| Tambon | `#808080` | `[2, 2]` | 10→0.6, 13→1, 16→1.6 | `#595959` |

ทุกระดับมีเส้นขาวรองใต้ (`casingColor`, `casingWidth`) ให้อ่านออกบนพื้นแผนที่ทุกสี `dash` เป็นเท่าของความหนาเส้น `[ยาว, เว้น]`

เปลี่ยนตอนสร้างหรือระหว่างใช้งาน:

```js
createBoundaryStore({
  styles: { Province: { color: "#000000", width: [[5, 1.5], [12, 4]] } },
});

store.setLevelStyle("Tambon", { dash: [1, 2], color: "#999999" });
store.setLevelStyle("Amphoe", { labelMinzoom: 10, labelMaxzoom: 13 });
```

| ค่า | ความหมาย |
| --- | --- |
| `color`, `width`, `dash` | สี ความหนา (`[[ซูม, px], ...]`) และรูปแบบเส้นประ |
| `casingColor`, `casingWidth` | เส้นรองใต้ (ความหนาเพิ่มจากเส้นหลัก) |
| `minzoom` | ซูมที่เส้นเริ่มแสดง |
| `labelMinzoom`, `labelMaxzoom` | ช่วงซูมของป้าย (`labelMaxzoom` ไม่รวมขอบ) |
| `labelSize`, `labelColor` | ขนาด (`[[ซูม, px], ...]`) และสีของป้าย |

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
| `font` | `["Noto Sans Regular"]` | fontstack ภาษาไทยบน glyph server ของ style |
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
| `adminLevels` | `{ Province: 4, Amphoe: 6, Tambon: 8 }` | ระดับ → `admin_level` ของ OpenMapTiles |
| `bounds` | `THAILAND_BOUNDS` | ไม่ขอ tile นอกกรอบนี้ |

### `admin-boundary/server`

| ฟังก์ชัน | ความหมาย |
| --- | --- |
| `tileMiddleware({ path?, boundary?, fetch? })` | middleware แบบ connect |
| `createBoundaryTiles({ within?, tilejson?, adminLevels?, capitalLevels?, fetch? })` | `(z, x, y) => Promise<Uint8Array \| null>` สำหรับ server ที่ไม่ใช่แบบ connect |
| `encodeTile(layers, extent?)` | เขียน Mapbox Vector Tile (เส้นและจุด) |

`capitalLevels` ค่าเริ่มต้น `{ 2: "Province", 4: "Province", 6: "Amphoe" }` (ค่า `capital` ของ place → ระดับของป้าย) หรือ `false` = ไม่ทำป้าย

### React (`admin-boundary/react`)

`BoundaryProvider`, `useBoundaryStore(store?)`, `useBoundary(selector, store?)`, `useMapLibreBoundary(map, options?, store?)`, `useLeafletBoundary(leafletMap, options?, store?)`

## 9. แก้ปัญหา

| อาการ | สาเหตุ / วิธีแก้ |
| --- | --- |
| ไม่มีเส้นและป้ายเลย | ใน DevTools > Network ดู `/boundary-tiles` ถ้า 404 = server ยังไม่มี `tileMiddleware` หรือยังไม่ได้รีสตาร์ตหลังแก้ |
| `EADDRINUSE` ตอน `npm run serve` | มีเซิร์ฟเวอร์ใช้พอร์ตอยู่แล้ว ปิดตัวเก่าหรือใช้ `node scripts/serve.mjs 8080` |
| `/boundary-tiles` ได้ 502 | server ต่อ `tiles.openfreemap.org` ไม่ได้ ดูข้อความใน log ของ server |
| ตำบลมีแต่เส้น ไม่มีชื่อ | ข้อจำกัดของ OpenFreeMap ดู [REF.md](REF.md#ข้อจำกัดของป้ายชื่อ) |
| ส่วนใหญ่ไม่มีเส้นตำบล | OpenStreetMap มีเส้นตำบลราว 11% ของทั้งประเทศ ดู [REF.md](REF.md#13-ที่มาของเส้นขอบเขต) |
| ป้ายเป็นกล่องสี่เหลี่ยม | glyph server ของ style ไม่มีอักษรไทย หรือ `font` ไม่ตรงชื่อ fontstack (OpenFreeMap: `["Noto Sans Regular"]`, Sphere: `["noto"]`) |
| เส้นจังหวัดของประเทศเพื่อนบ้านยังขึ้น | เป็นเส้นของ basemap ให้ใส่ `hideBasemapLayers` (Leaflet ที่ใช้ basemap แบบภาพ raster ซ่อนไม่ได้) |
| ปลายเส้นสั้นๆ ข้ามชายแดนเมื่อซูมลึก | ขอบที่ใช้ตัดขยายออก 1 กม. ดู [REF.md](REF.md#2-ขอบประเทศไทยที่ใช้ตัดเส้น) |

## โครงสร้าง

```
src/
  config.js     ระดับ, สไตล์ตั้งต้น, admin_level/capital ของ OpenFreeMap, มุมกล้อง, attribution, DEM
  store.js      createBoundaryStore()
  sources.js    boundaryDataset()
  style.js      state → layer ตาม MapLibre style spec
  maplibre.js   bindMapLibre()
  leaflet.js    bindLeaflet()
  react.js      React bindings
  index.js      export ฝั่งเบราว์เซอร์ (ยกเว้น react)
  server.js     tileMiddleware(), createBoundaryTiles()  (Node)
  thailand.js   ขอบประเทศไทยแบบย่อ ที่ server ใช้ตัดเส้น
examples/       หน้าตัวอย่าง
scripts/        serve.mjs (static server + tileMiddleware สำหรับหน้าตัวอย่าง)
test/           unit test (node:test)
REF.md          แหล่งข้อมูล สัญญาอนุญาต และการอ้างอิง
```

ทดสอบกับ MapLibre GL 5.24.0, Leaflet 1.9.4, @maplibre/maplibre-gl-leaflet 0.1.4, React 18.3.1, Node 24

## License

- โค้ด: MIT (ตาม `license` ใน `package.json`)
- ข้อมูลบนแผนที่: © OpenStreetMap contributors (ODbL) ผ่าน OpenFreeMap / © OpenMapTiles ต้องแสดงเครดิตเสมอ รายละเอียดและข้อความอ้างอิงอยู่ใน [REF.md](REF.md)
