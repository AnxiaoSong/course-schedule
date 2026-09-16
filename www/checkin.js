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

  function showQr(urls) {
    const box = $("ciUrl");
    box.hidden = false;
    const base = "http://" + urls[0];
    box.innerHTML =
      `<div class="ci-url-title">学生扫码签到（手机流量即可，无需连接 WiFi）</div>
       <div class="qr-row">
         <div class="qr-card qr-card-single">
           <div class="qr-img" data-big="1">${qrSvg(base, 5)}</div>
           <div class="qr-cap">扫码签到</div>
           <div class="qr-sub">${base}</div>
         </div>
       </div>
       <div class="ci-url-title" style="margin-top:8px">
         教师监控大屏：${base}/monitor ｜ 点二维码可放大投影
       </div>`;
    box.querySelectorAll("[data-big]").forEach((el) =>
      el.addEventListener("click", () => {
        const svg = el.querySelector("svg");
        if (!svg) return;
        $("ciBigQr").innerHTML = svg.outerHTML;
        $("ciBigQr").classList.add("open");
      })
    );
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
        `<div class="ci-row"><b>${s.name}${s.id ? ` <i>${s.id}</i>` : ""}${s.cls ? ` <i>${s.cls}</i>` : ""}</b><span>${s.time}</span></div>`).join("");
  }

  function localRosterName(id) {
    try {
      const idx = JSON.parse(localStorage.getItem("roster:index") || "[]");
      for (const key of idx) {
        const roster = JSON.parse(localStorage.getItem("roster:" + key) || "null");
        if (!roster) continue;
        const list = Array.isArray(roster) ? roster : roster.students || [];
        const hit = list.find((s) => String(s.id) === String(id));
        if (hit) return { name: hit.name, cls: key.replace(/班$/, "") };
      }
    } catch (e) { }
    return null;
  }

  function onCheckin(event) {
    let name = String(event.name || "").trim().slice(0, 50);
    let id = String(event.id || "").trim().slice(0, 20);
    let cls = String(event.cls || "").trim();
    if (!name && id) {
      const hit = localRosterName(id);
      if (hit) { name = hit.name; cls = cls || hit.cls; }
    }
    if (!name) return;
    const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const exist = state.students.find((s) => (id && s.id === id) || s.name === name);
    if (exist) exist.time = time + "（重签）";
    else state.students.push({ name, id, cls, time });
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
      showQr(ips);
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
