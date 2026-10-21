import assert from "node:assert/strict";
import { test } from "node:test";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { decodeGlyphs } from "../scripts/build-glyphs.mjs";
import { createBoundaryTiles, createGlyphs, tileMiddleware } from "../src/server.js";
import { adminData, tileOf } from "./admin-fixture.js";

const read = (buf) => new VectorTile(new Pbf(buf)).layers;
const quiet = async (fn) => {
  const log = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = log;
  }
};

test("createBoundaryTiles: โหลดครั้งเดียว ได้ทั้งเส้นและป้าย tile เดิมใช้ cache", async () => {
  let loads = 0;
  const tiles = createBoundaryTiles({
    load: async () => {
      loads++;
      return adminData;
    },
    minzoom: { Province: 0, Amphoe: 0, Tambon: 0 },
  });
  const [z, x, y] = tileOf(100.1, 13.05, 8);
  const layers = read(await tiles(z, x, y));
  assert.deepEqual(Object.keys(layers), ["boundary", "label"]);
  assert.equal(layers.label.length, 9);
  await tiles(z, x, y);
  await tiles(z, x + 1, y);
  assert.equal(loads, 1);
  assert.equal((await tiles.ready()).tambons, 4);
  assert.equal(await tiles(z, x + 2, y), null, "tile ที่ไม่มีข้อมูล");
});

test("createBoundaryTiles: โหลดไม่สำเร็จ → error และไม่ลองใหม่ทันที (กันยิง service รัว)", async () => {
  let loads = 0;
  const tiles = createBoundaryTiles({
    load: async () => {
      loads++;
      throw new Error("service ล่ม");
    },
  });
  await assert.rejects(tiles(8, 199, 116), /service ล่ม/);
  await assert.rejects(tiles(8, 199, 116), /ลองใหม่/);
  assert.equal(loads, 1);
});

function fakeRes() {
  return {
    status: 0,
    headers: {},
    body: undefined,
    writeHead(status, headers = {}) {
      this.status = status;
      this.headers = headers;
      return this;
    },
    end(body) {
      this.body = body;
    },
  };
}

test("middleware: /boundary-tiles ได้ tile, path อื่นส่งต่อ next()", async () => {
  const handle = tileMiddleware({ boundary: { load: async () => adminData }, preload: false });
  const [z, x, y] = tileOf(100.1, 13.05, 8);
  const res = fakeRes();
  await handle({ url: `/boundary-tiles/${z}/${x}/${y}` }, res);
  assert.equal(res.status, 200);
  assert.equal(res.headers["Content-Type"], "application/x-protobuf");
  assert.deepEqual(Object.keys(read(new Uint8Array(res.body))), ["boundary", "label"]);

  const empty = fakeRes();
  await handle({ url: `/boundary-tiles/${z}/${x + 2}/${y}` }, empty);
  assert.equal(empty.status, 204);

  let nexted = false;
  await handle({ url: "/examples/" }, fakeRes(), () => (nexted = true));
  assert.ok(nexted);
});

test("middleware: tile ให้เบราว์เซอร์ถามทุกครั้ง ETag เดิมได้ 304 สร้างเส้นใหม่ (รีสตาร์ต) ETag เปลี่ยน", async () => {
  const handle = tileMiddleware({ boundary: { load: async () => adminData }, preload: false });
  const url = `/boundary-tiles/${tileOf(100.1, 13.05, 8).join("/")}`;
  const first = fakeRes();
  await handle({ url, headers: {} }, first);
  assert.equal(first.headers["Cache-Control"], "no-cache");
  assert.ok(first.headers.ETag);

  const again = fakeRes();
  await handle({ url, headers: { "if-none-match": first.headers.ETag } }, again);
  assert.equal(again.status, 304);
  assert.equal(again.body, undefined);

  await new Promise((r) => setTimeout(r, 5));
  const restarted = fakeRes();
  await tileMiddleware({ boundary: { load: async () => adminData }, preload: false })({ url, headers: { "if-none-match": first.headers.ETag } }, restarted);
  assert.equal(restarted.status, 200);
  assert.notEqual(restarted.headers.ETag, first.headers.ETag);
});

test("middleware: โหลดข้อมูล GISTDA ไม่สำเร็จได้ 502", async () => {
  const handle = tileMiddleware({
    boundary: {
      load: async () => {
        throw new Error("ล่ม");
      },
    },
    preload: false,
  });
  const res = fakeRes();
  await quiet(() => handle({ url: "/boundary-tiles/8/199/116" }, res));
  assert.equal(res.status, 502);
});

test("glyph: Kanit มากับ package มีอักษรไทยครบ ช่วงที่ไม่มีได้ protobuf ว่าง", async () => {
  const glyphs = createGlyphs({ fetch: () => assert.fail("ไม่ควรออกเน็ต") });
  const thai = decodeGlyphs(await glyphs("Kanit Regular", 3584));
  const ids = new Set(thai.map((g) => g.id));
  for (const ch of "กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮะาำิีึืุู่้๊๋") assert.ok(ids.has(ch.codePointAt(0)), ch);
  const ko = thai.find((g) => g.id === 0x0e01);
  assert.ok(ko.width > 0 && ko.advance > 0 && ko.bitmap.length === (ko.width + 6) * (ko.height + 6));
  // วรรณยุกต์ไม่กินที่ (วางทับตัวหน้า)
  assert.equal(thai.find((g) => g.id === 0x0e48).advance, 0);
  assert.equal((await glyphs("Kanit Regular", 4096)).length, 0);
});

test("glyph: fontstack อื่นส่งต่อ upstream และเก็บ cache", async () => {
  const calls = [];
  const glyphs = createGlyphs({
    upstream: "https://fonts.example/{fontstack}/{range}.pbf",
    fetch: async (url) => {
      calls.push(url);
      return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([7]).buffer };
    },
  });
  assert.deepEqual([...(await glyphs("Noto Sans Regular", 0))], [7]);
  await glyphs("Noto Sans Regular", 0);
  assert.deepEqual(calls, ["https://fonts.example/Noto%20Sans%20Regular/0-255.pbf"]);
});

test("middleware: /boundary-fonts ตอบ glyph และกันช่วง/ชื่อที่ไม่ถูกต้อง", async () => {
  const handle = tileMiddleware({ fetch: async () => ({ ok: false, status: 404 }), preload: false });
  const ok = fakeRes();
  await handle({ url: "/boundary-fonts/Kanit%20Regular/3584-3839.pbf" }, ok);
  assert.equal(ok.status, 200);
  assert.ok(decodeGlyphs(new Uint8Array(ok.body)).length > 80);

  const badRange = fakeRes();
  await handle({ url: "/boundary-fonts/Kanit%20Regular/3584-3900.pbf" }, badRange);
  assert.equal(badRange.status, 404);

  // ชื่อที่ไม่ได้มากับ package ไม่อ่านไฟล์ในเครื่อง ส่งต่อ upstream แทน (ที่นี่ upstream ตอบ 404 → 502)
  const traversal = fakeRes();
  const log = console.error;
  console.error = () => {};
  try {
    await handle({ url: "/boundary-fonts/..%2F..%2Fpackage.json/0-255.pbf" }, traversal);
  } finally {
    console.error = log;
  }
  assert.equal(traversal.status, 502);
});
