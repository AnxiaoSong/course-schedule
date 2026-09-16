@echo off
chcp 65001 >nul
title Check-in Server (cloud)
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js first.
  pause
  exit /b 1
)
cd /d "%~dp0"

if not exist frp\frpc.toml (
  echo.
  echo ============================================
  echo  First time setup
  echo ============================================
  set /p TOKEN=请输入云服务器部署脚本输出的 token: 
  (
    echo serverAddr = "101.33.196.49"
    echo serverPort = 7000
    echo auth.method = "token"
    echo auth.token = "%TOKEN%"
    echo.
    echo [[proxies]]
    echo name = "checkin"
    echo type = "tcp"
    echo localIP = "127.0.0.1"
    echo localPort = 8080
    echo remotePort = 8080
  ) > frp\frpc.toml
  echo 已保存 frp\frpc.toml
)

netstat -ano | findstr ":8080 " | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo 签到服务已在运行，无需重复启动。
  start "" https://ai-song.online/projector
  pause
  exit /b 0
)

echo [1/2] 启动 frpc 内网穿透隧道...
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath '%~dp0frp\frpc.exe' -ArgumentList '-c','%~dp0frp\frpc.toml' -WindowStyle Hidden"

echo [2/2] 启动签到服务器...
set "PUBLIC_URL=https://ai-song.online/"
start "" https://ai-song.online/projector
node server.js
pause
