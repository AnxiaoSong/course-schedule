@echo off
chcp 65001 >nul
echo 正在停止签到服务...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8080 " ^| findstr "LISTENING"') do taskkill /F /PID %%p >nul 2>&1
taskkill /F /IM frpc.exe >nul 2>&1
echo 已停止（node 服务器 + frpc 隧道）。
pause
