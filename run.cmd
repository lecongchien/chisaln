@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

if /I "%~1"=="web" (
  node web/serve.mjs
  exit /b %errorlevel%
)

set "EXE_REL=bin\Release\net8.0-windows\Scream.exe"
set "OUT_WEB_REL=bin\Release\net8.0-windows\web"

if /I "%~1"=="--exit" (
  if exist "%EXE_REL%" "%EXE_REL%" --exit
  exit /b 0
)

set "FORCE_BUILD=0"
set "APP_ARGS="
:parse_args
if "%~1"=="" goto :args_done
if /I "%~1"=="--build" (
  set "FORCE_BUILD=1"
) else if /I "%~1"=="--rebuild" (
  set "FORCE_BUILD=1"
) else (
  set "APP_ARGS=%APP_ARGS% %1"
)
shift
goto :parse_args
:args_done

:: Single fast Unicode-safe PowerShell pass:
:: 1) Gracefully stop any running Scream instance with 80ms polling (instead of 1s ping stalls)
:: 2) Check whether Scream.exe is missing or any C#/.csproj/manifest file is newer -> exit code 10 means rebuild needed!
powershell -NoProfile -Command "$exe = '.\bin\Release\net8.0-windows\Scream.exe'; $p = Get-Process -Name Scream -ErrorAction SilentlyContinue; if ($p) { if (Test-Path $exe) { & $exe --exit | Out-Null }; $sw = [Diagnostics.Stopwatch]::StartNew(); while ($sw.ElapsedMilliseconds -lt 2500 -and (Get-Process -Name Scream -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 80 }; Get-Process -Name Scream -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue }; if ($env:FORCE_BUILD -eq '1' -or -not (Test-Path $exe)) { exit 10 }; $exeTime = (Get-Item $exe).LastWriteTimeUtc; $newer = @((Get-Item '.\Scream.csproj')) + (Get-ChildItem '.\host' -Recurse -File -Include *.cs,*.manifest) | Where-Object { $_.LastWriteTimeUtc -gt $exeTime } | Select-Object -First 1; if ($newer) { exit 10 } else { exit 0 }"
set "CHECK_RC=%errorlevel%"

if "%CHECK_RC%"=="10" (
  dotnet build -c Release --nologo -v minimal
  if errorlevel 1 exit /b %errorlevel%
) else (
  :: Fast native sync of web/ assets (~30ms vs 3-6s full MSBuild!)
  robocopy "web" "%OUT_WEB_REL%" /MIR /NFL /NDL /NJH /NJS /NC /NS /NP >nul
  if errorlevel 8 exit /b %errorlevel%
)

start "" "%EXE_REL%" %APP_ARGS%
