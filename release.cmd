@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"

echo ====================================================================
echo   Scream Adaptive Wallpaper - 1-Step Cloud Release (Windows + macOS)
echo ====================================================================

:: Read current <Version> from Scream.csproj and suggest next patch version
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "([xml](Get-Content '.\Scream.csproj')).Project.PropertyGroup.Version | Select-Object -First 1"`) do set "CUR_VER=%%V"
if "%CUR_VER%"=="" set "CUR_VER=1.0.0"

for /f "usebackq delims=" %%N in (`powershell -NoProfile -Command "$p='%CUR_VER%'.Split('.'); if($p.Length -ge 3 -and ($p[2] -match '^\d+$')){ $p[2]=([int]$p[2]+1).ToString(); $p[0..2] -join '.' } else { '%CUR_VER%' }"`) do set "NEXT_VER=%%N"
if "%NEXT_VER%"=="" set "NEXT_VER=%CUR_VER%"

set "NEW_VER=%~1"
if "%NEW_VER%"=="" (
  echo Current version in Scream.csproj: %CUR_VER%
  echo Tip: Bump the version so installed Windows ^& macOS apps auto-update!
  set /p "NEW_VER=Enter release version [Enter = %NEXT_VER%]: "
)
if "%NEW_VER%"=="" set "NEW_VER=%NEXT_VER%"

:: Strip accidental leading 'v'
if /I "%NEW_VER:~0,1%"=="v" set "NEW_VER=%NEW_VER:~1%"
set "TAG=v%NEW_VER%"

echo.
echo [1/4] Syncing version %NEW_VER% in Scream.csproj...
if not "%NEW_VER%"=="%CUR_VER%" (
  powershell -NoProfile -Command "$p='.\Scream.csproj'; $c=[IO.File]::ReadAllText($p); $c=[regex]::Replace($c,'<Version>[^<]*</Version>','<Version>%NEW_VER%</Version>',1); [IO.File]::WriteAllText($p,$c,(New-Object Text.UTF8Encoding($false)))"
  if errorlevel 1 (
    echo [ERROR] Failed to update Scream.csproj version!
    pause
    exit /b 1
  )
)

echo [2/4] Committing current changes...
git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Release %TAG%"
  if errorlevel 1 (
    echo [ERROR] git commit failed!
    pause
    exit /b 1
  )
) else (
  echo       Working tree already clean - tagging latest commit.
)

echo [3/4] Creating/updating git tag %TAG%...
git tag -f "%TAG%"
if errorlevel 1 (
  echo [ERROR] git tag failed!
  pause
  exit /b 1
)

echo [4/4] Pushing main and %TAG% to GitHub (triggers Windows + macOS builds)...
git push origin main
if errorlevel 1 (
  echo [ERROR] git push origin main failed!
  pause
  exit /b 1
)
git push -f origin "refs/tags/%TAG%"
if errorlevel 1 (
  echo [ERROR] git push tag %TAG% failed!
  pause
  exit /b 1
)

echo.
echo ====================================================================
echo   RELEASE %TAG% TRIGGERED!
echo   GitHub Actions is now building BOTH Windows .exe and macOS .pkg/.dmg/.zip
echo   and generating latest.json + SHA256 for auto-updates.
echo.
echo   Track build progress (~2 min):
echo     https://github.com/lecongchien/chisaln/actions
echo.
echo   Public auto-update release (once green):
echo     https://github.com/lecongchien/chisaln/releases/tag/%TAG%
echo ====================================================================
pause
exit /b 0
