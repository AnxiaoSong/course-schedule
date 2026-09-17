"use strict";
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");
const { exec } = require("child_process");

const PORT = 8080;
const DATA_DIR = path.join(app.getPath("userData"), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.CHECKIN_DATA_DIR = DATA_DIR;

function portBusy(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
    s.setTimeout(800, () => { s.destroy(); resolve(false); });
  });
}

let subWindows = [];

function openSub(route, title, wide) {
  const win = new BrowserWindow({
    width: wide ? 1200 : 860,
    height: 720,
    title,
    autoHideMenuBar: true,
    backgroundColor: "#0f1428",
  });
  win.loadURL(`http://127.0.0.1:${PORT}${route}`);
  subWindows.push(win);
  win.on("closed", () => { subWindows = subWindows.filter((w) => w !== win); });
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 560,
    height: 860,
    title: "课堂签到系统 · 教师端",
    autoHideMenuBar: true,
    backgroundColor: "#f2f4f8",
  });
  win.loadURL(`http://127.0.0.1:${PORT}/`);

  // 课表页内签到/监控链接 → 拦截为新开窗口，主窗口保持课表首页
  win.webContents.on("will-navigate", (e, url) => {
    try {
      const u = new URL(url);
      if (u.port === String(PORT) && u.pathname !== "/" && u.pathname !== "/index.html") {
        e.preventDefault();
        const route = u.pathname;
        if (route === "/projector" || route === "/monitor" || route === "/home" || route === "/student") {
          openSub(route, route === "/monitor" ? "签到监控" : (route === "/projector" ? "签到投影" : "页面"), route === "/monitor" || route === "/projector");
        }
      }
    } catch (err) { }
  });

  // 关闭主窗口 = 退出程序（连带停止全部服务）
  win.on("closed", () => app.quit());
  return win;
}

app.whenReady().then(async () => {
  if (await portBusy(PORT)) {
    dialog.showMessageBoxSync({
      type: "warning",
      title: "课堂签到系统",
      message: "签到服务已在运行中（端口 8080 被占用）。\n请先关闭正在运行的签到程序。",
    });
    app.quit();
    return;
  }
  // 启动签到服务（server.js 顶层执行，包含 frpc 托管与退出清理）
  require(path.join(__dirname, "..", "server.js"));
  createMainWindow();
});

app.on("before-quit", () => {
  // 双保险：退出时强制清理 frpc 隧道
  try { exec("taskkill /F /IM frpc.exe", () => { }); } catch (e) { }
});

app.on("window-all-closed", () => {
  app.quit();
});
