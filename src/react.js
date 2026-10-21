// React bindings ของ store กลาง (ไม่ใช้ JSX จึง import ได้ทั้งโปรเจกต์ที่มีและไม่มีขั้น build)

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { bindLeaflet } from "./leaflet.js";
import { bindMapLibre } from "./maplibre.js";

const BoundaryContext = createContext(null);

/** ส่ง store ให้ทุก component ข้างใต้ */
export function BoundaryProvider({ store, children }) {
  return createElement(BoundaryContext.Provider, { value: store }, children);
}

/** store จาก argument หรือจาก <BoundaryProvider> ที่ใกล้ที่สุด */
export function useBoundaryStore(store) {
  const fromContext = useContext(BoundaryContext);
  const resolved = store ?? fromContext;
  if (!resolved) {
    throw new Error("admin-boundary: ไม่พบ store (ใส่ <BoundaryProvider store={...}> หรือส่ง store เข้า hook)");
  }
  return resolved;
}

const identity = (s) => s;

/**
 * อ่าน state บางส่วนแล้ว render ใหม่เมื่อส่วนนั้นเปลี่ยน
 * selector ต้องคืนค่าที่เทียบด้วย === ได้ (ค่า primitive หรือ object ที่อยู่ใน state อยู่แล้ว)
 * ห้ามสร้าง object/array ใหม่ใน selector เช่น s => ({ a: s.a }) เพราะจะ render วนไม่จบ
 *
 * @example
 *   const visible = useBoundary((s) => s.levels.Province.visible);
 *   const view = useBoundary((s) => s.view);
 */
export function useBoundary(selector = identity, store) {
  const s = useBoundaryStore(store);
  const get = () => selector(s.getState());
  return useSyncExternalStore(s.subscribe, get, get);
}

function useBinding(bind, target, options, store) {
  const s = useBoundaryStore(store);
  const [binding, setBinding] = useState(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!target) return undefined;
    const b = bind(target, s, optionsRef.current);
    setBinding(b);
    return () => {
      b.destroy();
      setBinding(null);
    };
  }, [bind, target, s]);

  return binding;
}

/**
 * ผูก store กับ MapLibre map (ส่ง null ได้ระหว่างที่ map ยังไม่ถูกสร้าง)
 * options อ่านครั้งเดียวตอนผูก ถ้าจะเปลี่ยน dataset ให้เปลี่ยน key ของ component
 * @returns binding ({ ready, attribution, destroy }) หรือ null
 */
export function useMapLibreBoundary(map, options, store) {
  return useBinding(bindMapLibre, map, options, store);
}

/** ผูก store กับ Leaflet map ผ่าน @maplibre/maplibre-gl-leaflet */
export function useLeafletBoundary(leafletMap, options, store) {
  return useBinding(bindLeaflet, leafletMap, options, store);
}
