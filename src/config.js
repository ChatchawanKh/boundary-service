// ค่าตั้งต้นที่ไม่ผูกกับ SDK ใด
// ซูมทุกค่าเป็นหน่วยของ MapLibre (tile 512 px) ส่วน Leaflet ผ่าน maplibre-gl-leaflet แปลงให้เอง

export const LEVELS = Object.freeze(["Province", "Amphoe", "Tambon"]);

export const LEVEL_NAMES_TH = Object.freeze({
  Province: "จังหวัด",
  Amphoe: "อำเภอ",
  Tambon: "ตำบล",
});

export const VIEWS = Object.freeze(["2d", "2.5d", "3d"]);

// [west, south, east, north] ไม่ขอ tile นอกกรอบนี้
export const THAILAND_BOUNDS = Object.freeze([97.3, 5.6, 105.7, 20.5]);

// key ใน metadata ของทุก layer ที่ library สร้าง ให้โค้ดภายนอกแยกออกได้
export const META_KEY = "admin-boundary";

// เกณฑ์การแสดงผลเดียวกับ air_gistda (src/lib/adminBoundary.js) ในโทนขาวดำ
//
//   ซูม     เส้น (สะสม)              ป้าย (ทีละระดับ)
//   1–3     –                        จังหวัด
//   4–7     จังหวัด                   จังหวัด
//   8–9     จังหวัด + อำเภอ            จังหวัด
//   10–12   จังหวัด + อำเภอ            อำเภอ
//   13+     จังหวัด + อำเภอ + ตำบล      ตำบล
//
// ค่าที่เป็น [[zoom, ค่า], ...] สอดแทรกเชิงเส้นตามซูม ใส่ตัวเลขเดียวก็ได้
//   width, casingWidth  ความหนา (px) ของเส้นหลักและเส้นรองพื้น
//   opacity, casingOpacity  ความทึบ 0–1 (คูณกับ opacity ของระดับใน store อีกที)
//   dash  [ยาว, เว้น] เป็นเท่าของความหนาเส้น หรือ null = เส้นทึบ
//   labelMaxzoom ไม่รวมขอบ (ป้ายหายตั้งแต่ซูมนั้น)

const mmToPx = (mm) => (mm * 96) / 25.4;
const TAMBON_WIDTH = mmToPx(0.25); // ≈ 0.94 px

export const DEFAULT_LEVEL_STYLES = Object.freeze({
  Province: Object.freeze({
    color: "#1a1a1a",
    width: [[4, 0.5], [8, 1.2], [12, 2], [16, 2.6]],
    // ซูมไกลเส้นจังหวัดถี่มาก จางไว้ก่อน ชัดเต็มที่ z8
    opacity: [[4, 0.45], [8, 1]],
    casingColor: "#ffffff",
    casingWidth: [[4, 1.2], [8, 2.8], [12, 4], [16, 5]],
    casingOpacity: [[4, 0.3], [8, 0.6]],
    dash: null,
    minzoom: 4, // z4 ยังเป็นเส้นของ Natural Earth (หยาบ) OSM เริ่มที่ z5 ดู REF.md 1.3
    labelMinzoom: 1,
    labelMaxzoom: 10,
    labelSize: 16,
    labelColor: "#383838",
  }),
  Amphoe: Object.freeze({
    color: "#4d4d4d",
    width: [[8, 0.8], [14, 1.6]],
    opacity: 1,
    casingColor: "#ffffff",
    casingWidth: [[8, 1.6], [14, 3]],
    casingOpacity: 0.35,
    dash: [3, 2],
    minzoom: 8, // ข้อมูลระดับ 6 ใน OpenMapTiles เริ่มมีที่ z9
    labelMinzoom: 10,
    labelMaxzoom: 13,
    labelSize: 16,
    labelColor: "#383838",
  }),
  Tambon: Object.freeze({
    // เส้นประขาวบนเส้นรองเทาเข้ม อ่านออกทั้งบนแผนที่ถนนและภาพดาวเทียม
    color: "#ffffff",
    width: TAMBON_WIDTH,
    opacity: 1,
    casingColor: "#383838",
    casingWidth: 2.2,
    casingOpacity: 0.55,
    dash: [4 / TAMBON_WIDTH, 3 / TAMBON_WIDTH], // ขีด 4 px เว้น 3 px
    minzoom: 13,
    labelMinzoom: 13,
    labelMaxzoom: 24,
    labelSize: 16,
    labelColor: "#383838",
  }),
});

// ฟอนต์ของป้าย: Kanit (Google Fonts, SIL OFL 1.1) แปลงเป็น glyph .pbf ไว้ใน fonts/ แล้ว
// tileMiddleware ส่งให้ที่ /boundary-fonts (MapLibre วาดป้ายจาก glyph .pbf เท่านั้น ใช้ฟอนต์เว็บตรงๆ ไม่ได้)
export const DEFAULT_FONT = Object.freeze(["Kanit Regular"]);
export const DEFAULT_GLYPHS = "/boundary-fonts/{fontstack}/{range}.pbf";
// glyph server สำรองสำหรับ fontstack อื่น (เช่น Noto Sans ของ basemap OpenFreeMap)
export const OPENFREEMAP_GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

// รูปแบบป้ายที่ใช้ร่วมกันทุกระดับ
export const LABEL_STYLE = Object.freeze({
  haloColor: "#ffffff",
  haloWidth: 2,
  haloBlur: 1,
  padding: 6, // ระยะห่างขั้นต่ำระหว่างป้าย (px)
  maxWidth: 100, // em: กว้างพอที่จะไม่ตัดบรรทัด
});

// เส้นขอบเขต: layer "boundary" ของ OpenFreeMap (OpenMapTiles schema)
export const OPENFREEMAP_TILEJSON = "https://tiles.openfreemap.org/planet";
export const OPENFREEMAP_ADMIN_LEVELS = Object.freeze({ Province: 4, Amphoe: 6, Tambon: 8 });

// ขอบเขตตำบล: ArcGIS MapServer ของ GISTDA (ข้อมูลกรมการปกครอง ครบ 7,408 ตำบล)
// OSM มีเส้นตำบลแค่ราว 11% จึงใช้ชุดนี้แทนทั้งเส้นและป้ายของระดับตำบล ตั้งแต่ minzoom
export const GISTDA_TAMBON_SERVICE = Object.freeze({
  url: "https://gistdaportal.gistda.or.th/arcgis/rest/services/ข้อมูลเขตการปกครอง/MapServer/4",
  minzoom: 13,
  name: "T_Name_T",
  area: "Shape_Area",
});

// ป้ายชื่อ: layer "place" ของ OpenFreeMap ไม่มีชื่อพื้นที่การปกครองของไทย จึงใช้จุดเมืองที่เป็นที่ตั้ง
// ศาลากลาง/ตัวอำเภอ (field capital = admin_level ของเขตที่เมืองนั้นเป็นศูนย์กลาง) ไม่มีระดับตำบล
export const OPENFREEMAP_CAPITAL_LEVELS = Object.freeze({ 2: "Province", 4: "Province", 6: "Amphoe" });

// มุมกล้องของแต่ละมุมมอง (SDK ที่ไม่รองรับการเอียงจะใช้ 2d เสมอ)
export const VIEW_CAMERA = Object.freeze({
  "2d": { pitch: 0, bearing: 0 },
  "2.5d": { pitch: 55, bearing: -15 },
  "3d": { pitch: 65, bearing: -20 },
});

export const ATTRIBUTION = Object.freeze({
  openFreeMap:
    '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
  gistdaTambon:
    'ขอบเขตตำบล: <a href="https://gistdaportal.gistda.or.th" target="_blank">GISTDA</a> (กรมการปกครอง)',
  terrain:
    '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank">Terrain Tiles (Mapzen/AWS)</a>',
});

// แหล่ง DEM สำหรับมุมมอง 3D (Terrarium encoding, เปิด CORS)
export const DEFAULT_TERRAIN = Object.freeze({
  tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
  encoding: "terrarium",
  tileSize: 256,
  maxzoom: 15,
  attribution: ATTRIBUTION.terrain,
});
