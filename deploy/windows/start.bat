@echo off
setlocal
set "APP_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%APP_DIR%scripts\run-server.ps1" -CheckOnly
if errorlevel 1 (
  echo.
  echo 启动检查失败，请根据上方提示处理后重试。
  pause >nul
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell.exe -WindowStyle Hidden -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%APP_DIR%scripts\run-server.ps1"" -LogToFile'"
exit /b 0
