@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"

echo ====================================================================
echo   Scream Adaptive Wallpaper - Automated Release Packager (win-x64)
echo ====================================================================

:: 1. Read <Version> from Scream.csproj cleanly
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "([xml](Get-Content '.\Scream.csproj')).Project.PropertyGroup.Version | Select-Object -First 1"`) do set "APP_VER=%%V"
if "%APP_VER%"=="" set "APP_VER=1.0.0"

set "DIST_DIR=%~dp0dist"
set "STAGE_DIR=%DIST_DIR%\Scream-Portable"
set "ZIP_PATH=%DIST_DIR%\Scream-v%APP_VER%-Portable-x64.zip"
set "SETUP_PATH=%DIST_DIR%\Scream-v%APP_VER%-Setup-x64.exe"

echo [1/4] Stopping any running Scream instance...
powershell -NoProfile -Command "$p = Get-Process -Name Scream -ErrorAction SilentlyContinue; if ($p) { if (Test-Path '.\bin\Release\net8.0-windows\Scream.exe') { & '.\bin\Release\net8.0-windows\Scream.exe' --exit | Out-Null }; Start-Sleep -Milliseconds 800; Get-Process -Name Scream -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }"

echo [2/4] Publishing self-contained compressed single-file win-x64 build (v%APP_VER%)...
if exist "%STAGE_DIR%" rmdir /s /q "%STAGE_DIR%"
mkdir "%STAGE_DIR%" >nul 2>&1

if "%SCREAM_UPDATE_REPO%"=="" set "SCREAM_UPDATE_REPO=lecongchien/chisaln-releases"

dotnet publish ".\Scream.csproj" ^
  -c Release ^
  -r win-x64 ^
  --self-contained true ^
  -p:PublishSingleFile=true ^
  -p:IncludeNativeLibrariesForSelfExtract=true ^
  -p:EnableCompressionInSingleFile=true ^
  -p:DebugType=none ^
  -p:DebugSymbols=false ^
  -p:ScreamUpdateRepo=%SCREAM_UPDATE_REPO% ^
  -o "%STAGE_DIR%"
if errorlevel 1 (
  echo [ERROR] dotnet publish failed!
  exit /b 1
)

:: Remove dev-only files, XML docs, or stray PDBs if present
if exist "%STAGE_DIR%\web\serve.mjs" del /q "%STAGE_DIR%\web\serve.mjs"
del /q "%STAGE_DIR%\*.pdb" >nul 2>&1
del /q "%STAGE_DIR%\*.xml" >nul 2>&1

echo [3/4] Creating Portable ZIP archive: %ZIP_PATH%
if exist "%ZIP_PATH%" del /q "%ZIP_PATH%"
powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('%STAGE_DIR%', '%ZIP_PATH%', [System.IO.Compression.CompressionLevel]::Optimal, $false)"
if errorlevel 1 (
  echo [ERROR] Failed to create Portable ZIP archive!
  exit /b 1
)

echo [4/4] Looking for Inno Setup 6 (ISCC.exe) to compile Windows Setup Installer...
set "ISCC="
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if "%ISCC%"=="" if exist "C:\Program Files\Inno Setup 6\ISCC.exe" set "ISCC=C:\Program Files\Inno Setup 6\ISCC.exe"
if "%ISCC%"=="" if exist "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
if "%ISCC%"=="" (
  for /f "delims=" %%I in ('where ISCC.exe 2^>nul') do set "ISCC=%%I"
)

if not "%ISCC%"=="" (
  echo       Found ISCC: "%ISCC%"
  "%ISCC%" /Q "/DMyAppVersion=%APP_VER%" ".\installer\Scream.iss"
  if errorlevel 1 (
    echo [ERROR] Inno Setup compilation failed!
    exit /b 1
  )
  echo       Built Setup Installer: %SETUP_PATH%
) else (
  echo       [INFO] Inno Setup 6 not installed on this PC - Portable ZIP is ready!
  echo       To also generate Scream-v%APP_VER%-Setup-x64.exe locally, run once:
  echo         winget install JRSoftware.InnoSetup
  echo       Then re-run publish.cmd!
)

echo.
echo ====================================================================
echo   Package Summary (d:\scream\dist)
echo ====================================================================
powershell -NoProfile -Command "Get-ChildItem '%DIST_DIR%' | ForEach-Object { if ($_.PSIsContainer) { $sz = (Get-ChildItem $_.FullName -Recurse -File | Measure-Object Length -Sum).Sum; '{0,-38} {1,8:N1} MB  (folder)' -f $_.Name, ($sz / 1MB) } else { '{0,-38} {1,8:N1} MB' -f $_.Name, ($_.Length / 1MB) } }"
echo ====================================================================
exit /b 0
