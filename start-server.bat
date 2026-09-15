@echo off
chcp 65001 >nul
title Course Schedule Check-in Server
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js first.
  pause
  exit /b 1
)
cd /d "%~dp0"
echo Starting check-in server... (close this window to stop)
start "" http://localhost:8080/projector
node server.js
pause
