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

// โทนขาวดำ ไล่น้ำหนักตามระดับ: จังหวัด ดำ ทึบ หนา → อำเภอ เทาเข้ม ประยาว → ตำบล เทา ประสั้น บาง
// ทุกระดับมีเส้นขาวรองใต้ (casing) ให้อ่านออกบนพื้นแผนที่ทุกสี
//
// width, labelSize: [[zoom, px], ...] สอดแทรกเชิงเส้นตามซูม
// dash: [ยาว, เว้น] เป็นเท่าของความหนาเส้น หรือ null = เส้นทึบ
// labelMaxzoom ไม่รวมขอบ (ป้ายหายตั้งแต่ซูมนั้น)
export const DEFAULT_LEVEL_STYLES = Object.freeze({
  Province: Object.freeze({
    color: "#1a1a1a",
    width: [[5, 1.2], [8, 2], [12, 3]],
    casingColor: "#ffffff",
    casingWidth: 2,
    dash: null,
    minzoom: 5, // tile ของ OpenMapTiles ซูมต่ำกว่านี้มีเส้นระดับจังหวัดไม่ครบ
    labelMinzoom: 5,
    labelMaxzoom: 9,
    labelSize: [[5, 11], [8, 15]],
    labelColor: "#1a1a1a",
  }),
  Amphoe: Object.freeze({
    color: "#4d4d4d",
    width: [[7, 0.8], [10, 1.4], [14, 2]],
    casingColor: "#ffffff",
    casingWidth: 1.5,
    dash: [5, 2.5],
    minzoom: 7,
    labelMinzoom: 9,
    labelMaxzoom: 12,
    labelSize: [[9, 11], [11, 14]],
    labelColor: "#333333",
  }),
  Tambon: Object.freeze({
    color: "#808080",
    width: [[10, 0.6], [13, 1], [16, 1.6]],
    casingColor: "#ffffff",
    casingWidth: 1,
    dash: [2, 2],
    minzoom: 10,
    labelMinzoom: 12,
    labelMaxzoom: 24,
    labelSize: [[12, 11], [15, 13]],
    labelColor: "#595959",
  }),
});

// เส้นขอบเขต: layer "boundary" ของ OpenFreeMap (OpenMapTiles schema)
export const OPENFREEMAP_TILEJSON = "https://tiles.openfreemap.org/planet";
export const OPENFREEMAP_ADMIN_LEVELS = Object.freeze({ Province: 4, Amphoe: 6, Tambon: 8 });

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
