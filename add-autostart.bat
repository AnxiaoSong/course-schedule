@echo off
chcp 65001 >nul
schtasks /Create /TN "CourseCheckIn" /TR "wscript.exe \"E:\opencode-data\course-schedule\start-cloud-silent.vbs\"" /SC ONLOGON /RL LIMITED /F
if errorlevel 1 (
  echo [ERROR] 创建失败，请以管理员身份运行
) else (
  echo 已设置开机自启：登录 Windows 后自动启动签到服务
)
pause
