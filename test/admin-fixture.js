// ข้อมูลจำลองแบบ service ของ GISTDA: สี่ตำบลเรียงกันตามแนวนอน (ละติจูด 13.0–13.1)
//
//   ลองจิจูด  100.00   100.05   100.10   100.15   100.20
//             | ต.หนึ่ง | ต.สอง  | ต.สาม  | ต.สี่   |
//   อำเภอ     | อ.ก (10/01)      | อ.ข    | อ.ค (20/01)
//   จังหวัด   | จ.ทดสอบ (10)              | จ.ตัวอย่าง (20)
//
// ขอบร่วม: 100.05 = ตำบล (8), 100.10 = อำเภอ (6), 100.15 = จังหวัด (4)
// ขอบ 100.05 มีจุดกลางที่ 13.05 (ทั้งสองตำบล) เพื่อทดสอบการต่อเส้น

const box = (x0, x1, mid = false) => {
  const left = mid && x0 === 100.05 ? [[x0, 13.1], [x0, 13.05], [x0, 13.0]] : [[x0, 13.1], [x0, 13.0]];
  const right = mid && x1 === 100.05 ? [[x1, 13.0], [x1, 13.05], [x1, 13.1]] : [[x1, 13.0], [x1, 13.1]];
  return { type: "Polygon", coordinates: [[...left, ...right, left[0]]] };
};

const feature = (properties, geometry) => ({ type: "Feature", properties, geometry });

export const tambons = {
  type: "FeatureCollection",
  features: [
    feature({ P_code: "10", A_code: "01", T_Name_T: "ตำบลหนึ่ง", Shape_Area: 30e6 }, box(100.0, 100.05, true)),
    feature({ P_code: "10", A_code: "01", T_Name_T: "แขวงสอง", Shape_Area: 30e6 }, box(100.05, 100.1, true)),
    feature({ P_code: "10", A_code: "02", T_Name_T: "ตำบลสาม", Shape_Area: 30e6 }, box(100.1, 100.15)),
    feature({ P_code: "20", A_code: "01", T_Name_T: "ตำบลสี่", Shape_Area: 30e6 }, box(100.15, 100.2)),
  ],
};

export const amphoes = {
  type: "FeatureCollection",
  features: [
    feature({ A_Name_T: "อำเภอก", Shape_Area: 60e6 }, box(100.0, 100.1)),
    feature({ A_Name_T: "เขตข", Shape_Area: 30e6 }, box(100.1, 100.15)),
    feature({ A_Name_T: "อำเภค", Shape_Area: 30e6 }, box(100.15, 100.2)), // สะกดผิดแบบเดียวกับข้อมูลจริง
  ],
};

export const provinces = {
  type: "FeatureCollection",
  features: [
    feature({ P_code: "10", P_Name_T: "จังหวัดทดสอบ", SHAPE_Area: 90e6 }, box(100.0, 100.15)),
    feature({ P_code: "20", P_Name_T: "จังหวัดตัวอย่าง", SHAPE_Area: 30e6 }, box(100.15, 100.2)),
  ],
};

export const adminData = { provinces, amphoes, tambons };

// tile ที่ครอบพื้นที่ทั้งหมด
export const mercX = (lng) => (lng + 180) / 360;
export const mercY = (lat) => {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
};
export const tileOf = (lng, lat, z) => [z, Math.floor(mercX(lng) * 2 ** z), Math.floor(mercY(lat) * 2 ** z)];
