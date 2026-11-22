@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

if /I "%~1"=="web" (
  node web/serve.mjs
  exit /b %errorlevel%
)

set "EXE=%~dp0bin\Release\net8.0-windows\Scream.exe"

if /I "%~1"=="--exit" (
  if exist "%EXE%" "%EXE%" --exit
  exit /b 0
)

:: Stop any running instance cleanly so build never hits a file lock (MSB3027)
tasklist /FI "IMAGENAME eq Scream.exe" 2>nul | find /I "Scream.exe" >nul
if %errorlevel%==0 (
  if exist "%EXE%" (
    "%EXE%" --exit
  ) else if exist "%~dp0bin\Debug\net8.0-windows\Scream.exe" (
    "%~dp0bin\Debug\net8.0-windows\Scream.exe" --exit
  )
  for /L %%i in (1,1,6) do (
    tasklist /FI "IMAGENAME eq Scream.exe" 2>nul | find /I "Scream.exe" >nul
    if errorlevel 1 goto :build
    ping -n 2 127.0.0.1 >nul
  )
  taskkill /F /IM Scream.exe >nul 2>&1
  ping -n 2 127.0.0.1 >nul
)

:build
dotnet build -c Release --nologo -v minimal
if errorlevel 1 exit /b %errorlevel%

start "" "%EXE%" %*
