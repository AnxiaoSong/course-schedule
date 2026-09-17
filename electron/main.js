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

function openSub(route, title) {
  const win = new BrowserWindow({
    width: 1100,
    height: 700,
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
    width: 430,
    height: 640,
    resizable: false,
    title: "课堂签到系统 · 教师端",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.loadFile(path.join(__dirname, "ui.html"));
  return win;
}

app.whenReady().then(async () => {
  if (await portBusy(PORT)) {
    dialog.showMessageBoxSync({
      type: "warning",
      title: "课堂签到系统",
      message: "签到服务已在运行中（端口 8080 被占用）。\n请先关闭正在运行的签到程序（含 start-cloud 窗口）。",
    });
    app.quit();
    return;
  }
  // 启动签到服务（server.js 顶层执行，包含 frpc 托管与退出清理）
  require(path.join(__dirname, "..", "server.js"));
  createMainWindow();
});

ipcMain.on("open", (e, data) => openSub(data.route, data.title));
ipcMain.on("open-data", () => shell.openPath(DATA_DIR));
ipcMain.on("quit", () => app.quit());

app.on("before-quit", () => {
  // 双保险：退出时强制清理 frpc 隧道
  try { exec("taskkill /F /IM frpc.exe", () => { }); } catch (e) { }
});

app.on("window-all-closed", () => {
  app.quit();
});
