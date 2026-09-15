@echo off
setlocal
set "JAVA_HOME=%~dp0tools\jdk"
set "ANDROID_HOME=%~dp0tools\android-sdk"
set "ANDROID_SDK_ROOT=%~dp0tools\android-sdk"
set "PATH=%JAVA_HOME%\bin;%PATH%"
echo [build-local] JAVA_HOME=%JAVA_HOME%
echo [build-local] ANDROID_HOME=%ANDROID_HOME%
cd /d "%~dp0android"
call gradlew.bat assembleDebug
if errorlevel 1 (
  echo [build-local] BUILD FAILED
  exit /b 1
)
copy /Y "app\build\outputs\apk\debug\app-debug.apk" "%~dp0apk\app-debug.apk" >nul
echo [build-local] APK -^> %~dp0apk\app-debug.apk
