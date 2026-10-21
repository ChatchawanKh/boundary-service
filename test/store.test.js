import assert from "node:assert/strict";
import { test } from "node:test";
import { createBoundaryStore } from "../src/store.js";

test("ค่าเริ่มต้น: ทุกระดับเปิด opacity 100 มุมมอง 2d", () => {
  const s = createBoundaryStore().getState();
  for (const level of ["Province", "Amphoe", "Tambon"]) {
    assert.deepEqual(s.levels[level], { visible: true, opacity: 100, labels: true });
  }
  assert.equal(s.view, "2d");
});

test("action เปลี่ยนเฉพาะส่วนที่เกี่ยว ส่วนอื่นคง reference เดิม", () => {
  const store = createBoundaryStore();
  const before = store.getState();
  store.setLevelVisible("Tambon", false);
  const after = store.getState();
  assert.notEqual(after, before);
  assert.equal(after.levels.Tambon.visible, false);
  assert.equal(after.levels.Province, before.levels.Province);
  assert.equal(after.styles, before.styles);
});

test("ค่าเดิมซ้ำไม่แจ้ง listener", () => {
  const store = createBoundaryStore();
  let calls = 0;
  store.subscribe(() => calls++);
  store.setLevelVisible("Province", true);
  store.setView("2d");
  store.setLevelOpacity("Amphoe", 100);
  assert.equal(calls, 0);
  store.toggleLevel("Province");
  assert.equal(calls, 1);
});

test("opacity ถูกบีบให้อยู่ใน 0-100", () => {
  const store = createBoundaryStore();
  store.setLevelOpacity("Amphoe", 150);
  assert.equal(store.getState().levels.Amphoe.opacity, 100);
  store.setLevelOpacity("Amphoe", -5);
  assert.equal(store.getState().levels.Amphoe.opacity, 0);
});

test("ระดับหรือมุมมองที่ไม่รู้จักโยน error", () => {
  const store = createBoundaryStore();
  assert.throws(() => store.setLevelVisible("Village", true), /ไม่รู้จักระดับ/);
  assert.throws(() => store.setView("4d"), /view ต้องเป็น/);
});

test("persist จำการเปิด/ปิดชั้นและมุมมอง ไม่จำ styles", () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const a = createBoundaryStore({ persist: { key: "ab", storage } });
  a.setLevelVisible("Amphoe", false);
  a.setView("2.5d");
  a.setLevelStyle("Province", { color: "#000000" });

  const b = createBoundaryStore({ persist: { key: "ab", storage } });
  assert.equal(b.getState().levels.Amphoe.visible, false);
  assert.equal(b.getState().view, "2.5d");
  assert.equal(b.getState().styles.Province.color, "#1a1a1a");
});

test("persist ที่ storage พังไม่ทำให้ store พัง", () => {
  const storage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  const store = createBoundaryStore({ persist: { key: "x", storage } });
  store.toggleLevel("Province");
  assert.equal(store.getState().levels.Province.visible, false);
});
