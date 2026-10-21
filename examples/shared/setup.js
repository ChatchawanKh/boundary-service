// ค่าที่หน้าตัวอย่างทุกหน้าใช้ร่วมกัน

import { boundaryDataset } from "../../src/index.js";

// เส้นและป้ายจากข้อมูล GISTDA (กรมการปกครอง) ผ่าน tileMiddleware ใน scripts/serve.mjs
export const dataset = boundaryDataset({ tiles: "/boundary-tiles" });

export const BASEMAPS = {
  liberty: "https://tiles.openfreemap.org/styles/liberty",
  positron: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

// แผนที่ฐานในหน้าตัวอย่างเป็นของ OpenFreeMap ซึ่งมีเส้นเขตปกครองของ OSM อยู่แล้ว ซ่อนไว้ไม่ให้ซ้อนกับชั้นของเรา
export const BASEMAP_BOUNDARY_LAYERS = ["boundary_3", "boundary_state"];

export const THAILAND_VIEW = { center: [100.9, 13.0], zoom: 5 };
