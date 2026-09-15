"use strict";

(function () {
  const $ = (id) => document.getElementById(id);

  const state = {
    running: false,
    students: [],
  };

  function ble() {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BleCheckIn;
  }
  function wifi() {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.WifiCheckIn;
  }

  function status(text, on) {
    $("ciStatusText").textContent = text;
    $("ciDot").className = "ci-dot" + (on ? " on" : "");
  }

  function showUrl(ips, port) {
    const box = $("ciUrl");
    if (!ips || !ips.length || !port) { box.hidden = true; return; }
    box.hidden = false;
    const urls = ips.map((ip) => `http://${ip}:${port}`);
    box.innerHTML = `<div class="ci-url-title">学生签到入口（连本机热点后浏览器打开）</div>` +
      urls.map((u) => `<div class="ci-url-line" data-url="${u}">${u} 📋</div>`).join("") +
      `<div class="ci-url-title" style="margin-top:6px">教师监控大屏</div>` +
      urls.map((u) => `${u.replace(/\/$/, "")}/monitor`).join(" 或 ");
    box.querySelectorAll(".ci-url-line").forEach((el) =>
      el.addEventListener("click", () => {
        const ta = document.createElement("textarea");
        ta.value = el.dataset.url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        el.textContent = el.dataset.url + " 已复制";
        setTimeout(() => { el.textContent = el.dataset.url + " 📋"; }, 1200);
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
        `<div class="ci-row"><b>${s.name}${s.id ? ` <i>${s.id}</i>` : ""}</b><span>${s.time}</span></div>`).join("");
  }

  function onCheckin(event) {
    const name = String(event.name || "").trim().slice(0, 50);
    const id = String(event.id || "").trim().slice(0, 20);
    if (!name) return;
    const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const exist = state.students.find((s) => (id && s.id === id) || s.name === name);
    if (exist) {
      exist.time = time + "（重签）";
    } else {
      state.students.push({ name, id, time });
    }
    render();
    if (navigator.vibrate) navigator.vibrate(80);
  }

  async function start() {
    const Ble = ble();
    const Wifi = wifi();
    if (!Ble && !Wifi) { status("教师端仅支持安卓 App", false); return; }

    let bleOk = false;
    if (Ble) {
      try {
        const info = await Ble.isAvailable();
        if (info.available && info.enabled) { await Ble.start(); bleOk = true; }
      } catch (e) { /* 蓝牙不可用不阻塞 WiFi 通道 */ }
    }

    try {
      if (Wifi) {
        const info = await Wifi.start();
        showUrl(info.ips, info.port);
      }
    } catch (e) {
      status("WiFi 服务启动失败：" + (e && e.message ? e.message : "未知"), false);
      return;
    }

    state.running = true;
    state.students = [];
    render();
    $("ciGo").textContent = "停止签到";
    status(bleOk ? "签到进行中 · 蓝牙+WiFi 双通道" : "签到进行中 · WiFi 通道（蓝牙未开启）", true);
  }

  async function stop() {
    try { if (ble()) await ble().stop(); } catch (e) { }
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
    $("ciGo").addEventListener("click", () => (state.running ? stop() : start()));
    $("ciCopy").addEventListener("click", copyList);

    const Ble = ble();
    if (Ble && Ble.addListener) Ble.addListener("checkin", onCheckin);
    const Wifi = wifi();
    if (Wifi && Wifi.addListener) Wifi.addListener("checkin", onCheckin);
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
