"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = Number(process.argv[2]) || 8080;
const WWW = path.join(__dirname, "www");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

let checkins = [];

function localIps() {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const it of list || []) {
      if (it.family === "IPv4" && !it.internal) ips.push(it.address);
    }
  }
  return ips;
}

function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function addCheckin(id, name) {
  const exist = checkins.find((r) => (id && r.id === id) || r.name === name);
  if (exist) {
    exist.time = now() + "（重签）";
  } else {
    checkins.push({ id, name, time: now() });
  }
}

function esc(s) {
  return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function listJson() {
  return JSON.stringify({ total: checkins.length, students: checkins });
}

function readFile(rel) {
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const file = path.join(WWW, safe);
  if (!file.startsWith(WWW)) return null;
  try {
    return fs.readFileSync(file);
  } catch (e) {
    return null;
  }
}

function respond(res, code, contentType, body) {
  res.writeHead(code, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Connection": "close",
  });
  res.end(body);
}

function readBody(req, callback) {
  const chunks = [];
  let size = 0;
  req.on("data", (c) => {
    size += c.length;
    if (size > 10000) { req.destroy(); return; }
    chunks.push(c);
  });
  req.on("end", () => callback(Buffer.concat(chunks).toString("utf8")));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  const method = req.method || "GET";

  if (method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    res.end();
    return;
  }

  if (method === "POST" && p === "/api/checkin") {
    readBody(req, (body) => {
      let data = {};
      try { data = JSON.parse(body || "{}"); } catch (e) { }
      const name = String(data.name || "").trim().slice(0, 50);
      const id = String(data.id || "").trim().slice(0, 20);
      if (!name) {
        respond(res, 400, "application/json", JSON.stringify({ ok: false, msg: "name required" }));
        return;
      }
      addCheckin(id, name);
      console.log(`[checkin] ${id || "-"} ${name}`);
      respond(res, 200, "application/json", JSON.stringify({ ok: true }));
    });
    return;
  }

  if (method === "GET" && p === "/api/list") {
    respond(res, 200, "application/json", listJson());
    return;
  }

  if (method === "GET" && p === "/api/clear") {
    checkins = [];
    respond(res, 200, "application/json", JSON.stringify({ ok: true }));
    return;
  }

  if (method === "GET" && p === "/api/info") {
    respond(res, 200, "application/json", JSON.stringify({ ips: localIps(), port: PORT }));
    return;
  }

  let rel = p === "/" ? "student.html" : p.slice(1);
  if (!rel.includes(".")) rel = rel + ".html";
  const buf = readFile(rel);
  if (!buf) {
    respond(res, 404, "text/html; charset=utf-8", "<h1>404</h1>");
    return;
  }
  respond(res, 200, MIME[path.extname(rel).toLowerCase()] || "application/octet-stream", buf);
});

server.on("error", (e) => {
  console.error(`[error] ${e.message}`);
  if (e.code === "EADDRINUSE") {
    console.error(`[error] Port ${PORT} is in use. Try: node server.js ${PORT + 1}`);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  const ips = localIps();
  console.log("==============================================");
  console.log("  Course Schedule Check-in Server (Node.js)");
  console.log(`  Local:      http://localhost:${PORT}`);
  ips.forEach((ip) => console.log(`  Network:    http://${ip}:${PORT}`));
  console.log(`  Projector:  http://localhost:${PORT}/projector`);
  console.log(`  Monitor:    http://localhost:${PORT}/monitor`);
  console.log("  Press Ctrl+C to stop");
  console.log("==============================================");
});
