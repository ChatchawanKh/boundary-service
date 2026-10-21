// ของที่ test หลายไฟล์ใช้ร่วมกัน

import { boundaryDataset } from "../src/sources.js";

/** dataset ที่ชี้ไปที่ server สมมติ (ตัวเชื่อมไม่โหลด tile เองจึงไม่ออกเน็ต) */
export function testDataset(options = {}) {
  return boundaryDataset({ tiles: "https://example.com/boundary-tiles", ...options });
}
