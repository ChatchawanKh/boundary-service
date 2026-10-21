# แหล่งข้อมูลและการอ้างอิง

เอกสารนี้บอกว่า admin-boundary ใช้ข้อมูลจากที่ไหน ใช้อย่างไร มีเงื่อนไขอะไร และต้องอ้างอิงอย่างไร

ตรวจสอบข้อมูลล่าสุด: 21 ตุลาคม 2026

## สรุป

| ส่วน | แหล่งข้อมูล | สัญญาอนุญาต | ต้องแสดงเครดิต |
| --- | --- | --- | --- |
| เส้นและป้ายชื่อ จังหวัด/อำเภอ/ตำบล | ArcGIS MapServer ของ GISTDA ข้อมูลกรมการปกครอง (ดู [ข้อ 1](#1-ข้อมูลขอบเขตการปกครอง-gistda)) | ไม่ได้ระบุไว้ใน service (copyright: GISTDA) | ✓ (ใส่ไว้แล้ว) |
| ฟอนต์ป้าย | Kanit (Google Fonts) แปลงเป็น glyph ใน `fonts/` | SIL OFL 1.1 | ไม่บังคับ (แนบ `OFL.txt` แล้ว) |
| ภูมิประเทศในมุมมอง 3D | Mapzen Terrain Tiles บน AWS | หลายแหล่ง (ดู [ข้อ 2](#2-ภูมิประเทศ-มุมมอง-3d)) | ✓ |
| แผนที่ฐานในหน้าตัวอย่าง | OpenFreeMap styles, OpenStreetMap tile server | ODbL / เงื่อนไขการใช้ tile | ✓ (แผนที่ฐานแสดงเอง) |

ข้อความเครดิตที่แผนที่แสดงอัตโนมัติ (มุมขวาล่าง) มาจาก `ATTRIBUTION` ใน [src/config.js](src/config.js) **อย่าซ่อน attribution control ของแผนที่** ถ้าจำเป็นต้องซ่อน ให้แสดงข้อความเดียวกันที่อื่นบนหน้าเว็บ

---

## 1. ข้อมูลขอบเขตการปกครอง: GISTDA

**ใช้ทำอะไร:** เส้นและป้ายชื่อทุกระดับ (จังหวัด อำเภอ/เขต ตำบล/แขวง)

**ที่มา**

| | |
| --- | --- |
| service | ArcGIS MapServer ของ GISTDA [`https://gistdaportal.gistda.or.th/arcgis/rest/services/ข้อมูลเขตการปกครอง/MapServer`](https://gistdaportal.gistda.or.th/arcgis/rest/services/ข้อมูลเขตการปกครอง/MapServer) |
| คำอธิบาย service | "ข้อมูลการปกครอง" copyright "GISTDA" |
| ระบบพิกัดต้นทาง | UTM zone 47N (EPSG:32647) ขอผลเป็น WGS84 (`outSR=4326`) |
| วันที่ข้อมูล (field `Source_dat`) | 30 ธันวาคม 2013 (พ.ศ. 2556) ทุกแถวทุก layer |

| layer | ชื่อ | จำนวน | แหล่งข้อมูลต้นทาง (field `Source_Nam`) | ใช้ทำอะไร |
| --- | --- | --- | --- | --- |
| 2 | ขอบเขตจังหวัด | 77 | `DOPA` (กรมการปกครอง) 77 | ป้ายจังหวัด |
| 3 | ขอบเขตอำเภอ | 929 (อำเภอ 879 + เขต 50) | `DOPA` 879 · `GISTDA` 50 | ป้ายอำเภอ |
| 4 | ขอบเขตตำบล | 7,408 | `DOPA` 7,150 · `GISTDA` 104 · ไม่ระบุ 154 | เส้นทุกระดับ + ป้ายตำบล |

layer อื่นที่ไม่ได้ใช้: 0 ตำแหน่งองค์กรปกครองส่วนท้องถิ่น, 1 ตำแหน่งหมู่บ้าน

**field ที่ใช้** (ตั้งไว้ใน `GISTDA_ADMIN_SERVICE.fields` ใน [src/config.js](src/config.js))

| layer | field | ใช้อย่างไร |
| --- | --- | --- |
| 4 ตำบล | `P_code`, `A_code` | จำแนกระดับของเส้น (ตำบลสองฝั่งต่างจังหวัด/ต่างอำเภอหรือไม่) |
| 2/3/4 | `P_Name_T`, `A_Name_T`, `T_Name_T` | ชื่อบนป้าย ตัดคำนำหน้า `จังหวัด` / `อำเภอ` `เขต` / `ตำบล` `แขวง` ออก |
| 2/3/4 | `SHAPE_Area`, `Shape_Area` | จัดลำดับป้าย: พื้นที่ใหญ่ได้วางก่อนเมื่อชนกัน |

field อื่นที่มี: `Admin_code` (รหัสกรมการปกครอง), ชื่อภาษาอังกฤษ (`*_Name_E`), `Population` (ตำบล), `P_group` (จังหวัด)

### วิธีดึงข้อมูล

ดึงจาก service ครั้งเดียวตอนเริ่ม server แล้วเก็บ cache ไว้ที่ `.cache/admin-boundary/` (อายุ 30 วัน)

| ข้อมูล | query | ขนาด |
| --- | --- | --- |
| ตำบล (layer 4) | ทีละจังหวัด `where=P_code='xx'` 77 ครั้ง (พร้อมกัน 4 request) แบบไม่ย่อจุด `geometryPrecision=7` | รวมราว 145 MB, 3.08 ล้านจุด |
| อำเภอ (layer 3) | ทั้งประเทศ ย่อจุด `maxAllowableOffset=0.0005` (≈ 50 ม.) ใช้หาจุดวางป้ายเท่านั้น | ราว 5 MB |
| จังหวัด (layer 2) | ทั้งประเทศ ย่อจุด `maxAllowableOffset=0.001` (≈ 100 ม.) ใช้หาจุดวางป้ายเท่านั้น | ราว 1 MB |

ทุก query ใช้ `POST` และ `f=geojson` ครั้งแรกใช้เวลาราว 20 วินาที

**ทำไมไม่ดึงทีละ tile:** ที่ซูมต่ำข้อมูลใหญ่และช้า (จังหวัดซูม 5 แบบเต็มความละเอียด 11 MB / 2.2 วินาทีต่อ tile) และถ้าให้ service ย่อจุดให้ (`maxAllowableOffset`) แต่ละพื้นที่จะถูกย่อแยกกัน ขอบร่วมจับคู่ได้แค่ 40–60% เส้นที่ใช้ร่วมกันจะซ้อนเหลื่อมกันและเส้นประเพี้ยน ส่วนอำเภอทั้งประเทศแบบเต็มความละเอียด server ปฏิเสธ

### วิธีสร้างเส้น ([src/gistda.js](src/gistda.js))

ทั้งสามระดับสร้างจากขอบของ **ตำบล** ชุดเดียว:

1. เก็บขอบทุกช่วงของทุกตำบลครั้งเดียว พร้อมตำบลสองฝั่งของขอบนั้น (ใช้พิกัดเดิมเป็น key ขอบร่วมจึงตรงกันพอดี)
2. จำแนกระดับ: ตำบลสองฝั่งต่างจังหวัด → เส้นจังหวัด (`admin_level` 4) ต่างอำเภอ → เส้นอำเภอ (6) นอกนั้น → เส้นตำบล (8)
3. ขอบที่มีตำบลฝั่งเดียว (ชายแดนประเทศและชายฝั่ง 252,301 ช่วง) **ไม่วาด** ให้แผนที่ฐานวาดเส้นประเทศและชายฝั่ง
4. ต่อขอบเป็นเส้นยาว ตัดที่ทางแยกและที่ระดับเปลี่ยน ได้ 21,070 เส้น (จังหวัด 2,465 · อำเภอ 6,382 · ตำบล 12,223)
5. ย่อจุดทีละเส้นตามซูม (Douglas–Peucker คลาดไม่เกินครึ่ง px) ปลายเส้นคงที่ ขอบร่วมจึงยังตรงกันทุกซูม ซูม 12 ขึ้นไปใช้เต็มความละเอียด
6. ตัด tile ตามกรอบ + buffer ส่งเป็น Mapbox Vector Tile layer `boundary` และ `label`

ใช้เวลาสร้างราว 7 วินาที

**ตรวจแล้วว่าสามระดับซ้อนกันพอดี:** ในพื้นที่ทดสอบรอบรอยต่อ ขอนแก่น–มหาสารคาม–กาฬสินธุ์ ขอบจังหวัดของ layer 2 ตรงกับขอบอำเภอ (layer 3) และขอบตำบล (layer 4) ทุกช่วง (1,538/1,538) ขอบอำเภอตรงกับขอบตำบลทุกช่วง (2,090/2,090) การสร้างทุกระดับจากขอบตำบลจึงได้ผลเท่ากับใช้ layer 2/3 ตรงๆ

### ป้ายชื่อ

- วางที่จุดที่ "ลึก" ที่สุดของพื้นที่ (pole of inaccessibility) ของส่วนที่ใหญ่ที่สุด (เช่น แผ่นดินใหญ่ ไม่ใช่เกาะ) ความแม่นยำราว 1% ของขนาดพื้นที่
- จังหวัด/อำเภอใช้รูปทรงแบบย่อจาก layer 2/3 ตำบลใช้รูปทรงเต็มจาก layer 4
- ใส่เฉพาะ tile ที่จุดนั้นตกอยู่ ป้ายจึงไม่ซ้ำข้าม tile

### คุณภาพข้อมูลที่พบ

- `Admin_code` ของอำเภอซ้ำ 2 คู่ เช่น อ.เวียงเก่า (`A_code` 26) ได้ `Admin_code` 4016 ซ้ำกับ อ.ภูเวียง ที่ถูกควรเป็น 4026 ไม่กระทบการวาด (ใช้ `P_code` + `A_code`) แต่ระวังถ้าจะใช้ `Admin_code` ไป join ข้อมูล
- ชื่อสะกดผิด "อำเภเมืองบึงกาฬ" (ตัดคำนำหน้าแบบเผื่อไว้แล้ว ป้ายจึงขึ้น "เมืองบึงกาฬ")

### สัญญาอนุญาต/เครดิต

service ไม่ได้ระบุสัญญาอนุญาต มีแค่ copyright "GISTDA" **ก่อนนำไปใช้กับระบบที่เปิดให้คนทั่วไปใช้ ควรสอบถามเงื่อนไขกับ GISTDA**

เครดิตที่แผนที่แสดง: `ขอบเขตการปกครอง: GISTDA (กรมการปกครอง)` (ลิงก์ไป gistdaportal.gistda.or.th)

### ข้อจำกัด

- **ข้อมูลปี 2556:** เขตที่ตั้งหรือเปลี่ยนแปลงหลังจากนั้นจะไม่ตรง ไม่ควรใช้เป็นหลักฐานทางกฎหมาย
- **แนวชายแดน/ชายฝั่ง:** ไม่วาดเส้นของเราตรงนั้น เส้นประเทศ/ชายฝั่งที่เห็นเป็นของแผนที่ฐาน (OSM) ซึ่งอาจห่างจากขอบของข้อมูลกรมการปกครองได้หลายร้อยเมตรเมื่อซูมลึก
- **พึ่งพา service ภายนอก:** ถ้า gistdaportal ล่มหรือย้าย URL และไม่มี cache บนดิสก์ จะไม่มีขอบเขตเลย (server ลองใหม่ทุก 60 วินาที) เปลี่ยน URL ได้ที่ `GISTDA_ADMIN_SERVICE` หรือ `tileMiddleware({ boundary: { service } })`
- **หน่วยความจำตอนเริ่ม:** ราว 750 MB ระหว่างสร้าง เหลือราว 60 MB หลังเสร็จ

## 2. ภูมิประเทศ (มุมมอง 3D)

**ใช้ทำอะไร:** terrain และ hillshade เมื่อ `store.setView("3d")` (ปิดได้ด้วย `bindMapLibre(..., { terrain: false })`)

| | |
| --- | --- |
| ข้อมูล | [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) บน AWS Open Data |
| tile | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` (Terrarium encoding, ซูมถึง 15) |
| ต้นทาง | รวมหลายชุด เช่น SRTM, GMTED2010, ETOPO1, NED และอื่นๆ |

**สัญญาอนุญาต/เครดิต:** แต่ละชุดข้อมูลต้นทางมีเงื่อนไขของตัวเอง ดู [รายการเครดิตทั้งหมด](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) แผนที่แสดงลิงก์ไปหน้านั้นให้แล้ว

## 3. แผนที่ฐาน (เฉพาะหน้าตัวอย่าง)

library ไม่ได้บังคับแผนที่ฐาน และไม่ได้ใช้ข้อมูลของแผนที่ฐานทำขอบเขต หน้าตัวอย่างใช้:

| หน้า | แผนที่ฐาน | เงื่อนไข |
| --- | --- | --- |
| MapLibre, React (ซ้าย) | [OpenFreeMap](https://openfreemap.org) styles `liberty`, `positron`, `dark` (ข้อมูล OpenStreetMap) | ODbL 1.0 / © OpenMapTiles แผนที่ฐานแสดงเครดิตเอง |
| Leaflet, React (ขวา) | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) ของ OSMF: ห้ามใช้หนัก ห้ามดึงเก็บล่วงหน้า ใช้กับ production ควรเปลี่ยนผู้ให้บริการ |

แผนที่ฐานของ OpenFreeMap มีเส้นจังหวัด/อำเภอของ OSM อยู่แล้ว หน้าตัวอย่างซ่อนไว้ด้วย `hideBasemapLayers: ["boundary_3", "boundary_state"]` ไม่ให้ซ้อนกับเส้นของเรา เส้นประเทศ (`admin_level` 2) ของแผนที่ฐานยังแสดงอยู่

ป้ายของแผนที่ฐานใช้ฟอนต์ Noto Sans ของ OpenFreeMap (SIL OFL 1.1) `tileMiddleware` ส่งต่อคำขอ glyph ที่ไม่ใช่ Kanit ไปที่ `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf` (เปลี่ยนได้ด้วย `tileMiddleware({ glyphs: { upstream } })` ถ้าใช้แผนที่ฐานอื่น)

## 4. ฟอนต์ป้าย: Kanit Regular

| | |
| --- | --- |
| ฟอนต์ | [Kanit](https://fonts.google.com/specimen/Kanit) Regular ออกแบบโดย Cadson Demak ([github.com/cadsondemak/kanit](https://github.com/cadsondemak/kanit)) |
| ไฟล์ต้นทาง | `https://github.com/google/fonts/raw/main/ofl/kanit/Kanit-Regular.ttf` (รุ่น 2.000) |
| สัญญาอนุญาต | [SIL Open Font License 1.1](https://openfontlicense.org) แจกจ่ายต่อและดัดแปลงได้ ต้องแนบสัญญาอนุญาต (อยู่ที่ [`fonts/Kanit Regular/OFL.txt`](fonts/Kanit%20Regular/OFL.txt)) ห้ามขายตัวฟอนต์แยกเดี่ยว |
| การแปลง | [`scripts/build-glyphs.mjs`](scripts/build-glyphs.mjs) อ่านเส้นโครงด้วย [opentype.js](https://github.com/opentypejs/opentype.js) แล้วคำนวณ signed distance field: 24 px, buffer 3, รัศมี 8, cutoff 0.25 ได้ 725 glyph ใน 12 ช่วง (313 KB) |
| ส่งให้แผนที่ | `tileMiddleware` ที่ `/boundary-fonts/Kanit Regular/{range}.pbf` |

glyph ที่สร้างตรวจเทียบกับ glyph Noto Sans Regular ของ OpenFreeMap โดยสร้างจาก `NotoSans-Regular.ttf` ด้วยสคริปต์เดียวกัน ขนาด ตำแหน่ง baseline และระยะตัวอักษรของ A, H, M, g, j, x, y, . ตรงกันทุกตัว

glyph ที่ได้เป็นงานดัดแปลงจากฟอนต์ ใช้ OFL 1.1 เหมือนต้นฉบับ ชื่อ "Kanit" ไม่ได้เป็น Reserved Font Name จึงใช้ชื่อเดิมได้

## 5. library ที่ใช้

| package | ใช้ที่ | สัญญาอนุญาต |
| --- | --- | --- |
| `pbf` | server: เขียน vector tile / อ่านเขียน glyph | BSD-3-Clause |
| `maplibre-gl` (peer) | วาดแผนที่ | BSD-3-Clause |
| `leaflet` (peer) | แผนที่ Leaflet | BSD-2-Clause |
| `@maplibre/maplibre-gl-leaflet` (peer) | ซ้อน MapLibre ใน Leaflet | ISC |
| `react` (peer) | React bindings | MIT |
| `@mapbox/vector-tile` (dev) | test: อ่าน tile ที่ server สร้าง | BSD-3-Clause |
| `@maplibre/maplibre-gl-style-spec` (dev) | test: ตรวจ style spec | ISC |
| `opentype.js` (dev) | `scripts/build-glyphs.mjs`: อ่านไฟล์ฟอนต์ | MIT |

หน้าตัวอย่างโหลด MapLibre GL 5.24.0, Leaflet 1.9.4, maplibre-gl-leaflet 0.1.4 จาก unpkg และ React 18.3.1 (MIT), htm 3.1.1 (Apache-2.0) จาก esm.sh

## ทำไมต้องผ่าน server

- **รวมขอบร่วมให้เหลือเส้นเดียวและจำแนกระดับ:** service ส่งข้อมูลเป็น polygon ถ้าวาดขอบของแต่ละพื้นที่ตรงๆ ขอบที่สองพื้นที่ใช้ร่วมกันจะถูกวาดซ้ำ เส้นประเหลื่อมกันจนดูเป็นเส้นทึบ และต้องรู้ทั้งสองฝั่งจึงบอกได้ว่าเป็นเส้นระดับไหน
- **ขนาดข้อมูล:** ข้อมูลเต็มความละเอียดราว 145 MB ส่งให้เบราว์เซอร์ทั้งก้อนไม่ได้ server ย่อจุดตามซูมแล้วส่งเป็น tile เล็กๆ (1–45 KB)
- **ฟอนต์:** แผนที่ต้องโหลด glyph ของ Kanit จาก server เดียวกัน

## การอ้างอิงในเอกสาร/รายงาน

ตัวอย่างข้อความอ้างอิงเมื่อนำแผนที่ไปใช้ในรายงานหรือสิ่งพิมพ์:

> ขอบเขตการปกครองและชื่อพื้นที่: สำนักงานพัฒนาเทคโนโลยีอวกาศและภูมิสารสนเทศ (GISTDA) จากข้อมูลกรมการปกครอง พ.ศ. 2556

> Administrative boundaries and names: Geo-Informatics and Space Technology Development Agency (GISTDA), from Department of Provincial Administration data (2013).

ถ้ามีแผนที่ฐานให้เพิ่มเครดิตของแผนที่ฐานนั้นด้วย เช่น "แผนที่ฐาน: © ผู้ร่วมพัฒนา OpenStreetMap ผ่าน OpenFreeMap / © OpenMapTiles" ถ้าใช้มุมมอง 3D ให้เพิ่ม "ภูมิประเทศ: Mapzen Terrain Tiles"

---

## ภาคผนวก: ทำไมไม่ใช้ OpenStreetMap / OpenFreeMap

รุ่นก่อนหน้าของโปรเจกต์นี้ใช้เส้นขอบเขตจาก OpenFreeMap (ข้อมูล OpenStreetMap) แล้วเปลี่ยนมาใช้ข้อมูลกรมการปกครองทั้งหมด เพราะ:

| ปัญหา | รายละเอียด |
| --- | --- |
| เส้นตำบลไม่ครบ | OSM มี relation ตำบล/แขวง (`admin_level` 8) 853 จากราว 7,400 (ราว 11%) จังหวัด (78) และอำเภอ (928) ครบ |
| เส้นจังหวัดหยาบ | ตัวอย่างจังหวัดขอนแก่น ([relation 1908778](https://www.openstreetmap.org/relation/1908778)) 63 จาก 128 way มี `source=VMAP0` (แผนที่โลก 1:1,000,000 ที่นำเข้า OSM ช่วงแรก) ที่เหลือวาดจากภาพดาวเทียม Bing/Landsat |
| ที่มาหลากหลาย | tag `source` ที่ระบุไว้มีทั้ง OCHA COD-AB / กรมแผนที่ทหาร, Longdo.com, ราชกิจจานุเบกษา, แผนที่ภาษีของ สถ. แต่ส่วนใหญ่ไม่ระบุ |
| ไม่มีชื่อพื้นที่ | layer `place` ของ OpenMapTiles ไม่มีชื่อเขตการปกครองของไทย ต้องใช้จุดเมืองที่มี tag `capital` แทน (จังหวัดได้ อำเภอราว 80% ตำบลไม่มี) และป้ายวางที่ตัวเมือง ไม่ใช่กลางพื้นที่ |
| แยกประเทศไม่ได้ | เส้นระดับ 4/6/8 ไม่มี field ประเทศ และ OpenMapTiles รวมทุกเส้นระดับเดียวกันใน tile เป็น feature เดียว ต้องตัดตามขอบประเทศเองที่ server |
| ซูมต่ำไม่ครบ | Planetiler ใช้ Natural Earth แทน OSM ที่ซูม 0–4 ([Boundary.java](https://github.com/openmaptiles/planetiler-openmaptiles/blob/main/src/main/java/org/openmaptiles/layers/Boundary.java)) |
| ไม่ตรงกับข้อมูลราชการ | เส้นอำเภอ/จังหวัดของ OSM กับเส้นตำบลของกรมการปกครองวิ่งคู่กันห่างราว 100–200 ม. ตามแนวเขต |

ข้อมูล OSM ตรวจผ่าน Overpass API เมื่อ 21 ตุลาคม 2026:

```
[out:json][timeout:120];
area["ISO3166-1"="TH"][admin_level=2]->.th;
relation(area.th)["boundary"="administrative"]["admin_level"~"^(4|6|8)$"];
out tags;
```
