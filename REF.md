# แหล่งข้อมูลและการอ้างอิง

เอกสารนี้บอกว่า admin-boundary ใช้ข้อมูลจากที่ไหน ใช้อย่างไร มีเงื่อนไขอะไร และต้องอ้างอิงอย่างไร

ตรวจสอบข้อมูลล่าสุด: 21 ตุลาคม 2026

## สรุป

| ส่วน | แหล่งข้อมูล | สัญญาอนุญาต | ต้องแสดงเครดิต |
| --- | --- | --- | --- |
| เส้นขอบเขต จังหวัด/อำเภอ/ตำบล | OpenStreetMap ผ่าน OpenFreeMap (layer `boundary`) ซูม 0–4 ใช้ Natural Earth (ดู [1.3](#13-ที่มาของเส้นขอบเขต)) | ODbL 1.0 (ข้อมูล), CC-BY 4.0 (schema) | ✓ |
| ป้ายชื่อจังหวัด/อำเภอ | OpenStreetMap ผ่าน OpenFreeMap (layer `place`) | ODbL 1.0 (ข้อมูล), CC-BY 4.0 (schema) | ✓ (ข้อความเดียวกับเส้น) |
| ขอบประเทศไทยที่ใช้ตัดเส้น | Natural Earth 10m ผ่าน `world-atlas` | Public domain | ไม่บังคับ |
| ภูมิประเทศในมุมมอง 3D | Mapzen Terrain Tiles บน AWS | หลายแหล่ง (ดูด้านล่าง) | ✓ |
| แผนที่ฐานในตัวอย่าง | OpenFreeMap styles, OpenStreetMap tile server | ODbL / เงื่อนไขการใช้ tile | ✓ |
| ฟอนต์ป้าย | Kanit (Google Fonts) แปลงเป็น glyph ใน `fonts/` | SIL OFL 1.1 | ไม่บังคับ (แนบ `OFL.txt` แล้ว) |

ข้อความเครดิตที่แผนที่แสดงอัตโนมัติ (มุมขวาล่าง) มาจาก `ATTRIBUTION` ใน [src/config.js](src/config.js) **อย่าซ่อน attribution control ของแผนที่** ถ้าจำเป็นต้องซ่อน ให้แสดงข้อความเดียวกันที่อื่นบนหน้าเว็บ

---

## 1. OpenFreeMap (เส้นและป้ายชื่อ)

**ใช้ทำอะไร:** ข้อมูลหลักทั้งหมด ทั้งเส้นจังหวัด/อำเภอ/ตำบล และป้ายชื่อจังหวัด/อำเภอ

**ที่มา**

| | |
| --- | --- |
| ผู้ให้บริการ tile | [OpenFreeMap](https://openfreemap.org) (ฟรี ไม่ต้องลงทะเบียน ไม่มี API key) |
| TileJSON | `https://tiles.openfreemap.org/planet` (`version` 3.16.0, ซูม 0–14) |
| tile | `https://tiles.openfreemap.org/planet/{รุ่น}/{z}/{x}/{y}.pbf` รุ่นเปลี่ยนเป็นรอบ เช่น `20261018_080001_pt` server จึงอ่าน TileJSON ใหม่ทุกชั่วโมง |
| schema | [OpenMapTiles](https://openmaptiles.org/schema/) |
| ข้อมูลต้นทาง | [OpenStreetMap](https://www.openstreetmap.org) |

server (`tileMiddleware` ใน [src/server.js](src/server.js)) ดึง tile ของ OpenFreeMap แล้วทำ tile ใหม่ที่มี 2 layer ส่งให้เบราว์เซอร์ที่ `/boundary-tiles/{z}/{x}/{y}`

### 1.1 เส้น: layer `boundary`

ข้อมูลต้นทาง: relation `boundary=administrative` ใน OSM

| field | ค่า | ใช้อย่างไร |
| --- | --- | --- |
| `admin_level` | 4 = จังหวัด, 6 = อำเภอ, 8 = ตำบล | เลือกระดับ (`OPENFREEMAP_ADMIN_LEVELS`) |
| `maritime` | 1 = เส้นเขตทางทะเล | ตัดออก |
| `disputed` | 1 = พื้นที่พิพาท | ตัดออก |

แล้วตัดเส้นทีละช่วงให้เหลือเฉพาะในไทย (ดู [ข้อ 2](#2-ขอบประเทศไทยที่ใช้ตัดเส้น))

### 1.2 ป้ายชื่อ: layer `place`

layer `place` ของ OpenMapTiles **ไม่มีชื่อพื้นที่การปกครองของไทย** (จังหวัดไทยไม่อยู่ในคลาส `state` และไม่มีชื่ออำเภอ/ตำบลเป็นพื้นที่) จึงใช้จุดเมืองที่เป็น**ที่ตั้งศูนย์กลาง**ของเขตแทน โดยดูจาก field `capital` (= `admin_level` ของเขตที่เมืองนั้นเป็นศูนย์กลาง ข้อมูลจาก tag `capital=*` ใน OSM)

| `capital` | ความหมาย | ป้ายระดับ | ตัวอย่าง |
| --- | --- | --- | --- |
| 2 | เมืองหลวง | จังหวัด | กรุงเทพมหานคร |
| 4 | ที่ตั้งศาลากลางจังหวัด | จังหวัด | ขอนแก่น, เชียงใหม่ |
| 6 | ที่ตั้งตัวอำเภอ | อำเภอ | น้ำพอง, ชุมแพ |

ค่านี้ตั้งไว้ใน `OPENFREEMAP_CAPITAL_LEVELS` ([src/config.js](src/config.js))

| field ของ `place` | ใช้อย่างไร |
| --- | --- |
| `capital` | เลือกจุดและระดับตามตารางข้างบน |
| `name:th` (ไม่มีใช้ `name`) | ชื่อบนป้าย ตัดคำนำหน้า `เทศบาลนคร` `เทศบาลเมือง` `เทศบาลตำบล` `อำเภอ` `จังหวัด` ออก |
| `rank` | ลำดับความสำคัญ (น้อย = สำคัญ ได้วางก่อนเมื่อชนกัน) |

เก็บเฉพาะจุดที่อยู่ในประเทศไทย layer `label` ที่ส่งให้เบราว์เซอร์มี field `level` (`Province`/`Amphoe`), `name`, `rank`

### ข้อจำกัดของป้ายชื่อ

- **ตำบลไม่มีป้าย:** OSM/OpenMapTiles ไม่มีจุดศูนย์กลางตำบลที่ระบุ `capital=8`
- **ป้ายวางที่ตัวเมือง ไม่ใช่กลางพื้นที่:** ป้ายจังหวัดอยู่ที่ตัวเมือง (ศาลากลาง) ป้ายอำเภออยู่ที่ตัวอำเภอ ซึ่งบางแห่งอยู่ใกล้ขอบเขต
- **อำเภอไม่ครบ:** จุดที่มี `capital=6` มีราว 80% ของอำเภอ (นับจากพื้นที่รอบจังหวัดขอนแก่นได้ 84 จุด) ขึ้นกับว่าใน OSM ใส่ tag `capital` ไว้หรือไม่
- **ชื่อเป็นชื่อเมือง ไม่ใช่ชื่อเขต:** ส่วนใหญ่ตรงกัน แต่บางแห่งต่างกัน เช่น อำเภอเมือง (จุดเดียวกับศาลากลาง จึงแสดงเป็นชื่อจังหวัด) หรือชื่อเทศบาลที่ไม่ตรงชื่ออำเภอ
- **ข้อมูลเปลี่ยนตาม OSM:** ถ้ามีคนแก้ tag `capital` หรือ `name:th` ใน OSM ป้ายจะเปลี่ยนตามเมื่อ OpenFreeMap อัปเดตรุ่น

### 1.3 ที่มาของเส้นขอบเขต

OpenFreeMap ไม่ได้มีข้อมูลขอบเขตของตัวเอง ระบบดาวน์โหลดไฟล์ OpenStreetMap ทั้งโลกทุกสัปดาห์ แล้วแปลงเป็น tile ด้วย [Planetiler](https://github.com/onthegomap/planetiler) ตาม schema OpenMapTiles ([README ของ OpenFreeMap](https://github.com/hyperknot/openfreemap))

**แหล่งข้อมูลตามระดับซูม** (จาก [`Boundary.java`](https://github.com/openmaptiles/planetiler-openmaptiles/blob/main/src/main/java/org/openmaptiles/layers/Boundary.java) ของ planetiler-openmaptiles)

| ซูม | แหล่งข้อมูล | ระดับที่มี |
| --- | --- | --- |
| 0–4 | Natural Earth: `ne_10m_admin_1_states_provinces_lines` (เส้นระดับจังหวัด, เฉพาะเส้นที่ `min_zoom` ≤ 7.7) | 2, 4 |
| 5 ขึ้นไป | OSM relation `boundary=administrative` | 4 จากซูม 5 · 6 จากซูม 9 · 8 จากซูม 11 |

ผลกับโปรเจกต์นี้:

- เส้นจังหวัดเริ่มแสดงที่ซูม 4 ตามเกณฑ์ของ air_gistda ซูม 4 เป็นเส้นของ Natural Earth ซึ่งหยาบและไม่ครบ (แสดงจาง 45% อยู่แล้ว) เส้นจาก OSM เริ่มที่ซูม 5
- เส้นอำเภอตั้งไว้ที่ซูม 8 แต่ข้อมูลจริงเริ่มมีที่ซูม 9 ส่วนเส้นตำบลตั้งไว้ที่ซูม 13 ซึ่งข้อมูลมีแล้ว (เริ่มที่ซูม 11)
- เส้นหนึ่งเส้นที่เป็นขอบของหลายระดับ ได้ `admin_level` ต่ำสุด เช่น ขอบตำบลที่ทับขอบจังหวัดนับเป็นระดับ 4 ขอบตำบลที่ทับชายแดนนับเป็นระดับ 2 (เส้นประเทศของ basemap)

**เส้นใน OSM ของไทยมาจากไหน** (ถามผ่าน Overpass API เมื่อ 21 ตุลาคม 2026)

| ระดับ | relation ใน OSM | จำนวนจริงในไทย | tag `source` บน relation |
| --- | --- | --- | --- |
| จังหวัด (`admin_level` 4) | 78 | 77 | ไม่ระบุเลย |
| อำเภอ/เขต (6) | 928 | 878 อำเภอ + 50 เขต = 928 | ระบุ 12 relation: OCHA COD-AB / Royal Thai Survey Department (กรมแผนที่ทหาร) |
| ตำบล/แขวง (8) | **853** | ราว 7,400 | ระบุ 104 relation: Longdo.com, ราชกิจจานุเบกษา (`ratchakitcha.soc.go.th`), OCHA COD-AB / กรมแผนที่ทหาร, แผนที่ภาษีของกรมส่งเสริมการปกครองท้องถิ่น (`ltax.dla.go.th`) |

tag `source` บนเส้น (way) ของจังหวัดขอนแก่น ([relation 1908778](https://www.openstreetmap.org/relation/1908778), 128 way) เป็นตัวอย่างว่าเส้นระดับจังหวัดมาจากไหน:

| `source` | จำนวน way | ความหมาย |
| --- | --- | --- |
| `VMAP0` | 63 | Vector Map Level 0 ข้อมูลแผนที่โลก 1:1,000,000 ของหน่วยงานแผนที่สหรัฐฯ (public domain) ที่นำเข้า OSM ช่วงแรก |
| `Bing`, `Bing; sign` และแบบคล้ายกัน | 39 | อาสาสมัครวาดจากภาพดาวเทียม Bing และป้ายบนถนน |
| `LandSat; sign` และแบบผสม (บางส่วนมี Bing ด้วย) | 11 | วาดจากภาพ Landsat |
| `Mapbox` | 2 | วาดจากภาพดาวเทียม Mapbox |
| ไม่ระบุ | 11 | |
| อื่นๆ | 2 | |

สรุป: เส้นขอบเขตของไทยใน OSM **ไม่ได้มาจากข้อมูลทางราชการชุดเดียว** แต่ผสมการนำเข้า VMAP0, การวาดจากภาพดาวเทียม และการอ้างอิงประกาศ/แผนที่ของหน่วยงานไทยบางส่วน คำถามที่ใช้ซ้ำได้:

```
[out:json][timeout:120];
area["ISO3166-1"="TH"][admin_level=2]->.th;
relation(area.th)["boundary"="administrative"]["admin_level"~"^(4|6|8)$"];
out tags;
```

### ข้อจำกัดของเส้น

- ขอบเขตใน OSM แก้ไขโดยอาสาสมัครจากหลายแหล่ง (ดู [1.3](#13-ที่มาของเส้นขอบเขต)) อาจไม่ตรงกับประกาศทางราชการ **ไม่ควรใช้เป็นหลักฐานทางกฎหมาย**
- เส้นจังหวัดส่วนใหญ่มาจาก VMAP0 มาตราส่วน 1:1,000,000 อาจคลาดจากเส้นจริงได้หลายร้อยเมตรเมื่อซูมลึก
- **เส้นตำบลมีราว 11%** (853 จากราว 7,400 ตำบล/แขวง) ส่วนใหญ่ไม่มีเส้นตำบลเลย (เช่น กลางเมืองขอนแก่นที่ซูม 13) จังหวัดและอำเภอมีครบ
- tile ซูม 4 เป็นเส้นของ Natural Earth จึงมีเส้นจังหวัดไม่ครบ เส้นจาก OSM เริ่มที่ซูม 5

### สัญญาอนุญาต

- ข้อมูล OpenStreetMap: [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/) ต้องให้เครดิต OpenStreetMap contributors ถ้าเผยแพร่ฐานข้อมูลที่ดัดแปลงต้องใช้ ODbL เหมือนกัน ([รายละเอียด](https://www.openstreetmap.org/copyright))
- schema OpenMapTiles: [CC-BY 4.0](https://github.com/openmaptiles/openmaptiles/blob/master/LICENSE.md) ต้องให้เครดิต © OpenMapTiles
- OpenFreeMap ขอให้ใส่เครดิตตามข้อความใน TileJSON

tile ที่ server ทำใหม่ (ตัดเส้น เลือกจุด เปลี่ยนชื่อ field) ถือเป็นงานดัดแปลงจากข้อมูล OSM จึงต้องให้เครดิตเหมือนเดิม

**เครดิตที่ใช้** (ตรงกับ `attribution` ใน TileJSON ของ OpenFreeMap จึงรวมกับของ basemap ไม่ขึ้นซ้ำ):

```html
<a href="https://openfreemap.org">OpenFreeMap</a> <a href="https://www.openmaptiles.org/">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>
```

## 2. ขอบประเทศไทยที่ใช้ตัดเส้น

**ใช้ทำอะไร:** server ใช้ตัดเส้นและเลือกจุดป้ายให้เหลือเฉพาะในไทย ([src/thailand.js](src/thailand.js), 31 KB) ไม่ได้วาดบนแผนที่

**ที่มา**

| | |
| --- | --- |
| ข้อมูล | [Natural Earth](https://www.naturalearthdata.com) 1:10m Admin 0 – Countries |
| ไฟล์ที่ใช้ | `countries-10m.json` จาก npm package [`world-atlas@2.0.2`](https://github.com/topojson/world-atlas) (TopoJSON ของ Natural Earth, ISC) |
| การแปลง | `turf.buffer` ขยายออก 1 กม. → `turf.simplify` (tolerance 0.003°, highQuality) → ปัดพิกัด 3 ตำแหน่ง ได้ 17 polygon 1,893 จุด |

**สัญญาอนุญาต:** Natural Earth เป็น [public domain](https://www.naturalearthdata.com/about/terms-of-use/) ไม่ต้องให้เครดิต แต่ Natural Earth แนะนำให้อ้างอิง "Made with Natural Earth"

**ทำไมขยายออก 1 กม.:** ขอบของ Natural Earth 10m ต่างจากเส้นชายแดนของ OSM ได้หลายร้อยเมตร ถ้าไม่ขยาย ปลายเส้นไทยที่ชนชายแดนจะขาด ผลข้างเคียงคืออาจเห็นปลายเส้นของประเทศเพื่อนบ้านยาวไม่เกิน ~1 กม. ตรงจุดที่มาชนชายแดนเมื่อซูมลึก

**สร้างใหม่**

```js
import * as turf from "@turf/turf";
import { feature } from "topojson-client";

const topo = await (await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-10m.json")).json();
const th = feature(topo, topo.objects.countries).features.find((f) => f.properties.name === "Thailand");
const outline = turf.simplify(turf.buffer(th, 1, { units: "kilometers" }), { tolerance: 0.003, highQuality: true });
// แล้วเขียน outline.geometry เป็น THAILAND_OUTLINE ใน src/thailand.js
```

## 3. ภูมิประเทศ (มุมมอง 3D)

**ใช้ทำอะไร:** terrain และ hillshade เมื่อ `store.setView("3d")` (ปิดได้ด้วย `bindMapLibre(..., { terrain: false })`)

| | |
| --- | --- |
| ข้อมูล | [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) บน AWS Open Data |
| tile | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` (Terrarium encoding, ซูมถึง 15) |
| ต้นทาง | รวมหลายชุด เช่น SRTM, GMTED2010, ETOPO1, NED และอื่นๆ |

**สัญญาอนุญาต/เครดิต:** แต่ละชุดข้อมูลต้นทางมีเงื่อนไขของตัวเอง ดู [รายการเครดิตทั้งหมด](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) แผนที่แสดงลิงก์ไปหน้านั้นให้แล้ว

## 4. แผนที่ฐาน (เฉพาะหน้าตัวอย่าง)

library ไม่ได้บังคับแผนที่ฐาน หน้าตัวอย่างใช้:

| หน้า | แผนที่ฐาน | เงื่อนไข |
| --- | --- | --- |
| MapLibre, React (ซ้าย) | OpenFreeMap styles `liberty`, `positron`, `dark` | เครดิตเหมือนข้อ 1 |
| Leaflet, React (ขวา) | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) ของ OSMF: ห้ามใช้หนัก ห้ามดึงเก็บล่วงหน้า ใช้กับ production ควรเปลี่ยนผู้ให้บริการ |

หน้าตัวอย่างซ่อนเส้นจังหวัดของแผนที่ฐาน (`boundary_3` ใน liberty/positron, `boundary_state` ใน dark) เพราะเป็นของทุกประเทศ เส้นประเทศ (`admin_level` 2) ของแผนที่ฐานยังแสดงอยู่

## 5. ฟอนต์ป้าย

**ป้ายของ library: Kanit Regular**

| | |
| --- | --- |
| ฟอนต์ | [Kanit](https://fonts.google.com/specimen/Kanit) Regular ออกแบบโดย Cadson Demak ([github.com/cadsondemak/kanit](https://github.com/cadsondemak/kanit)) |
| ไฟล์ต้นทาง | `https://github.com/google/fonts/raw/main/ofl/kanit/Kanit-Regular.ttf` (รุ่น 2.000) |
| สัญญาอนุญาต | [SIL Open Font License 1.1](https://openfontlicense.org) แจกจ่ายต่อและดัดแปลงได้ ต้องแนบสัญญาอนุญาต (อยู่ที่ [`fonts/Kanit Regular/OFL.txt`](fonts/Kanit%20Regular/OFL.txt)) ห้ามขายตัวฟอนต์แยกเดี่ยว |
| การแปลง | [`scripts/build-glyphs.mjs`](scripts/build-glyphs.mjs) อ่านเส้นโครงด้วย [opentype.js](https://github.com/opentypejs/opentype.js) แล้วคำนวณ signed distance field: 24 px, buffer 3, รัศมี 8, cutoff 0.25 ได้ 725 glyph ใน 12 ช่วง (313 KB) |
| ส่งให้แผนที่ | `tileMiddleware` ที่ `/boundary-fonts/Kanit Regular/{range}.pbf` |

glyph ที่สร้างตรวจเทียบกับ glyph Noto Sans Regular ของ OpenFreeMap โดยสร้างจาก `NotoSans-Regular.ttf` ด้วยสคริปต์เดียวกัน ขนาด ตำแหน่ง baseline และระยะตัวอักษรของ A, H, M, g, j, x, y, . ตรงกันทุกตัว

glyph ที่ได้เป็นงานดัดแปลงจากฟอนต์ ใช้ OFL 1.1 เหมือนต้นฉบับ ชื่อ "Kanit" ไม่ได้เป็น Reserved Font Name จึงใช้ชื่อเดิมได้

**ป้ายของแผนที่ฐาน: Noto Sans** (style ของ OpenFreeMap) `tileMiddleware` ส่งต่อคำขอ glyph ที่ไม่ใช่ Kanit ไปที่ `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf` Noto Sans ใช้ [SIL OFL 1.1](https://openfontlicense.org) เช่นกัน ไม่ต้องแสดงเครดิตบนแผนที่

## 6. library ที่ใช้

| package | ใช้ที่ | สัญญาอนุญาต |
| --- | --- | --- |
| `@mapbox/vector-tile` | server: อ่าน tile ของ OpenFreeMap | BSD-3-Clause |
| `pbf` | server: อ่าน/เขียน protobuf | BSD-3-Clause |
| `maplibre-gl` (peer) | วาดแผนที่ | BSD-3-Clause |
| `leaflet` (peer) | แผนที่ Leaflet | BSD-2-Clause |
| `@maplibre/maplibre-gl-leaflet` (peer) | ซ้อน MapLibre ใน Leaflet | ISC |
| `react` (peer) | React bindings | MIT |
| `@maplibre/maplibre-gl-style-spec` (dev) | test: ตรวจ style spec | ISC |
| `opentype.js` (dev) | `scripts/build-glyphs.mjs`: อ่านไฟล์ฟอนต์ | MIT |

หน้าตัวอย่างโหลด MapLibre GL 5.24.0, Leaflet 1.9.4, maplibre-gl-leaflet 0.1.4 จาก unpkg และ React 18.3.1 (MIT), htm 3.1.1 (Apache-2.0) จาก esm.sh

## ทำไมต้องผ่าน server

เส้นของ OpenFreeMap เป็นของทั้งโลก ไม่มี field ประเทศ และทุกเส้นระดับเดียวกันใน tile ถูกรวมเป็น feature เดียว (เช่น tile ซูม 5 กลางประเทศไทยมี 1 feature ที่มี 139 เส้น ครึ่งหนึ่งอยู่นอกไทย) filter ของ MapLibre (`["within", ...]`) เลือกได้ทั้ง feature หรือไม่เลือกเลย tile ชายแดนจะเสียเส้นไทยไปด้วย server จึงตัดเส้นทีละช่วงที่จุดข้ามชายแดนแทน

ป้ายก็ทำที่ server ด้วยเหตุผลเดียวกัน (ต้องเลือกเฉพาะจุดในไทย) และได้ตัดคำนำหน้าชื่อไปพร้อมกัน เบราว์เซอร์จึงโหลด tile ชุดเดียว

## การอ้างอิงในเอกสาร/รายงาน

ตัวอย่างข้อความอ้างอิงเมื่อนำแผนที่ไปใช้ในรายงานหรือสิ่งพิมพ์:

> ขอบเขตการปกครองและชื่อพื้นที่: © ผู้ร่วมพัฒนา OpenStreetMap (ODbL) ผ่าน OpenFreeMap / © OpenMapTiles · ขอบประเทศ: Natural Earth

> Administrative boundaries and place names: © OpenStreetMap contributors (ODbL), via OpenFreeMap / © OpenMapTiles. Country outline: Made with Natural Earth.

ถ้าใช้มุมมอง 3D ให้เพิ่ม: ภูมิประเทศ: Mapzen Terrain Tiles (ดูรายการแหล่งข้อมูลที่ https://github.com/tilezen/joerd/blob/master/docs/attribution.md)
