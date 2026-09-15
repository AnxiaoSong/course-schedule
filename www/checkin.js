"use strict";

(function () {
  const $ = (id) => document.getElementById(id);

  const state = {
    running: false,
    students: [],
  };

  function plugin() {
    return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.BleCheckIn;
  }

  function status(text, on) {
    $("ciStatusText").textContent = text;
    $("ciDot").className = "ci-dot" + (on ? " on" : "");
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
        `<div class="ci-row"><b>${s.name}</b><span>${s.time}</span></div>`).join("");
  }

  function onCheckin(event) {
    const name = String(event.name || "").trim().slice(0, 50);
    if (!name) return;
    const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const exist = state.students.find((s) => s.name === name);
    if (exist) {
      exist.time = time + "（重签）";
    } else {
      state.students.push({ name, time });
    }
    render();
    if (navigator.vibrate) navigator.vibrate(80);
  }

  async function start() {
    const Ble = plugin();
    if (!Ble) { status("教师端仅支持安卓 App", false); return; }
    try {
      const info = await Ble.isAvailable();
      if (!info.available || !info.enabled) { status("蓝牙未开启，请先打开手机蓝牙", false); return; }
      status("正在开启广播…", false);
      await Ble.start();
      state.running = true;
      state.students = [];
      render();
      $("ciGo").textContent = "停止签到";
      status("签到进行中 · 等待学生连接", true);
    } catch (e) {
      status("启动失败：" + (e && e.message ? e.message : "未知错误"), false);
    }
  }

  async function stop() {
    const Ble = plugin();
    try { if (Ble) await Ble.stop(); } catch (e) { /* ignore */ }
    state.running = false;
    $("ciGo").textContent = "开始签到";
    status(state.students.length ? `已停止 · 共签到 ${state.students.length} 人` : "已停止", false);
  }

  function copyList() {
    if (!state.students.length) return;
    const text = "签到名单 " + new Date().toLocaleDateString("zh-CN") +
      "（共 " + state.students.length + " 人）\n" +
      state.students.map((s, i) => `${i + 1}. ${s.name}  ${s.time}`).join("\n");
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

    const Ble = plugin();
    if (Ble && Ble.addListener) Ble.addListener("checkin", onCheckin);
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
