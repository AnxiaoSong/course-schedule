"use strict";

(function () {
  const $ = (id) => document.getElementById(id);

  const state = {
    running: false,
    students: [],
  };

  function wifi() {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.WifiCheckIn;
  }

  function status(text, on) {
    $("ciStatusText").textContent = text;
    $("ciDot").className = "ci-dot" + (on ? " on" : "");
  }

  function qrSvg(text, cell) {
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({ cellSize: cell, margin: 2 });
    } catch (e) {
      return "<div style='font-size:11px;color:#8a93a3'>二维码生成失败</div>";
    }
  }

  function escWifi(s) {
    return String(s || "").replace(/([\\;,":])/g, "\\$1");
  }

  function loadHotspotManual() {
    try { return JSON.parse(localStorage.getItem("ci-hotspot") || "{}"); } catch (e) { return {}; }
  }
  function saveHotspotManual(o) {
    localStorage.setItem("ci-hotspot", JSON.stringify(o));
  }

  function askHotspot() {
    const saved = loadHotspotManual();
    const ssid = prompt("热点名称（学生连接的 WiFi 名）", saved.ssid || "");
    if (ssid === null) return null;
    const pwd = prompt("热点密码", saved.pwd || "");
    if (pwd === null) return null;
    const o = { ssid: ssid.trim(), pwd: pwd.trim() };
    if (o.ssid) saveHotspotManual(o);
    return o;
  }

  function showQr(urls, hotspot) {
    const box = $("ciUrl");
    box.hidden = false;
    const base = "http://" + urls[0];
    const wifiCard = hotspot
      ? `<div class="qr-card" data-qr="wifi">
           <div class="qr-img" data-big="1">${qrSvg(`WIFI:T:WPA;S:${escWifi(hotspot.ssid)};P:${escWifi(hotspot.pwd)};;`, 5)}</div>
           <div class="qr-cap">① 扫码连热点</div>
           <div class="qr-sub">${hotspot.ssid}</div>
         </div>`
      : `<div class="qr-card"><div class="qr-none">未设置热点<br><b id="ciSetHot">点击设置</b></div><div class="qr-cap">① 连热点</div></div>`;

    box.innerHTML =
      `<div class="ci-url-title">学生扫码签到（两步：先连网，再签到）</div>
       <div class="qr-row">
         ${wifiCard}
         <div class="qr-card" data-qr="sign">
           <div class="qr-img" data-big="1">${qrSvg(base, 5)}</div>
           <div class="qr-cap">② 扫码签到</div>
           <div class="qr-sub">${base}</div>
         </div>
       </div>
       <div class="ci-url-title" style="margin-top:8px">
         教师监控大屏：${base}/monitor ｜ 可点二维码放大投影
       </div>`;

    const setBtn = $("ciSetHot");
    if (setBtn) setBtn.addEventListener("click", async () => {
      const o = askHotspot();
      if (o) showQr(urls, o);
    });

    box.querySelectorAll("[data-big]").forEach((el) =>
      el.addEventListener("click", () => {
        const svg = el.querySelector("svg");
        if (!svg) return;
        $("ciBigQr").innerHTML = svg.outerHTML;
        $("ciBigQr").classList.add("open");
      })
    );
  }

  async function prepareHotspot() {
    const W = wifi();
    if (!W) return null;
    try {
      const info = await W.getHotspot();
      if (info && info.ssid) return { ssid: info.ssid, pwd: info.password || "" };
    } catch (e) { }
    const manual = loadHotspotManual();
    if (manual.ssid) return { ssid: manual.ssid, pwd: manual.pwd || "" };
    return null;
  }

  function render() {
    const box = $("ciStudents");
    $("ciCopy").disabled = !state.students.length;
    if (!state.students.length) {
      box.innerHTML = `<p class="empty">暂无学生签到</p>`;
      return;
    }
    box.innerHTML = `<div class="rc-h-title">已签到（${state.students.length}）</div>` +
      state.students.map((s) =>
        `<div class="ci-row"><b>${s.name}${s.id ? ` <i>${s.id}</i>` : ""}</b><span>${s.time}</span></div>`).join("");
  }

  function onCheckin(event) {
    const name = String(event.name || "").trim().slice(0, 50);
    const id = String(event.id || "").trim().slice(0, 20);
    if (!name) return;
    const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const exist = state.students.find((s) => (id && s.id === id) || s.name === name);
    if (exist) exist.time = time + "（重签）";
    else state.students.push({ name, id, time });
    render();
    if (navigator.vibrate) navigator.vibrate(80);
  }

  async function start() {
    const W = wifi();
    if (!W) { status("教师端仅支持安卓 App", false); return; }
    try {
      const info = await W.start();
      const ips = (info.ips || []).filter((ip) => ip);
      if (!ips.length) {
        status("服务已启动，但未获取到本机 IP，请开启热点后重试", false);
        state.running = true; state.students = []; render();
        $("ciGo").textContent = "停止签到";
        return;
      }
      state.running = true;
      state.students = [];
      render();
      $("ciGo").textContent = "停止签到";
      status("签到进行中 · 等待学生扫码", true);
      const hotspot = await prepareHotspot();
      showQr(ips, hotspot);
    } catch (e) {
      status("启动失败：" + (e && e.message ? e.message : "未知"), false);
    }
  }

  async function stop() {
    try { if (wifi()) await wifi().stop(); } catch (e) { }
    state.running = false;
    $("ciGo").textContent = "开始签到";
    $("ciUrl").hidden = true;
    status(state.students.length ? `已停止 · 共签到 ${state.students.length} 人` : "已停止", false);
  }

  function copyList() {
    if (!state.students.length) return;
    const text = "签到名单 " + new Date().toLocaleDateString("zh-CN") +
      "（共 " + state.students.length + " 人）\n" +
      state.students.map((s, i) => `${i + 1}. ${s.id || "-"} ${s.name}  ${s.time}`).join("\n");
    (async () => {
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      $("ciCopy").textContent = "已复制";
      setTimeout(() => { $("ciCopy").textContent = "复制名单"; }, 1500);
    })();
  }

  function init() {
    $("ciFab").addEventListener("click", () => $("ciOverlay").classList.add("open"));
    $("ciClose").addEventListener("click", () => {
      $("ciOverlay").classList.remove("open");
    });
    $("ciOverlay").addEventListener("click", (e) => {
      if (e.target.id === "ciOverlay") $("ciClose").click();
    });
    $("ciBigQr").addEventListener("click", () => $("ciBigQr").classList.remove("open"));
    $("ciGo").addEventListener("click", () => (state.running ? stop() : start()));
    $("ciCopy").addEventListener("click", copyList);

    const W = wifi();
    if (W && W.addListener) W.addListener("checkin", onCheckin);
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
