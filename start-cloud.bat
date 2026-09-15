@echo off
chcp 65001 >nul
title Check-in Server (cloud mode)
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

echo [1/2] 启动 frpc 内网穿透隧道...
start "frpc tunnel" frp\frpc.exe -c frp\frpc.toml

echo [2/2] 启动签到服务器...
set "PUBLIC_URL=http://101.33.196.49:8080"
start "" http://localhost:8080/projector
node server.js
pause
