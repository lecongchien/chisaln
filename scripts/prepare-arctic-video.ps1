<#
.SYNOPSIS
  Convert any AI-generated Arctic Bear & Penguin video (.mp4 / .mov / .webm from Veo / Kling / Wan / Runway)
  into a lightweight, hardware-decoded 24 FPS WebM loop and sync it to Debug & Release builds automatically!
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File d:\chisaln\app\scripts\prepare-arctic-video.ps1 -InputVideo "C:\Users\ChienCNTT\Downloads\arctic_bear.mp4"
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$InputVideo,
  [int]$MaxWidth = 768,
  [int]$Fps = 24,
  [switch]$SquareCrop
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $InputVideo)) {
  throw "Khong tim thay file video: $InputVideo"
}

$outWebm = "d:\chisaln\app\web\assets\arctic-stage.webm"
$vf = if ($SquareCrop) {
  "fps=$Fps,crop='min(iw,ih)':'min(iw,ih)',scale='min($MaxWidth,iw)':-2:flags=lanczos"
} else {
  "fps=$Fps,scale='min($MaxWidth,iw)':-2:flags=lanczos"
}
Write-Host "Dang toi uu video sang VP9 WebM ($Fps FPS, max width ${MaxWidth}px)..." -ForegroundColor Cyan

# Hardware-friendly VP9 WebM (supports alpha if source has alpha, silent, fast-start loop)
& ffmpeg -y -i $InputVideo `
  -an `
  -vf $vf `
  -c:v libvpx-vp9 -crf 26 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 `
  -auto-alt-ref 0 `
  $outWebm

if ($LASTEXITCODE -ne 0) {
  throw "FFmpeg loi (exit $LASTEXITCODE)"
}

$kb = [math]::Round((Get-Item $outWebm).Length / 1KB, 1)
Write-Host "Da xuat thanh cong: $outWebm ($kb KB)" -ForegroundColor Green

# Mirror straight to BOTH Debug and Release web folders
robocopy "d:\chisaln\app\web" "d:\chisaln\app\bin\Debug\net8.0-windows\web" /MIR /NFL /NDL /NJH /NJS /NC /NS | Out-Null
robocopy "d:\chisaln\app\web" "d:\chisaln\app\bin\Release\net8.0-windows\web" /MIR /NFL /NDL /NJH /NJS /NC /NS | Out-Null
Write-Host "Da dong bo sang bin/Debug va bin/Release! Bam 'Tai lai' trong app de xem ngay." -ForegroundColor Green
