"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawn, exec } = require("child_process");

const PORT = Number(process.argv[2]) || 8080;
const PUBLIC_URL = process.env.PUBLIC_URL || "";
const WWW = path.join(__dirname, "www");
const ROSTER_DIR = path.join(__dirname, "名单");
const SECRET_FILE = path.join(__dirname, "secret.json");

// ---------- 教师私有 token（本地 secret.json，不入库）----------
let TOKEN = "";
try {
  TOKEN = String(JSON.parse(fs.readFileSync(SECRET_FILE, "utf8")).token || "");
} catch (e) { }
if (!TOKEN) {
  TOKEN = crypto.randomBytes(24).toString("hex");
  fs.writeFileSync(SECRET_FILE, JSON.stringify({ token: TOKEN, createdAt: new Date().toISOString() }, null, 2));
  console.log("[auth] generated secret.json (teacher token)");
}

// 教师机公网出口 IP（自动学习，定时刷新）：本机浏览器经域名访问教师页也免输入
let TEACHER_IP = "";
function refreshTeacherIp() {
  const sources = [
    "https://api.ip.sb/ip",
    "http://members.3322.org/dyndns/getip",
    "https://api.ipify.org",
  ];
  let done = false;
  sources.forEach((u) => {
    if (done) return;
    try {
      const mod = u.startsWith("https") ? require("https") : require("http");
      const req2 = mod.get(u, { timeout: 4000 }, (r) => {
        let buf = "";
        r.on("data", (c) => buf += c);
        r.on("end", () => {
          const ip = String(buf).trim();
          if (!done && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
            done = true;
            if (ip !== TEACHER_IP) {
              TEACHER_IP = ip;
              console.log(`[auth] teacher public IP: ${ip}`);
            }
          }
        });
      });
      req2.on("error", () => { });
      req2.on("timeout", () => req2.destroy());
    } catch (e) { }
  });
}
refreshTeacherIp();
setInterval(refreshTeacherIp, 30 * 60 * 1000);

// 客户端真实 IP：经反代时取 X-Forwarded-For 最后一段（Caddy 追加的真实来源，防伪造）
function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",").pop().trim();
  return (req.socket.remoteAddress || "").replace("::ffff:", "");
}

function isTeacherMachine(req) {
  const ip = clientIp(req);
  if (!req.headers["x-forwarded-for"] && (ip === "127.0.0.1" || ip === "::1")) return true;
  return !!TEACHER_IP && ip === TEACHER_IP;
}

function hasToken(req) {
  const h = req.headers["x-token"] || "";
  if (h && h === TOKEN) return true;
  const cookie = String(req.headers.cookie || "");
  const m = cookie.match(/(?:^|;\s*)ttok=([^;]+)/);
  return !!(m && m[1] === TOKEN);
}

function authPage() {
  return "<!DOCTYPE html><html lang='zh-CN'><head><meta charset='utf-8'>" +
    "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
    "<title>教师验证</title><style>" +
    "body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;background:#f2f4f8;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}" +
    ".c{background:#fff;border-radius:18px;padding:30px 26px;width:90%;max-width:360px;text-align:center;box-shadow:0 10px 30px rgba(28,39,71,.1)}" +
    ".i{font-size:44px}h2{margin:10px 0 6px;font-size:19px}p{color:#8a93a3;font-size:13px;margin:0 0 18px}" +
    "input{width:100%;border:1.5px solid #e6e9ef;border-radius:12px;padding:13px;font-size:15px;text-align:center;outline:none;font-family:monospace}" +
    "input:focus{border-color:#3b5bdb}button{width:100%;margin-top:14px;border:0;border-radius:12px;padding:13px;background:linear-gradient(135deg,#3b5bdb,#7c5cfa);color:#fff;font-size:16px;font-weight:700;cursor:pointer}" +
    ".msg{margin-top:12px;font-size:13px;min-height:18px;color:#e5484d}</style></head><body><div class='c'>" +
    "<div class='i'>🔒</div><h2>教师专用页面</h2><p>学生请扫描教室屏幕上的签到二维码</p>" +
    "<input id='t' placeholder='输入教师 token（secret.json）' autocomplete='off'>" +
    "<button onclick='go()'>验证进入</button><div class='msg' id='m'></div>" +
    "<script>function go(){var t=document.getElementById('t').value.trim();" +
    "fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t})})" +
    ".then(function(r){return r.json()}).then(function(j){if(j.ok){location.reload()}else{document.getElementById('m').textContent='token 不正确'}})}" +
    "(function(){fetch('/api/auth',{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){if(j&&j.ok){location.reload()}}).catch(function(e){})})()" +
    "</script></div></body></html>";
}

let rosterMap = {};
let rosterStamp = "";

function classLabelOf(classCount, fileName) {
  const entries = Object.keys(classCount)
    .filter((k) => k && !/^[-\s]*$/.test(k))
    .map((raw) => ({
      name: String(raw).replace(/海南|校区/g, "").replace(/\s+/g, "").replace(/班+$/, ""),
      count: classCount[raw],
    }))
    .filter((e) => e.name);
  if (!entries.length) return "";
  const total = entries.reduce((s, e) => s + e.count, 0);
  const dominant = entries.slice().sort((a, b) => b.count - a.count)[0];
  if (dominant.count / total >= 0.85) return dominant.name + "班";
  const names = [...new Set(entries.map((e) => e.name))]
    .sort((a, b) => a.localeCompare(b, "zh", { numeric: true }));
  let prefix = names[0];
  names.forEach((n) => { while (prefix && !n.startsWith(prefix)) prefix = prefix.slice(0, -1); });
  prefix = prefix.replace(/\d+$/, "");
  const m = String(fileName || "").match(/(\d{1,2})\s*班/);
  if (prefix && m) return prefix + m[1].replace(/^0+(?=\d)/, "") + "班";
  const suffixes = names.map((n) => n.slice(prefix.length));
  if (prefix && suffixes.every((s) => /^[\dA-Za-z]+$/.test(s))) return prefix + suffixes.join("/") + "班";
  return names.join("+") + "班";
}

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
      const classCount = {};
      const fileStudents = [];
      for (let i = h + 1; i < rows.length; i++) {
        const id = String(rows[i][cId] || "").trim();
        const name = String(rows[i][cName] || "").trim();
        if (!name || !/^\d+$/.test(id)) continue;
        const rawCls = cCls >= 0 ? String(rows[i][cCls] || "").trim() : "";
        if (rawCls) classCount[rawCls] = (classCount[rawCls] || 0) + 1;
        fileStudents.push({ id, name });
      }
      const cls = classLabelOf(classCount, path.basename(f));
      for (const s of fileStudents) {
        map[s.id] = { name: s.name, cls };
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
let classroom = null; // {lat, lng, radius}
const CLASSROOM_FILE = path.join(__dirname, "classroom.json");
try {
  classroom = JSON.parse(fs.readFileSync(CLASSROOM_FILE, "utf8")) || null;
} catch (e) { }

function saveClassroom() {
  if (classroom) fs.writeFile(CLASSROOM_FILE, JSON.stringify(classroom), () => { });
  else fs.unlink(CLASSROOM_FILE, () => { });
}

// Haversine 距离（米）
function distMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = (d) => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
let session = null; // { endAt, timer }
let lastCsvFile = "";
const CSV_DIR = path.join(__dirname, "签到记录");

function pad2(n) { return String(n).padStart(2, "0"); }

function writeCsv() {
  if (!checkins.length) return [];
  fs.mkdirSync(CSV_DIR, { recursive: true });
  // 按班级分组（班级由学号从名单自动匹配），组内按学号排序
  const groups = {};
  checkins.forEach((c) => {
    const cls = c.cls || "未分类";
    (groups[cls] = groups[cls] || []).push(c);
  });
  const d = new Date();
  const stamp = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  const files = [];
  Object.keys(groups).sort().forEach((cls) => {
    const list = groups[cls].slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const fname = `签到_${cls}_${stamp}.csv`;
    let csv = "\uFEFF序号,学号,姓名,班级,签到时间\n";
    list.forEach((c, i) => {
      csv += `${i + 1},${c.id},${c.name},${c.cls},${c.time}\n`;
    });
    fs.writeFileSync(path.join(CSV_DIR, fname), csv, "utf8");
    files.push(fname);
    console.log(`[csv] saved ${fname} (${list.length} students)`);
  });
  return files;
}

function startSession(minutes) {
  endSession(false);
  session = {
    endAt: Date.now() + minutes * 60000,
    timer: setTimeout(() => endSession(true), minutes * 60000),
  };
  console.log(`[session] started, ${minutes} min`);
}

function endSession(save) {
  if (!session) return null;
  clearTimeout(session.timer);
  session = null;
  let saved = [];
  if (save) {
    saved = writeCsv();
    lastCsvFile = saved.join("、");
  }
  console.log(`[session] ended${saved.length ? " -> " + saved.join(", ") : ""}`);
  return saved;
}
let hotspot = { ssid: "", pwd: "" };
const HOTSPOT_FILE = path.join(__dirname, "hotspot.json");
const BINDINGS_FILE = path.join(__dirname, "bindings.json");

let bindings = { byId: {}, byDevice: {} };
try {
  bindings = JSON.parse(fs.readFileSync(BINDINGS_FILE, "utf8")) || bindings;
} catch (e) { }

function saveBindings() {
  fs.writeFile(BINDINGS_FILE, JSON.stringify(bindings), () => { });
}

function unbindStale(id, device) {
  if (id && bindings.byId[id]) delete bindings.byDevice[bindings.byId[id]];
  if (id) delete bindings.byId[id];
  if (device && bindings.byDevice[device]) delete bindings.byId[bindings.byDevice[device]];
  if (device) delete bindings.byDevice[device];
  saveBindings();
}

loadRoster(true);

// ---------- frpc 子进程托管：node 退出（含关闭窗口）时一并停止 ----------
let frpcProc = null;
const FRPC_EXE = path.join(__dirname, "frp", "frpc.exe");
const FRPC_CFG = path.join(__dirname, "frp", "frpc.toml");
if (fs.existsSync(FRPC_EXE) && fs.existsSync(FRPC_CFG) && process.env.DISABLE_FRPC !== "1") {
  try {
    frpcProc = spawn(FRPC_EXE, ["-c", FRPC_CFG], { stdio: "inherit" });
    console.log(`[frpc] tunnel started, pid=${frpcProc.pid} (will stop with this window)`);
    frpcProc.on("exit", (code) => console.log(`[frpc] exited (${code})`));
  } catch (e) {
    console.error("[frpc] start failed:", e.message);
  }
}

function killFrpc() {
  if (!frpcProc || frpcProc.exitCode !== null) return;
  try { exec(`taskkill /PID ${frpcProc.pid} /T /F`); } catch (e) { }
}

process.on("exit", killFrpc);
["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"].forEach((sig) => {
  process.on(sig, () => { killFrpc(); process.exit(0); });
});

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

function addCheckin(id, name, cls, dist) {
  const exist = checkins.find((r) => (id && r.id === id) || r.name === name);
  if (exist) {
    exist.time = now() + "（重签）";
    exist.dist = dist;
  } else {
    checkins.push({ id, name, cls: cls || "", time: now(), dist });
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
      "\",\"cls\":\"" + esc(r.cls || "") + "\",\"dist\":" + (typeof r.dist === "number" ? r.dist : -1) +
      ",\"time\":\"" + esc(r.time) + "\"}";
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
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Token",
    });
    res.end();
    return;
  }

  // ---------- 访问守卫 ----------
  // 学生可访问：签到页、静态库、签到提交、授权接口
  const isPublic =
    p === "/student" || p === "/student.html" ||
    p.startsWith("/lib/") ||
    p === "/api/checkin" ||
    p === "/api/auth" ||
    p === "/favicon.ico";

  if (p === "/api/auth") {
    if (method === "POST") {
      readBody(req, (body) => {
        let data = {};
        try { data = JSON.parse(body || "{}"); } catch (e) { }
        const input = String(data.token || "").trim();
        if (input && input === TOKEN) {
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Set-Cookie": `ttok=${TOKEN}; Path=/; Max-Age=2592000; SameSite=Lax`,
            "Connection": "close",
          });
          res.end(JSON.stringify({ ok: true }));
        } else {
          respond(res, 403, "application/json", JSON.stringify({ ok: false, msg: "token 不正确" }));
        }
      });
      return;
    }
    if (isTeacherMachine(req)) {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Set-Cookie": `ttok=${TOKEN}; Path=/; Max-Age=2592000; SameSite=Lax`,
        "Connection": "close",
      });
      res.end(JSON.stringify({ ok: true, token: TOKEN }));
    } else {
      respond(res, 403, "application/json", JSON.stringify({ ok: false, msg: "unauthorized" }));
    }
    return;
  }

  if (!isPublic && !isTeacherMachine(req) && !hasToken(req)) {
    if (p.startsWith("/api/")) {
      respond(res, 403, "application/json", JSON.stringify({ ok: false, msg: "unauthorized" }));
    } else {
      respond(res, 403, "text/html; charset=utf-8", authPage());
    }
    return;
  }

  if (method === "GET" && p === "/api/classroom") {
    respond(res, 200, "application/json", JSON.stringify({ ok: true, classroom }));
    return;
  }

  if (method === "POST" && p === "/api/classroom") {
    readBody(req, (body) => {
      let data = {};
      try { data = JSON.parse(body || "{}"); } catch (e) { }
      if (data.clear) {
        classroom = null;
        saveClassroom();
        respond(res, 200, "application/json", JSON.stringify({ ok: true, classroom: null }));
        return;
      }
      const lat = Number(data.lat);
      const lng = Number(data.lng);
      const radius = Math.min(5000, Math.max(50, Number(data.radius) || 500));
      if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        respond(res, 400, "application/json", JSON.stringify({ ok: false, msg: "坐标无效" }));
        return;
      }
      classroom = { lat, lng, radius };
      saveClassroom();
      console.log(`[classroom] set (${lat},${lng}) r=${radius}m`);
      respond(res, 200, "application/json", JSON.stringify({ ok: true, classroom }));
    });
    return;
  }

  if (method === "POST" && p === "/api/checkin") {
    readBody(req, (body) => {
      loadRoster();
      let data = {};
      try { data = JSON.parse(body || "{}"); } catch (e) { }
      const id = String(data.id || "").trim().slice(0, 20);
      const device = String(data.device || "").trim().slice(0, 64);
      if (!id) {
        respond(res, 400, "application/json", JSON.stringify({ ok: false, msg: "请输入学号" }));
        return;
      }
      const rec = rosterMap[id];
      if (!rec) {
        respond(res, 400, "application/json", JSON.stringify({ ok: false, msg: "学号不在名单中，请核对后重试" }));
        return;
      }
      if (!session) {
        respond(res, 403, "application/json", JSON.stringify({ ok: false, msg: "签到未开始或已结束，请联系老师" }));
        return;
      }
      if (device) {
        if (bindings.byDevice[device] && bindings.byDevice[device] !== id) {
          respond(res, 403, "application/json", JSON.stringify({
            ok: false,
            msg: "该设备已绑定学号 " + bindings.byDevice[device] + "，只能提交本人学号",
          }));
          return;
        }
        if (bindings.byId[id] && bindings.byId[id] !== device) {
          respond(res, 403, "application/json", JSON.stringify({
            ok: false,
            msg: "该学号已在其他设备签到，若更换了手机请联系老师解绑",
          }));
          return;
        }
        bindings.byDevice[device] = id;
        bindings.byId[id] = device;
        saveBindings();
      }
      // 地理围栏：教室位置已设置时，签到须在 radius 米内
      let dist = -1;
      if (classroom) {
        const lat = Number(data.lat), lng = Number(data.lng);
        if (!isFinite(lat) || !isFinite(lng)) {
          respond(res, 403, "application/json", JSON.stringify({
            ok: false,
            msg: "请允许获取定位后签到",
          }));
          return;
        }
        dist = Math.round(distMeters(lat, lng, classroom.lat, classroom.lng));
        if (dist > classroom.radius) {
          respond(res, 403, "application/json", JSON.stringify({
            ok: false,
            msg: `距离教室 ${dist} 米，超过 ${classroom.radius} 米限制，无法签到`,
          }));
          return;
        }
      }
      addCheckin(id, rec.name, rec.cls, dist);
      console.log(`[checkin] ${id} ${rec.name} (${device ? "dev:" + device.slice(0, 8) : "no-device"}${dist >= 0 ? " dist:" + dist + "m" : ""})`);
      respond(res, 200, "application/json", JSON.stringify({ ok: true, name: rec.name, cls: rec.cls, dist }));
    });
    return;
  }

  if (method === "POST" && p === "/api/unbind") {
    readBody(req, (body) => {
      let data = {};
      try { data = JSON.parse(body || "{}"); } catch (e) { }
      const id = String(data.id || "").trim();
      const device = String(data.device || "").trim();
      if (!id && !device) {
        respond(res, 400, "application/json", JSON.stringify({ ok: false }));
        return;
      }
      unbindStale(id, device);
      console.log(`[unbind] ${id || device}`);
      respond(res, 200, "application/json", JSON.stringify({ ok: true }));
    });
    return;
  }

  if (method === "GET" && p === "/api/list") {
    respond(res, 200, "application/json", listJson());
    return;
  }

  if (method === "GET" && p === "/api/status") {
    const remainSec = session ? Math.max(0, Math.ceil((session.endAt - Date.now()) / 1000)) : 0;
    respond(res, 200, "application/json", JSON.stringify({
      active: !!session,
      remainSec,
      total: checkins.length,
      lastCsvFile,
    }));
    return;
  }

  if (method === "POST" && p === "/api/start") {
    readBody(req, (body) => {
      let data = {};
      try { data = JSON.parse(body || "{}"); } catch (e) { }
      const minutes = Math.min(120, Math.max(0.1, Number(data.minutes) || 5));
      startSession(minutes);
      respond(res, 200, "application/json", JSON.stringify({ ok: true, minutes }));
    });
    return;
  }

  if (method === "POST" && p === "/api/end") {
    const saved = endSession(true);
    respond(res, 200, "application/json", JSON.stringify({ ok: true, saved }));
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

    let rel;
    if (p === "/") rel = "index.html";
    else if (p === "/home") rel = "home.html";
    else if (p === "/student") rel = "student.html";
    else rel = p.slice(1);
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
