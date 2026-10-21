// static server เล็กๆ สำหรับเปิดหน้าตัวอย่าง (ES module ต้องเปิดผ่าน http ไม่ใช่ file://)
//   node scripts/serve.mjs [port]   แล้วเปิด http://localhost:3300/examples/
//
// /boundary-tiles (เส้นและป้ายจาก OpenFreeMap ตัดเฉพาะในไทย) มาจาก tileMiddleware ของ src/server.js
// โปรเจกต์จริงใช้ middleware ตัวเดียวกันใน Vite / Express (ดู README)

import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tileMiddleware } from "../src/server.js";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const port = Number(process.argv[2] ?? process.env.PORT ?? 3300);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const tiles = tileMiddleware();

function serveStatic(req, res) {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (statSync(file).isDirectory()) file = join(file, "index.html");
    const { size } = statSync(file);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      "Content-Length": size,
      "Cache-Control": "no-cache",
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("not found");
  }
}

createServer((req, res) => tiles(req, res, () => serveStatic(req, res))).listen(port, () => {
  console.log(`http://localhost:${port}/examples/`);
});
