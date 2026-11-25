#!/usr/bin/env bash
set -euo pipefail

# Scream Adaptive Wallpaper — 1-Line macOS Installer (Apple Silicon + Intel)
# Installs latest Scream.app from GitHub Releases directly into Applications and launches immediately.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/lecongchien/chisaln/main/host-macos/scripts/install.sh | bash

REPO="${SCREAM_REPO:-lecongchien/chisaln}"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"

echo "===================================================================="
echo "  Scream Adaptive Wallpaper — macOS 1-Step Installer"
echo "===================================================================="

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[ERROR] This installer is for macOS only."
  exit 1
fi

echo "[1/4] Fetching latest release from GitHub (${REPO})..."
RELEASE_JSON="$(curl -fsSL "${API_URL}")" || {
  echo "[ERROR] Could not reach GitHub Releases for ${REPO}."
  echo "        Make sure a release tag (e.g. v1.0.0) has been published first."
  exit 1
}

ZIP_URL="$(printf '%s' "${RELEASE_JSON}" | grep -oE 'https://[^"]+Scream-v[^"]*-macOS-[^"]*\.zip' | head -n1 || true)"
if [[ -z "${ZIP_URL}" ]]; then
  echo "[ERROR] No macOS .zip asset found in the latest GitHub Release of ${REPO}."
  echo "        Wait for the 'Release Windows x64 & macOS Universal' Action to finish first."
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT
ZIP_FILE="${TMP_DIR}/Scream-macOS.zip"

echo "[2/4] Downloading $(basename "${ZIP_URL}")..."
curl -fL --progress-bar "${ZIP_URL}" -o "${ZIP_FILE}"

echo "[3/4] Installing Scream.app..."
pkill -x Scream >/dev/null 2>&1 || true
sleep 0.4

ditto -x -k "${ZIP_FILE}" "${TMP_DIR}/extract"
if [[ ! -d "${TMP_DIR}/extract/Scream.app" ]]; then
  echo "[ERROR] Scream.app not found inside downloaded archive."
  exit 1
fi

# Install to /Applications if writable without sudo, otherwise ~/Applications (zero password prompt!)
if [[ -w "/Applications" ]]; then
  DEST_APP="/Applications/Scream.app"
else
  mkdir -p "${HOME}/Applications"
  DEST_APP="${HOME}/Applications/Scream.app"
fi

rm -rf "${DEST_APP}"
mv "${TMP_DIR}/extract/Scream.app" "${DEST_APP}"
# Strip download quarantine attribute so macOS launches smoothly on the user's explicit install command
xattr -dr com.apple.quarantine "${DEST_APP}" >/dev/null 2>&1 || true

echo "[4/4] Launching Scream..."
open -a "${DEST_APP}"

echo "===================================================================="
echo "  Installed & launched: ${DEST_APP}"
echo "  Tip: Look for the wave-moon icon in your macOS Menu Bar!"
echo "===================================================================="
