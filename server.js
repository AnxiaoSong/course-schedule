"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = Number(process.argv[2]) || 8080;
const PUBLIC_URL = process.env.PUBLIC_URL || "";
const WWW = path.join(__dirname, "www");
const ROSTER_DIR = path.join(__dirname, "名单");

let rosterMap = {};
let rosterStamp = "";

function loadRoster(force) {
  let files = [];
  try {
    files = fs.readdirSync(ROSTER_DIR)
      .filter((f) => /\.(xlsx?|csv)$/i.test(f))
      .map((f) => path.join(ROSTER_DIR, f));
  } catch (e) { return; }
  const stamp = files.map((f) => {
    try { return f + ":" + fs.statSync(f).mtimeMs; } catch (e) { return ""; }
  }).join("|");
  if (!force && stamp === rosterStamp) return;
  rosterStamp = stamp;
  const map = {};
  try {
    const XLSX = require("xlsx");
    for (const f of files) {
      const wb = XLSX.readFile(f);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      let h = -1, cId = -1, cName = -1, cCls = -1;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].map(String);
        if (r.includes("学号") && r.includes("姓名")) {
          h = i; cId = r.indexOf("学号"); cName = r.indexOf("姓名"); cCls = r.indexOf("班级");
          break;
        }
      }
      if (h < 0) continue;
      for (let i = h + 1; i < rows.length; i++) {
        const id = String(rows[i][cId] || "").trim();
        const name = String(rows[i][cName] || "").trim();
        if (!name || !/^\d+$/.test(id)) continue;
        map[id] = {
          name,
          cls: cCls >= 0 ? String(rows[i][cCls] || "").trim().replace(/海南|校区/g, "").replace(/(\d)$/, "$1班") : "",
        };
      }
    }
    rosterMap = map;
    console.log(`[roster] loaded ${Object.keys(rosterMap).length} students from ${files.length} files`);
  } catch (e) {
    console.error("[roster] load failed:", e.message);
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

let checkins = [];
let hotspot = { ssid: "", pwd: "" };
const HOTSPOT_FILE = path.join(__dirname, "hotspot.json");

loadRoster(true);

try {
  hotspot = JSON.parse(fs.readFileSync(HOTSPOT_FILE, "utf8")) || hotspot;
} catch (e) { }

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

function addCheckin(id, name, cls) {
  const exist = checkins.find((r) => (id && r.id === id) || r.name === name);
  if (exist) {
    exist.time = now() + "（重签）";
  } else {
    checkins.push({ id, name, cls: cls || "", time: now() });
  }
}

function esc(s) {
  return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function listJson() {
  const copy = checkins.slice();
  let sb = "{\"total\":" + copy.length + ",\"students\":[";
  for (let i = 0; i < copy.length; i++) {
    const r = copy[i];
    if (i > 0) sb += ",";
    sb += "{\"id\":\"" + esc(r.id) + "\",\"name\":\"" + esc(r.name) +
      "\",\"cls\":\"" + esc(r.cls || "") + "\",\"time\":\"" + esc(r.time) + "\"}";
  }
  return sb + "]}";
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
      loadRoster();
      let data = {};
      try { data = JSON.parse(body || "{}"); } catch (e) { }
      const id = String(data.id || "").trim().slice(0, 20);
      const manualName = String(data.name || "").trim().slice(0, 50);
      if (!id && !manualName) {
        respond(res, 400, "application/json", JSON.stringify({ ok: false, msg: "empty" }));
        return;
      }
      let name = manualName;
      let cls = "";
      if (id) {
        const rec = rosterMap[id];
        if (!rec) {
          respond(res, 400, "application/json", JSON.stringify({ ok: false, msg: "学号不在名单中，请核对后重试" }));
          return;
        }
        name = rec.name;
        cls = rec.cls;
      }
      addCheckin(id, name, cls);
      console.log(`[checkin] ${id || "-"} ${name}`);
      respond(res, 200, "application/json", JSON.stringify({ ok: true, name, cls }));
    });
    return;
  }

  if (method === "GET" && p === "/api/list") {
    respond(res, 200, "application/json", listJson());
    return;
  }

  if (method === "GET" && p === "/api/roster") {
    loadRoster();
    const students = Object.keys(rosterMap).map((id) => ({
      id,
      name: rosterMap[id].name,
      cls: rosterMap[id].cls,
    }));
    respond(res, 200, "application/json", JSON.stringify({ total: students.length, students }));
    return;
  }

  if (method === "GET" && p === "/api/clear") {
    checkins = [];
    respond(res, 200, "application/json", JSON.stringify({ ok: true }));
    return;
  }

  if (method === "GET" && p === "/api/info") {
    respond(res, 200, "application/json", JSON.stringify({
      ips: localIps(),
      port: PORT,
      publicUrl: PUBLIC_URL,
    }));
    return;
  }

  if (method === "GET" && p === "/api/hotspot") {
    respond(res, 200, "application/json", JSON.stringify(hotspot));
    return;
  }

  if (method === "POST" && p === "/api/hotspot") {
    readBody(req, (body) => {
      let data = {};
      try { data = JSON.parse(body || "{}"); } catch (e) { }
      hotspot = {
        ssid: String(data.ssid || "").trim().slice(0, 40),
        pwd: String(data.pwd || "").trim().slice(0, 40),
      };
      fs.writeFile(HOTSPOT_FILE, JSON.stringify(hotspot), () => { });
      respond(res, 200, "application/json", JSON.stringify({ ok: true, hotspot }));
    });
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
